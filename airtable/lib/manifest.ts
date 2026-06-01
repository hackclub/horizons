import { MANIFEST_BASE_URL, MANIFEST_YSWS_ID } from './env';

export interface ManifestSubmission {
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

export function isManifestEnabled(): boolean {
  return !!(MANIFEST_BASE_URL && MANIFEST_YSWS_ID);
}

/**
 * Lookup a project in the manifest by its Code URL. Returns null on 404 or
 * any non-OK response so callers can degrade gracefully.
 */
export async function lookupManifest(
  codeUrl: string,
): Promise<ManifestProject | null> {
  if (!isManifestEnabled() || !codeUrl) return null;
  const url = `${MANIFEST_BASE_URL}/api/lookup?codeUrl=${encodeURIComponent(codeUrl)}`;
  try {
    const res = await fetch(url);
    if (res.status === 404) return null;
    if (!res.ok) {
      console.warn(
        `[manifest] lookup ${res.status} for ${codeUrl}: ${await res.text().catch(() => '')}`,
      );
      return null;
    }
    return (await res.json()) as ManifestProject;
  } catch (err) {
    console.warn(`[manifest] lookup threw for ${codeUrl}:`, err);
    return null;
  }
}

/**
 * Decide whether a Code URL is "in unified already".
 *
 * Rule (mirrors what the user asked for): a project is considered to be in
 * unified once it has at least one submission with shipStatus === 'shipped'.
 * Drafts — including Horizons' own bootstrap draft that's created on project
 * create — do not count.
 */
export function isInUnified(manifest: ManifestProject | null): boolean {
  if (!manifest) return false;
  return manifest.submissions.some((s) => s.shipStatus === 'shipped');
}
