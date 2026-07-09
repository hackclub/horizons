import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma.service';

const LAPSE_API_BASE = 'https://api.lapse.hackclub.com';

/** Timelapse object as returned by the Lapse API (`/timelapse/findByUser`). */
interface LapseApiTimelapse {
  id: string;
  name: string;
  description?: string;
  visibility: 'UNLISTED' | 'PUBLIC' | 'FAILED_PROCESSING';
  createdAt: number;
  duration: number;
  playbackUrl: string | null;
  thumbnailUrl: string | null;
  // Only present when the API token has admin permissions (or owns the
  // timelapse). Matching against Hackatime projects depends on it.
  private?: {
    hackatimeProject: string | null;
    sourceDraftId: string | null;
  };
}

interface LapseApiUser {
  id: string;
  handle: string;
  displayName: string;
}

export interface ProjectLapsesResult {
  lapseUser: LapseApiUser | null;
  timelapses: {
    id: string;
    name: string;
    hackatimeProject: string | null;
    playbackUrl: string | null;
    thumbnailUrl: string | null;
    duration: number;
    visibility: string;
    createdAt: string;
  }[];
  otherTimelapseCount: number;
  error?: string;
}

@Injectable()
export class LapseService implements OnModuleInit {
  private readonly logger = new Logger(LapseService.name);
  private token: string | null = null;

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {}

  onModuleInit() {
    this.token = this.configService.get<string>('LAPSE_API_TOKEN') ?? null;
    if (!this.token) {
      this.logger.warn(
        'No LAPSE_API_TOKEN configured — Lapse lookups will be unavailable',
      );
    }
  }

  private async lapseFetch(
    path: string,
    params: Record<string, string>,
  ): Promise<{ ok: boolean; data?: any; error?: string }> {
    const url = `${LAPSE_API_BASE}${path}?${new URLSearchParams(params)}`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${this.token}` },
    });
    const body = await response.json().catch(() => null);
    if (!response.ok || !body?.ok) {
      this.logger.warn(
        `Lapse API error (${response.status}) for ${path}: ${JSON.stringify(body)}`,
      );
      return {
        ok: false,
        error: body?.error ?? `Lapse API error ${response.status}`,
      };
    }
    return { ok: true, data: body.data };
  }

  /**
   * Find the submitter's Lapse account (via their Hackatime ID) and return
   * their timelapses published against the project's linked Hackatime
   * projects. Timelapses published to other (or no) Hackatime projects are
   * only counted, not returned.
   */
  async getProjectLapses(projectId: number): Promise<ProjectLapsesResult> {
    const project = await this.prisma.project.findUnique({
      where: { projectId },
      select: {
        nowHackatimeProjects: true,
        user: { select: { hackatimeAccount: true } },
      },
    });
    if (!project) throw new NotFoundException('Project not found');

    const empty: ProjectLapsesResult = {
      lapseUser: null,
      timelapses: [],
      otherTimelapseCount: 0,
    };

    if (!this.token) {
      return { ...empty, error: 'Lapse API not configured' };
    }

    const hackatimeId = Number(project.user?.hackatimeAccount);
    if (!Number.isInteger(hackatimeId) || hackatimeId < 1) {
      return empty;
    }

    try {
      const userRes = await this.lapseFetch('/user/query', {
        hackatimeId: String(hackatimeId),
      });
      if (!userRes.ok) return { ...empty, error: userRes.error };

      const lapseUser: LapseApiUser | null = userRes.data?.user ?? null;
      if (!lapseUser) return empty;

      const timelapsesRes = await this.lapseFetch('/timelapse/findByUser', {
        user: lapseUser.id,
      });
      if (!timelapsesRes.ok) {
        return { ...empty, lapseUser, error: timelapsesRes.error };
      }

      const all: LapseApiTimelapse[] = timelapsesRes.data?.timelapses ?? [];
      const linkedNames = new Set(project.nowHackatimeProjects);
      const matched = all.filter(
        (t) =>
          t.private?.hackatimeProject != null &&
          linkedNames.has(t.private.hackatimeProject),
      );

      return {
        lapseUser: {
          id: lapseUser.id,
          handle: lapseUser.handle,
          displayName: lapseUser.displayName,
        },
        timelapses: matched
          .sort((a, b) => b.createdAt - a.createdAt)
          .map((t) => ({
            id: t.id,
            name: t.name,
            hackatimeProject: t.private?.hackatimeProject ?? null,
            playbackUrl: t.playbackUrl,
            thumbnailUrl: t.thumbnailUrl,
            duration: t.duration,
            visibility: t.visibility,
            createdAt: new Date(t.createdAt).toISOString(),
          })),
        otherTimelapseCount: all.length - matched.length,
      };
    } catch (error) {
      this.logger.error(`Lapse fetch failed for project ${projectId}: ${error}`);
      return { ...empty, error: 'Failed to reach Lapse API' };
    }
  }
}
