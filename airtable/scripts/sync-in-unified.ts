/**
 * Sync "In Unified Already?" on every record in the YSWS Approved Projects
 * Airtable. For each record we look up its Code URL in the Unified YSWS
 * manifest:
 *
 *   - any submission with shipStatus="shipped"  →  "submitted to <ysws name>"
 *   - everything else (only drafts, no record)  →  "not submitted to db"
 *
 * Horizons drafts a manifest record on project create, so a bare lookup hit
 * is meaningless — we only mark "submitted" once something is actually shipped.
 *
 * Usage (from airtable/):
 *   bun scripts/sync-in-unified.ts                      # write changes
 *   bun scripts/sync-in-unified.ts --dry-run            # log only, no writes
 *   bun scripts/sync-in-unified.ts --skip-horizons-only # leave rows untouched
 *                                                       # if shipped only to
 *                                                       # Horizons
 *
 * Required env (loaded from backend/.env, then airtable/.env override):
 *   YSWS_AIRTABLE_API_KEY
 *   YSWS_BASE_ID
 *   YSWS_APPROVED_PROJECTS_TABLE_ID
 *   MANIFEST_BASE_URL
 *   MANIFEST_YSWS_ID
 */
import {
  iterateApprovedProjects,
  patchApprovedProjects,
} from '../lib/airtable';
import {
  isHorizonsOnly,
  isManifestEnabled,
  lookupManifest,
  unifiedStatusLabel,
} from '../lib/manifest';

const FIELD_CODE_URL = 'Code URL';
const FIELD_IN_UNIFIED = 'In Unified Already?';
const FIELD_HOURS_SPENT = 'Optional - Override Hours Spent';

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const SKIP_HORIZONS_ONLY = args.includes('--skip-horizons-only');

interface RowFields {
  [FIELD_CODE_URL]?: string;
  [FIELD_IN_UNIFIED]?: string;
  [FIELD_HOURS_SPENT]?: number | string;
}

async function main(): Promise<void> {
  if (!isManifestEnabled()) {
    console.error(
      'Manifest disabled — set MANIFEST_BASE_URL and MANIFEST_YSWS_ID.',
    );
    process.exit(1);
  }

  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'WRITE'}`);
  if (SKIP_HORIZONS_ONLY) {
    console.log('Skipping projects shipped only to Horizons.');
  }

  const pending: { id: string; fields: { [k: string]: string } }[] = [];
  let scanned = 0;
  let updated = 0;
  let unchanged = 0;
  let skippedNoUrl = 0;
  let skippedHorizonsOnly = 0;
  let flippedSubmitted = 0;
  let flippedNotSubmitted = 0;

  const flush = async (): Promise<void> => {
    if (pending.length === 0) return;
    if (DRY_RUN) {
      pending.length = 0;
      return;
    }
    // Airtable batch PATCH max = 10.
    const batch = pending.splice(0, pending.length);
    for (let i = 0; i < batch.length; i += 10) {
      await patchApprovedProjects(batch.slice(i, i + 10));
      // 5 req/sec base limit — keep ~4 req/sec.
      await new Promise((r) => setTimeout(r, 250));
    }
  };

  for await (const rec of iterateApprovedProjects<RowFields>({
    fields: [FIELD_CODE_URL, FIELD_IN_UNIFIED, FIELD_HOURS_SPENT],
    pageSize: 100,
  })) {
    scanned++;
    const codeUrl = (rec.fields[FIELD_CODE_URL] ?? '').trim();
    if (!codeUrl) {
      skippedNoUrl++;
      continue;
    }

    const manifest = await lookupManifest(codeUrl);
    if (SKIP_HORIZONS_ONLY && isHorizonsOnly(manifest)) {
      skippedHorizonsOnly++;
      continue;
    }
    const rawHours = rec.fields[FIELD_HOURS_SPENT];
    const currentHours =
      typeof rawHours === 'number'
        ? rawHours
        : typeof rawHours === 'string' && rawHours.trim() !== ''
          ? Number(rawHours)
          : null;
    const target = unifiedStatusLabel(
      manifest,
      currentHours !== null && Number.isFinite(currentHours)
        ? currentHours
        : null,
    );
    const current = (rec.fields[FIELD_IN_UNIFIED] ?? '').trim();

    if (current === target) {
      unchanged++;
    } else {
      updated++;
      if (target.startsWith('submitted to')) flippedSubmitted++;
      else flippedNotSubmitted++;
      console.log(
        `  ${rec.id} ${codeUrl}  ${current || '(empty)'} → ${target}`,
      );
      pending.push({ id: rec.id, fields: { [FIELD_IN_UNIFIED]: target } });
      if (pending.length >= 10) await flush();
    }

    if (scanned % 50 === 0) {
      console.log(
        `[progress] scanned=${scanned} updated=${updated} unchanged=${unchanged}`,
      );
    }
  }

  await flush();

  console.log('');
  console.log('── Summary ───────────────────────────────────────────');
  console.log(`Scanned:      ${scanned}`);
  console.log(
    `Updated:      ${updated}  (submitted=${flippedSubmitted}, not-submitted=${flippedNotSubmitted})`,
  );
  console.log(`Unchanged:    ${unchanged}`);
  console.log(`Skipped:      ${skippedNoUrl}  (no Code URL)`);
  if (SKIP_HORIZONS_ONLY) {
    console.log(`Skipped:      ${skippedHorizonsOnly}  (Horizons-only)`);
  }
  if (DRY_RUN) console.log('(dry run — no writes were made)');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
