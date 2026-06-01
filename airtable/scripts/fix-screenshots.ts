/**
 * Find records in the YSWS Approved Projects Airtable whose Screenshot
 * attachment is missing, match them back to a Horizons project by Code URL,
 * and re-attach the screenshot we have on file.
 *
 * Match strategy: Project.repoUrl == Airtable "Code URL". When more than
 * one project shares a repoUrl we pick the most recent non-deleted one with
 * a non-empty screenshotUrl, falling back to the latest submission's
 * screenshotUrl.
 *
 * Usage (from airtable/):
 *   bun scripts/fix-screenshots.ts            # write changes
 *   bun scripts/fix-screenshots.ts --dry-run  # log only, no writes
 *
 * Required env (loaded from backend/.env, then airtable/.env override):
 *   YSWS_AIRTABLE_API_KEY
 *   YSWS_BASE_ID
 *   YSWS_APPROVED_PROJECTS_TABLE_ID
 *   DATABASE_URL
 */
import {
  iterateApprovedProjects,
  isScreenshotMissing,
  patchApprovedProject,
  type AirtableAttachment,
} from '../lib/airtable';
import { disconnectPrisma, prisma } from '../lib/prisma';

const FIELD_CODE_URL = 'Code URL';
const FIELD_SCREENSHOT = 'Screenshot';

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');

interface RowFields {
  [FIELD_CODE_URL]?: string;
  [FIELD_SCREENSHOT]?: AirtableAttachment[];
}

/**
 * For a given Code URL, find the best screenshot URL we have. Prefers the
 * project's own screenshotUrl, falls back to the latest submission's.
 * Returns null when nothing usable exists.
 */
async function findScreenshotForCodeUrl(
  codeUrl: string,
): Promise<string | null> {
  const projects = await prisma.project.findMany({
    where: { repoUrl: codeUrl, deletedAt: null },
    orderBy: { updatedAt: 'desc' },
    select: {
      projectId: true,
      screenshotUrl: true,
      submissions: {
        orderBy: { createdAt: 'desc' },
        select: { screenshotUrl: true },
      },
    },
  });

  for (const p of projects) {
    if (p.screenshotUrl) return p.screenshotUrl;
    const fromSub = p.submissions.find((s) => !!s.screenshotUrl)?.screenshotUrl;
    if (fromSub) return fromSub;
  }
  return null;
}

async function main(): Promise<void> {
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'WRITE'}`);

  let scanned = 0;
  let alreadyHasShot = 0;
  let missingNoUrl = 0;
  let noMatch = 0;
  let fixed = 0;
  const unfixable: { id: string; codeUrl: string }[] = [];

  try {
    for await (const rec of iterateApprovedProjects<RowFields>({
      fields: [FIELD_CODE_URL, FIELD_SCREENSHOT],
      pageSize: 100,
    })) {
      scanned++;
      if (!isScreenshotMissing(rec.fields[FIELD_SCREENSHOT])) {
        alreadyHasShot++;
        continue;
      }

      const codeUrl = (rec.fields[FIELD_CODE_URL] ?? '').trim();
      if (!codeUrl) {
        missingNoUrl++;
        unfixable.push({ id: rec.id, codeUrl: '(empty)' });
        continue;
      }

      const screenshotUrl = await findScreenshotForCodeUrl(codeUrl);
      if (!screenshotUrl) {
        noMatch++;
        unfixable.push({ id: rec.id, codeUrl });
        console.log(`  ${rec.id}  no DB match for ${codeUrl}`);
        continue;
      }

      console.log(`  ${rec.id}  ${codeUrl}  →  ${screenshotUrl}`);
      if (!DRY_RUN) {
        await patchApprovedProject(rec.id, {
          [FIELD_SCREENSHOT]: [
            {
              url: screenshotUrl,
              filename: `screenshot-${Date.now()}.png`,
            },
          ],
        });
        // Airtable single-record PATCH: pace to ~4 req/sec.
        await new Promise((r) => setTimeout(r, 250));
      }
      fixed++;

      if (scanned % 50 === 0) {
        console.log(`[progress] scanned=${scanned} fixed=${fixed}`);
      }
    }
  } finally {
    await disconnectPrisma();
  }

  console.log('');
  console.log('── Summary ───────────────────────────────────────────');
  console.log(`Scanned:        ${scanned}`);
  console.log(`Already had:    ${alreadyHasShot}`);
  console.log(`Fixed:          ${fixed}`);
  console.log(`Missing no URL: ${missingNoUrl}`);
  console.log(`No DB match:    ${noMatch}`);
  if (unfixable.length) {
    console.log('');
    console.log('Unfixable records:');
    for (const u of unfixable) console.log(`  ${u.id}  ${u.codeUrl}`);
  }
  if (DRY_RUN) console.log('(dry run — no writes were made)');
}

main().catch(async (err) => {
  console.error(err);
  await disconnectPrisma().catch(() => {});
  process.exit(1);
});
