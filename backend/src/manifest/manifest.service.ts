import { Injectable, Logger } from '@nestjs/common';

interface ManifestSubmission {
  submissionId: string;
  ysws: string | null;
  yswsName: string | null;
  shipStatus: 'draft' | 'shipped';
  hoursShipped: number | null;
  airtableRecord: string | null;
  approvedAt: string | null;
  shippedAt: string | null;
  createdAt: string;
}

export interface ManifestProject {
  projectId: string;
  codeUrl: string;
  createdAt: string;
  submissions: ManifestSubmission[];
  warning?: string;
}

@Injectable()
export class ManifestService {
  private readonly logger = new Logger(ManifestService.name);
  private readonly baseUrl: string;
  private readonly yswsId: string;
  private readonly enabled: boolean;

  constructor() {
    this.baseUrl = (process.env.MANIFEST_BASE_URL || '').replace(/\/$/, '');
    this.yswsId = process.env.MANIFEST_YSWS_ID || '';
    this.enabled = !!(this.baseUrl && this.yswsId);

    if (!this.enabled) {
      this.logger.warn(
        'Manifest service not configured — set MANIFEST_BASE_URL and MANIFEST_YSWS_ID to enable',
      );
    } else {
      this.logger.log(
        `Manifest enabled — base=${this.baseUrl} ysws=${this.yswsId}`,
      );
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Create a draft submission for the given codeUrl. Manifest finds-or-creates
   * the project keyed on codeUrl and attaches a new draft for our YSWS.
   * Fire-and-forget safe at call site — returns null on any error.
   */
  async createDraft(codeUrl: string): Promise<ManifestProject | null> {
    if (!this.enabled) return null;
    if (!codeUrl) return null;

    try {
      const response = await fetch(`${this.baseUrl}/api/draft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ysws: this.yswsId, codeUrl }),
      });

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        this.logger.error(
          `Manifest draft failed (${response.status}) for ${codeUrl}: ${body}`,
        );
        return null;
      }

      return (await response.json()) as ManifestProject;
    } catch (error) {
      this.logger.error(`Manifest draft request threw for ${codeUrl}`, error);
      return null;
    }
  }

  /**
   * Look up a project by its codeUrl. Returns null on 404 or any error so
   * callers can degrade gracefully (e.g. reviewer UI just hides the panel).
   */
  async lookup(codeUrl: string): Promise<ManifestProject | null> {
    if (!this.enabled) return null;
    if (!codeUrl) return null;

    try {
      const url = `${this.baseUrl}/api/lookup?codeUrl=${encodeURIComponent(codeUrl)}`;
      const response = await fetch(url);

      if (response.status === 404) return null;
      if (!response.ok) {
        this.logger.error(
          `Manifest lookup failed (${response.status}) for ${codeUrl}`,
        );
        return null;
      }

      return (await response.json()) as ManifestProject;
    } catch (error) {
      this.logger.error(`Manifest lookup request threw for ${codeUrl}`, error);
      return null;
    }
  }
}
