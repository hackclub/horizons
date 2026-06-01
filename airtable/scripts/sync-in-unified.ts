/**
 * Sync "In Unified Already?" on every record in the YSWS Approved Projects
 * Airtable. For each record we look up its Code URL in the Unified YSWS
 * manifest:
 *
 *   - any submission with shipStatus="shipped"  →  "yes"
 *   - everything else (only drafts, no record)  →  "no"
 *
 * Horizons drafts a manifest record on project create, so a bare lookup hit
 * is meaningless — we only flip to "yes" once something is actually shipped.
 *
 * Usage (from airtable/):
 *   bun scripts/sync-in-unified.ts            # write changes
 *   bun scripts/sync-in-unified.ts --dry-run  # log only, no writes
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
import { isInUnified, isManifestEnabled, lookupManifest } from '../lib/manifest';

const FIELD_CODE_URL = 'Code URL';
const FIELD_IN_UNIFIED = 'In Unified Already?';

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');

interface RowFields {
  [FIELD_CODE_URL]?: string;
  [FIELD_IN_UNIFIED]?: string;
}

async function main(): Promise<void> {
  if (!isManifestEnabled()) {
    console.error(
      'Manifest disabled — set MANIFEST_BASE_URL and MANIFEST_YSWS_ID.',
    );
    process.exit(1);
  }

  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'WRITE'}`);

  const pending: { id: string; fields: { [k: string]: string } }[] = [];
  let scanned = 0;
  let updated = 0;
  let unchanged = 0;
  let skippedNoUrl = 0;
  let flippedYes = 0;
  let flippedNo = 0;

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
    fields: [FIELD_CODE_URL, FIELD_IN_UNIFIED],
    pageSize: 100,
  })) {
    scanned++;
    const codeUrl = (rec.fields[FIELD_CODE_URL] ?? '').trim();
    if (!codeUrl) {
      skippedNoUrl++;
      continue;
    }

    const manifest = await lookupManifest(codeUrl);
    const target = isInUnified(manifest) ? 'yes' : 'no';
    const current = (rec.fields[FIELD_IN_UNIFIED] ?? '').toLowerCase().trim();

    if (current === target) {
      unchanged++;
    } else {
      updated++;
      if (target === 'yes') flippedYes++;
      else flippedNo++;
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
  console.log(`Updated:      ${updated}  (yes=${flippedYes}, no=${flippedNo})`);
  console.log(`Unchanged:    ${unchanged}`);
  console.log(`Skipped:      ${skippedNoUrl}  (no Code URL)`);
  if (DRY_RUN) console.log('(dry run — no writes were made)');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
