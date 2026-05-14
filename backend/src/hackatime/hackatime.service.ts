import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { createHmac } from 'crypto';

interface HackatimeTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
  created_at: number;
}

@Injectable()
export class HackatimeService {
  private readonly HACKATIME_BASE_URL = 'https://hackatime.hackclub.com';
  private readonly STATE_TTL_MS = 600000; // 10 minutes

  constructor(private prisma: PrismaService) {}

  private getStateSecret(): string {
    const secret = process.env.STATE_SECRET || process.env.JWT_SECRET;
    if (!secret) {
      throw new HttpException(
        'STATE_SECRET not configured',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
    return secret;
  }

  private signState(payload: object): string {
    const data = JSON.stringify(payload);
    const signature = createHmac('sha256', this.getStateSecret())
      .update(data)
      .digest('hex');
    return Buffer.from(JSON.stringify({ data, signature })).toString(
      'base64url',
    );
  }

  private verifyState(encodedState: string): {
    userId: number;
    timestamp: number;
  } {
    try {
      const { data, signature } = JSON.parse(
        Buffer.from(encodedState, 'base64url').toString(),
      );
      const expectedSignature = createHmac('sha256', this.getStateSecret())
        .update(data)
        .digest('hex');

      if (signature !== expectedSignature) {
        throw new UnauthorizedException('Invalid state signature');
      }

      const payload = JSON.parse(data);

      if (Date.now() - payload.timestamp > this.STATE_TTL_MS) {
        throw new UnauthorizedException('State expired');
      }

      return payload;
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new BadRequestException('Invalid state parameter');
    }
  }

  getLinkUrl(userId: number): { url: string } {
    const clientId = process.env.HACKATIME_CLIENT_ID;
    const redirectUri = process.env.HACKATIME_REDIRECT_URI;

    if (!clientId || !redirectUri) {
      throw new HttpException(
        'Hackatime OAuth not configured',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    const state = this.signState({
      userId,
      timestamp: Date.now(),
    });

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'profile read',
      state,
    });

    return {
      url: `${this.HACKATIME_BASE_URL}/oauth/authorize?${params.toString()}`,
    };
  }

  async handleCallback(
    code: string,
    state: string,
  ): Promise<{ message: string; hackatimeUserId: string }> {
    const clientId = process.env.HACKATIME_CLIENT_ID;
    const clientSecret = process.env.HACKATIME_CLIENT_SECRET;
    const redirectUri = process.env.HACKATIME_REDIRECT_URI;

    if (!clientId || !clientSecret || !redirectUri) {
      throw new HttpException(
        'Hackatime OAuth not configured',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    if (!state) {
      throw new BadRequestException('Missing state parameter');
    }

    const { userId } = this.verifyState(state);

    const tokenResponse = await fetch(
      `${this.HACKATIME_BASE_URL}/oauth/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          code,
          grant_type: 'authorization_code',
        }).toString(),
      },
    );

    if (!tokenResponse.ok) {
      const error = await tokenResponse.text();
      console.error('Hackatime token exchange failed:', error);
      throw new UnauthorizedException('Failed to authenticate with Hackatime');
    }

    const tokens: HackatimeTokenResponse = await tokenResponse.json();

    const userInfoResponse = await fetch(
      `${this.HACKATIME_BASE_URL}/api/v1/authenticated/me`,
      {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      },
    );

    if (!userInfoResponse.ok) {
      throw new UnauthorizedException(
        'Failed to fetch user info from Hackatime',
      );
    }

    const userInfo = await userInfoResponse.json();
    const hackatimeUserId = userInfo.id?.toString();

    if (!hackatimeUserId) {
      throw new BadRequestException('Could not determine Hackatime user ID');
    }

    const existingLink = await this.prisma.user.findFirst({
      where: {
        hackatimeAccount: hackatimeUserId,
        NOT: { userId },
      },
      select: { userId: true },
    });

    if (existingLink) {
      throw new BadRequestException(
        'This Hackatime account is already linked to another user',
      );
    }

    await this.prisma.user.update({
      where: { userId },
      data: {
        hackatimeAccount: hackatimeUserId,
        hackatimeAccessToken: tokens.access_token,
      },
    });

    return {
      message: 'Hackatime account linked successfully',
      hackatimeUserId,
    };
  }

  async checkHackatimeAccountStatus(userEmail: string): Promise<any> {
    const user = await this.prisma.user.findUnique({
      where: { email: userEmail },
      select: {
        email: true,
        hackatimeAccount: true,
        hackatimeAccessToken: true,
      },
    });

    if (!user) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }

    if (!user.hackatimeAccessToken) {
      return {
        email: user.email,
        hasHackatimeAccount: false,
        hackatimeAccountId: null,
        tokenValid: false,
      };
    }

    const res = await fetch(
      `${this.HACKATIME_BASE_URL}/api/v1/authenticated/me`,
      {
        headers: { Authorization: `Bearer ${user.hackatimeAccessToken}` },
      },
    );

    return {
      email: user.email,
      hasHackatimeAccount: true,
      hackatimeAccountId: user.hackatimeAccount || null,
      tokenValid: res.ok,
    };
  }

  async getAllHackatimeProjects(userEmail: string): Promise<any> {
    const user = await this.prisma.user.findUnique({
      where: { email: userEmail },
    });

    if (!user) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }

    if (!user.hackatimeAccount) {
      throw new HttpException(
        'No Hackatime account linked to this user',
        HttpStatus.NOT_FOUND,
      );
    }

    if (!user.hackatimeAccessToken) {
      throw new HttpException(
        'Hackatime access token not available. Please relink your account.',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const startDate = new Date(
      process.env.HACKATIME_CUTOFF_DATE || '2026-02-21T00:00:00Z',
    )
      .toISOString()
      .split('T')[0];
    const res = await fetch(
      `${this.HACKATIME_BASE_URL}/api/v1/authenticated/projects?start_date=${startDate}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${user.hackatimeAccessToken}`,
        },
      },
    );

    if (!res.ok) {
      if (res.status === 404) {
        throw new HttpException(
          'Hackatime projects not found for this user',
          HttpStatus.NOT_FOUND,
        );
      }
      throw new HttpException(
        'Failed to fetch hackatime projects',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    const data = await res.json();
    return this.stripHackatimePlaceholders(data);
  }

  // Hackatime emits sentinel project names like `<<LAST_PROJECT>>` that aren't
  // real projects and shouldn't be selectable by users.
  private isHackatimePlaceholderName(name: unknown): boolean {
    return typeof name === 'string' && /^<<.*>>$/.test(name.trim());
  }

  private stripHackatimePlaceholders(data: any): any {
    if (Array.isArray(data)) {
      return data.filter(
        (project: any) =>
          !this.isHackatimePlaceholderName(
            project?.name || project?.projectName || project,
          ),
      );
    }

    if (data?.projects && Array.isArray(data.projects)) {
      return {
        ...data,
        projects: data.projects.filter(
          (project: any) =>
            !this.isHackatimePlaceholderName(
              project?.name || project?.projectName || project,
            ),
        ),
      };
    }

    return data;
  }

  /**
   * Fetch a Hackatime account's project names (already stripped of placeholder
   * sentinels). Used by the CSV export, which needs raw counts across many
   * users without paying for per-user email/db lookups. Returns null if the
   * Hackatime API call fails so the caller can distinguish unknown from zero.
   */
  async fetchHackatimeProjectNames(
    accessToken: string,
  ): Promise<string[] | null> {
    const startDate = new Date(
      process.env.HACKATIME_CUTOFF_DATE || '2026-02-21T00:00:00Z',
    )
      .toISOString()
      .split('T')[0];

    let res: globalThis.Response;
    try {
      res = await fetch(
        `${this.HACKATIME_BASE_URL}/api/v1/authenticated/projects?start_date=${startDate}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );
    } catch {
      return null;
    }
    if (!res.ok) return null;
    const data = await res.json();
    const stripped = this.stripHackatimePlaceholders(data);
    const list = Array.isArray(stripped)
      ? stripped
      : Array.isArray(stripped?.projects)
        ? stripped.projects
        : [];
    return list
      .map((p: any) =>
        typeof p === 'string' ? p : p?.name || p?.projectName || null,
      )
      .filter((name: unknown): name is string => typeof name === 'string');
  }

  async getUnlinkedHackatimeProjects(userEmail: string): Promise<any> {
    const allProjects = await this.getAllHackatimeProjects(userEmail);

    const user = await this.prisma.user.findUnique({
      where: { email: userEmail },
      include: {
        projects: {
          where: { deletedAt: null },
          select: { nowHackatimeProjects: true },
        },
      },
    });

    if (!user) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }

    const linkedProjectNames = new Set<string>();
    user.projects.forEach((project) => {
      if (project.nowHackatimeProjects) {
        project.nowHackatimeProjects.forEach((name) =>
          linkedProjectNames.add(name),
        );
      }
    });

    if (Array.isArray(allProjects)) {
      return allProjects.filter(
        (project: any) =>
          !linkedProjectNames.has(
            project.name || project.projectName || project,
          ),
      );
    }

    if (allProjects.projects && Array.isArray(allProjects.projects)) {
      return {
        ...allProjects,
        projects: allProjects.projects.filter(
          (project: any) =>
            !linkedProjectNames.has(
              project.name || project.projectName || project,
            ),
        ),
      };
    }

    if (allProjects.name || allProjects.projectName) {
      const projectName = allProjects.name || allProjects.projectName;
      if (linkedProjectNames.has(projectName)) {
        throw new HttpException(
          'All hackatime projects are already linked',
          HttpStatus.NOT_FOUND,
        );
      }
    }

    return allProjects;
  }

  async getLinkedHackatimeProjects(
    userEmail: string,
    projectId: number,
  ): Promise<any> {
    const user = await this.prisma.user.findUnique({
      where: { email: userEmail },
      select: { userId: true },
    });

    if (!user) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }

    const project = await this.prisma.project.findUnique({
      where: { projectId },
      select: { nowHackatimeProjects: true, userId: true },
    });

    if (!project) {
      throw new HttpException('Project not found', HttpStatus.NOT_FOUND);
    }

    if (project.userId !== user.userId) {
      throw new ForbiddenException('Access denied');
    }

    const allProjects = await this.getAllHackatimeProjects(userEmail);

    const linkedProjectNames = new Set<string>(
      project.nowHackatimeProjects || [],
    );

    if (Array.isArray(allProjects)) {
      return allProjects.filter((project: any) =>
        linkedProjectNames.has(project.name || project.projectName || project),
      );
    }

    if (allProjects.projects && Array.isArray(allProjects.projects)) {
      return {
        ...allProjects,
        projects: allProjects.projects.filter((project: any) =>
          linkedProjectNames.has(
            project.name || project.projectName || project,
          ),
        ),
      };
    }

    if (allProjects.name || allProjects.projectName) {
      const projectName = allProjects.name || allProjects.projectName;
      if (linkedProjectNames.has(projectName)) {
        return allProjects;
      }
      return Array.isArray(allProjects) ? [] : { ...allProjects, projects: [] };
    }

    return allProjects;
  }

  /**
   * Live per-Hackatime-project hour breakdown for a Project's
   * `nowHackatimeProjects`. Used by reviewers so the UI can show real values
   * instead of a fake even split. Returns 0 hours per project when the user
   * has no Hackatime account/token (no stored breakdown to fall back on).
   */
  async getProjectHoursBreakdown(
    projectId: number,
  ): Promise<Array<{ name: string; hours: number }>> {
    const project = await this.prisma.project.findUnique({
      where: { projectId },
      select: {
        nowHackatimeProjects: true,
        user: {
          select: {
            hackatimeAccount: true,
            hackatimeAccessToken: true,
            hackatimeStartDate: true,
          },
        },
      },
    });

    if (!project || !project.nowHackatimeProjects?.length) return [];

    const names = project.nowHackatimeProjects;
    const account = project.user?.hackatimeAccount;
    const token = project.user?.hackatimeAccessToken;

    if (!account || !token) {
      return names.map((name) => ({ name, hours: 0 }));
    }

    const cutoffDate =
      project.user.hackatimeStartDate ??
      new Date(process.env.HACKATIME_CUTOFF_DATE || '2026-02-21T00:00:00Z');

    const durationsMap = await this.fetchHackatimePerProjectDurations(
      account,
      names,
      token,
      cutoffDate,
    );

    return names.map((name) => ({
      name,
      // seconds → hours, rounded to 1dp to match the UI display.
      hours: Math.round(((durationsMap.get(name) ?? 0) / 3600) * 10) / 10,
    }));
  }

  // Hackatime categories that count as non-coding time for the reviewer's
  // AI-vs-non-AI breakdown. "ai coding" is AI-assisted prompting; the others
  // are time the user wasn't actually building (browsing, meetings, chat).
  private readonly AI_BREAKDOWN_CATEGORIES = [
    'ai coding',
    'browsing',
    'meeting',
    'communicating',
  ];

  /**
   * Live per-project hour breakdown — aggregate plus per-Hackatime-project
   * rows, each split into AI vs non-AI by Hackatime category. Two calls to
   * Hackatime's `features=projects` endpoint (one unfiltered, one with the
   * AI category filter); the deltas are non-AI. Aggregate numbers sum the
   * per-project values — not deduplicated — to keep the chart and the
   * per-project breakdown internally consistent.
   */
  async getProjectHourBreakdown(projectId: number): Promise<{
    totalHours: number;
    aiHours: number;
    nonAiHours: number;
    perProject: Array<{
      name: string;
      totalHours: number;
      aiHours: number;
      nonAiHours: number;
    }>;
  }> {
    const project = await this.prisma.project.findUnique({
      where: { projectId },
      select: {
        nowHackatimeProjects: true,
        user: {
          select: {
            hackatimeAccount: true,
            hackatimeAccessToken: true,
            hackatimeStartDate: true,
          },
        },
      },
    });

    const empty = {
      totalHours: 0,
      aiHours: 0,
      nonAiHours: 0,
      perProject: [] as Array<{
        name: string;
        totalHours: number;
        aiHours: number;
        nonAiHours: number;
      }>,
    };

    if (!project || !project.nowHackatimeProjects?.length) return empty;

    const names = project.nowHackatimeProjects;
    const account = project.user?.hackatimeAccount;
    const token = project.user?.hackatimeAccessToken;

    if (!account || !token) {
      return {
        ...empty,
        perProject: names.map((name) => ({
          name,
          totalHours: 0,
          aiHours: 0,
          nonAiHours: 0,
        })),
      };
    }

    const cutoffDate =
      project.user.hackatimeStartDate ??
      new Date(process.env.HACKATIME_CUTOFF_DATE || '2026-02-21T00:00:00Z');

    const [totalDurations, aiDurations] = await Promise.all([
      this.fetchHackatimePerProjectDurations(account, names, token, cutoffDate),
      this.fetchHackatimePerProjectDurations(
        account,
        names,
        token,
        cutoffDate,
        this.AI_BREAKDOWN_CATEGORIES,
      ),
    ]);

    const round1 = (n: number) => Math.round(n * 10) / 10;
    const perProject = names.map((name) => {
      const totalHours = round1((totalDurations.get(name) ?? 0) / 3600);
      const aiHours = round1((aiDurations.get(name) ?? 0) / 3600);
      // Clamp: dedup/rounding on Hackatime's side can put AI > total by a
      // fraction; a negative non-AI value would break the bar chart math.
      const nonAiHours = Math.max(0, round1(totalHours - aiHours));
      return { name, totalHours, aiHours, nonAiHours };
    });

    const totalHours = round1(perProject.reduce((s, p) => s + p.totalHours, 0));
    const aiHours = round1(perProject.reduce((s, p) => s + p.aiHours, 0));
    const nonAiHours = Math.max(0, round1(totalHours - aiHours));

    return { totalHours, aiHours, nonAiHours, perProject };
  }

  async getTotalNowHackatimeHours(userId: number): Promise<number> {
    const result = await this.prisma.project.aggregate({
      where: { userId, deletedAt: null },
      _sum: { nowHackatimeHours: true },
    });
    return result._sum.nowHackatimeHours ?? 0;
  }

  async getTotalApprovedHours(userId: number): Promise<number> {
    const result = await this.prisma.project.aggregate({
      where: { userId, deletedAt: null },
      _sum: { approvedHours: true },
    });
    return result._sum.approvedHours ?? 0;
  }

  async getActiveCodersToday(): Promise<number> {
    const latest = await this.prisma.historicalMetric.findFirst({
      where: { metric: 'dau' },
      orderBy: { date: 'desc' },
      select: { value: true },
    });
    return (latest?.value as number) ?? 0;
  }

  async recalculateNowHackatimeHours(
    userId: number,
  ): Promise<{ updatedProjects: number; totalNowHackatimeHours: number }> {
    const user = await this.prisma.user.findUnique({
      where: { userId },
      select: {
        hackatimeAccount: true,
        hackatimeAccessToken: true,
        hackatimeStartDate: true,
        projects: {
          where: { deletedAt: null },
          select: {
            projectId: true,
            nowHackatimeProjects: true,
          },
        },
      },
    });

    if (!user) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }

    if (!user.hackatimeAccount) {
      throw new HttpException(
        'No Hackatime account linked to this user',
        HttpStatus.NOT_FOUND,
      );
    }

    if (!user.hackatimeAccessToken) {
      throw new HttpException(
        'Hackatime access token not available. Please relink your account.',
        HttpStatus.UNAUTHORIZED,
      );
    }

    if (!user.projects || user.projects.length === 0) {
      return { updatedProjects: 0, totalNowHackatimeHours: 0 };
    }

    // Per-project try/catch: if Hackatime's dedup endpoint flakes for one
    // project, don't take down the whole sweep AND don't write 0 — leave the
    // existing nowHackatimeHours value in place so a transient failure can't
    // wipe stored hours.
    const results = await Promise.all(
      user.projects.map(async (project) => {
        try {
          const totalHours = await this.calculateProjectHours(
            user,
            project.nowHackatimeProjects || [],
          );
          await this.prisma.project.update({
            where: { projectId: project.projectId },
            data: { nowHackatimeHours: totalHours },
          });
          return true;
        } catch (err) {
          console.error(
            `recalculateNowHackatimeHours: project ${project.projectId} failed`,
            err,
          );
          return false;
        }
      }),
    );

    const updatedProjects = results.filter(Boolean).length;
    const totalNowHackatimeHours = await this.getTotalNowHackatimeHours(userId);

    return { updatedProjects, totalNowHackatimeHours };
  }

  // Per-Hackatime-project durations for the breakdown UI. Each entry is the
  // raw `total_seconds` for that project — these may overlap, so do not sum
  // them to get a user total (use `fetchDeduplicatedTotalSeconds` instead).
  private async fetchHackatimePerProjectDurations(
    hackatimeAccount: string,
    projectNames: string[],
    accessToken: string,
    cutoffDate: Date,
    categories?: string[],
  ): Promise<Map<string, number>> {
    const durationsMap = new Map<string, number>();
    for (const projectName of projectNames) {
      durationsMap.set(projectName, 0);
    }
    if (projectNames.length === 0) return durationsMap;

    const startDate = cutoffDate.toISOString().split('T')[0];
    const params = new URLSearchParams({
      features: 'projects',
      start_date: startDate,
      filter_by_project: projectNames.join(','),
    });
    if (categories && categories.length > 0) {
      params.set('filter_by_category', categories.join(','));
    }
    const uri = `${this.HACKATIME_BASE_URL}/api/v1/users/${hackatimeAccount}/stats?${params.toString()}`;

    try {
      const response = await fetch(uri, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (response.ok) {
        const responseData = await response.json();
        const projects = responseData?.data?.projects;

        if (projects && Array.isArray(projects)) {
          for (const project of projects) {
            const name = project?.name;
            if (typeof name === 'string' && projectNames.includes(name)) {
              const duration =
                typeof project?.total_seconds === 'number'
                  ? project.total_seconds
                  : 0;
              durationsMap.set(name, duration);
            }
          }
        }
      }
    } catch (error) {
      console.error('Error fetching hackatime stats:', error);
    }

    return durationsMap;
  }

  // Hackatime returns deduplicated time across overlapping project heartbeats
  // when called with `total_seconds=true&filter_by_project=<csv>`. Summing
  // per-project `total_seconds` would double-count any minute where the user
  // logged time against two of these projects at once.
  private async fetchDeduplicatedTotalSeconds(
    hackatimeAccount: string,
    projectNames: string[],
    accessToken: string,
    cutoffDate: Date,
    categories?: string[],
  ): Promise<number> {
    if (projectNames.length === 0) return 0;

    const startDate = cutoffDate.toISOString().split('T')[0];
    const params = new URLSearchParams({
      features: 'projects',
      start_date: startDate,
      boundary_aware: 'true',
      total_seconds: 'true',
      filter_by_project: projectNames.join(','),
    });
    if (categories && categories.length > 0) {
      params.set('filter_by_category', categories.join(','));
    }
    const uri = `${this.HACKATIME_BASE_URL}/api/v1/users/${hackatimeAccount}/stats?${params.toString()}`;

    try {
      const response = await fetch(uri, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new UnauthorizedException(
            'Hackatime denied access to your stats. Enable "Public Stats Lookup" in your Hackatime settings, or re-link your Hackatime account.',
          );
        }
        throw new Error(
          `Hackatime dedup stats returned ${response.status} for ${hackatimeAccount}`,
        );
      }

      const responseData = await response.json();
      // With `total_seconds=true`, Hackatime returns `{ total_seconds: <n> }`
      // at the top level — NOT under `data`. Reading the wrong path here
      // silently returned 0 and zeroed users' nowHackatimeHours on refresh.
      const totalSeconds = responseData?.total_seconds;
      if (typeof totalSeconds !== 'number') {
        throw new Error(
          `Hackatime dedup response missing total_seconds: ${JSON.stringify(responseData).slice(0, 200)}`,
        );
      }
      return totalSeconds;
    } catch (error) {
      console.error('Error fetching hackatime stats:', error);
      throw error;
    }
  }

  /**
   * Canonical "compute nowHackatimeHours for a project" entry point.
   * Hits Hackatime's user-OAuth dedup endpoint so overlapping heartbeats
   * across the user's linked projects are counted once. All call sites that
   * write `Project.nowHackatimeHours` must go through this so submission-time,
   * user-recalc, and admin-recalc produce identical numbers.
   *
   * Throws when the request fails (HTTP error, missing field, etc.) — callers
   * should treat this as "leave the existing value alone", not "write 0".
   */
  async calculateProjectHours(
    user: {
      hackatimeAccount: string | null;
      hackatimeAccessToken: string | null;
      hackatimeStartDate?: Date | null;
    },
    projectNames: string[],
  ): Promise<number> {
    if (projectNames.length === 0) return 0;
    if (!user.hackatimeAccount || !user.hackatimeAccessToken) {
      throw new HttpException(
        'User must have a linked Hackatime account with a valid access token to calculate hours.',
        HttpStatus.BAD_REQUEST,
      );
    }
    const cutoffDate =
      user.hackatimeStartDate ??
      new Date(process.env.HACKATIME_CUTOFF_DATE || '2026-02-21T00:00:00Z');
    const totalSeconds = await this.fetchDeduplicatedTotalSeconds(
      user.hackatimeAccount,
      projectNames,
      user.hackatimeAccessToken,
      cutoffDate,
    );
    return Math.round((totalSeconds / 3600) * 10) / 10;
  }

  async getAccessToken(userId: number): Promise<string | null> {
    const user = await this.prisma.user.findUnique({
      where: { userId },
      select: { hackatimeAccessToken: true },
    });
    return user?.hackatimeAccessToken || null;
  }

  async unlinkAccount(userId: number): Promise<{ message: string }> {
    await this.prisma.user.update({
      where: { userId },
      data: {
        hackatimeAccount: null,
        hackatimeAccessToken: null,
      },
    });
    return { message: 'Hackatime account unlinked successfully' };
  }
}
