import { MANIFEST_BASE_URL, MANIFEST_YSWS_ID } from './env';

const HORIZONS_YSWS_ID = MANIFEST_YSWS_ID;

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

/**
 * True when every shipped submission for this project is to Horizons
 * (i.e. there's no cross-listing to another YSWS). Returns false when
 * there are no shipped submissions at all.
 */
export function isHorizonsOnly(manifest: ManifestProject | null): boolean {
  if (!manifest || !HORIZONS_YSWS_ID) return false;
  const shipped = manifest.submissions.filter(
    (s) => s.shipStatus === 'shipped',
  );
  if (shipped.length === 0) return false;
  return shipped.every((s) => s.ysws === HORIZONS_YSWS_ID);
}

/**
 * Human-readable label for the Airtable "In Unified Already?" column.
 * Returns "submitted to <ysws name(s)>" when at least one shipped submission
 * exists, otherwise "not submitted to db".
 *
 * When a project ships to Horizons *and* to another YSWS, only the
 * non-Horizons names are listed — the Horizons row is the boring case and
 * gets drowned out by the "real" cross-listing. Horizons-only matches still
 * surface as "submitted to Horizons".
 *
 * If `currentHours` is provided, appends a delta against the sum of
 * `hoursShipped` for every shipped submission in the manifest excluding
 * Horizons itself (drafts also excluded). Positive = Horizons is granting
 * more hours than the other YSWS have already paid out for this code.
 * Formatted as "(+Xhr from previous)" or "(-Xhr from previous)".
 */
export function unifiedStatusLabel(
  manifest: ManifestProject | null,
  currentHours: number | null = null,
): string {
  if (!manifest) return 'not submitted to db';
  const shipped = manifest.submissions.filter(
    (s) => s.shipStatus === 'shipped',
  );
  if (shipped.length === 0) return 'not submitted to db';

  const isHorizons = (s: ManifestSubmission): boolean =>
    !!HORIZONS_YSWS_ID && s.ysws === HORIZONS_YSWS_ID;

  const others = shipped.filter((s) => !isHorizons(s));
  const chosen = others.length > 0 ? others : shipped;

  const names = Array.from(
    new Set(
      chosen.map((s) => s.yswsName?.trim() || s.ysws?.trim() || 'unknown'),
    ),
  );

  let delta = '';
  if (typeof currentHours === 'number' && Number.isFinite(currentHours)) {
    const shippedSum = shipped
      .filter((s) => !isHorizons(s))
      .reduce(
        (acc, s) =>
          typeof s.hoursShipped === 'number' && Number.isFinite(s.hoursShipped)
            ? acc + s.hoursShipped
            : acc,
        0,
      );
    const diff = currentHours - shippedSum;
    const sign = diff >= 0 ? '+' : '-';
    const formatted = Math.abs(diff).toFixed(1).replace(/\.0$/, '');
    delta = ` (${sign}${formatted}hr from previous)`;
  }

  return `submitted to ${names.join(', ')}${delta}`;
}
