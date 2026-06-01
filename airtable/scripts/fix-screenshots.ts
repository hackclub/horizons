/**
 * Find records in the YSWS Approved Projects Airtable whose Screenshot
 * attachment is missing, match them back to a Horizons project by Code URL,
 * resolve the screenshot URL through the Hack Club CDN's redirect, and
 * re-attach it.
 *
 * Why we resolve URLs ourselves: cdn.hackclub.com 302s every upload to
 * user-cdn.hackclub-assets.com with a Location header that contains raw
 * unencoded characters. Airtable's async attachment downloader can't
 * follow that, so a naive PATCH succeeds but the attachment vanishes a
 * few seconds later. See lib/resolve-url.ts for the gory details.
 *
 * Match strategy: Project.repoUrl == Airtable "Code URL". When more than
 * one project shares a repoUrl we pick the most recent non-deleted one
 * with a non-empty screenshotUrl, falling back to the latest submission's
 * screenshotUrl.
 *
 * Usage (from airtable/):
 *   bun scripts/fix-screenshots.ts              # write changes
 *   bun scripts/fix-screenshots.ts --dry-run    # log only, no writes
 *   bun scripts/fix-screenshots.ts --verify     # re-read after PATCH to
 *                                                 confirm Airtable kept it
 *
 * Required env (loaded from backend/.env, then airtable/.env override):
 *   YSWS_AIRTABLE_API_KEY
 *   YSWS_BASE_ID
 *   YSWS_APPROVED_PROJECTS_TABLE_ID
 *   DATABASE_URL
 */
import {
  APPROVED_PROJECTS_TABLE_ID,
  AIRTABLE_API_KEY,
  YSWS_BASE_ID,
} from '../lib/env';
import {
  iterateApprovedProjects,
  isScreenshotMissing,
  patchApprovedProject,
  type AirtableAttachment,
} from '../lib/airtable';
import { disconnectPrisma, prisma } from '../lib/prisma';
import { resolveCdnUrl } from '../lib/resolve-url';

const FIELD_CODE_URL = 'Code URL';
const FIELD_SCREENSHOT = 'Screenshot';

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const VERIFY = args.includes('--verify');

interface RowFields {
  [FIELD_CODE_URL]?: string;
  [FIELD_SCREENSHOT]?: AirtableAttachment[];
}

async function findScreenshotForCodeUrl(
  codeUrl: string,
): Promise<string | null> {
  const projects = await prisma.project.findMany({
    where: { repoUrl: codeUrl, deletedAt: null },
    orderBy: { updatedAt: 'desc' },
    select: {
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

async function readScreenshotField(
  recordId: string,
): Promise<AirtableAttachment[] | undefined> {
  const res = await fetch(
    `https://api.airtable.com/v0/${YSWS_BASE_ID}/${APPROVED_PROJECTS_TABLE_ID}/${recordId}?fields%5B%5D=${encodeURIComponent(FIELD_SCREENSHOT)}`,
    { headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` } },
  );
  if (!res.ok) return undefined;
  const json = (await res.json()) as { fields?: RowFields };
  return json.fields?.[FIELD_SCREENSHOT];
}

interface Unfixable {
  id: string;
  codeUrl: string;
  reason: string;
}

async function main(): Promise<void> {
  console.log(
    `Mode: ${DRY_RUN ? 'DRY RUN' : 'WRITE'}${VERIFY ? ' (verify on)' : ''}`,
  );

  let scanned = 0;
  let alreadyHasShot = 0;
  let fixed = 0;
  let verifiedOk = 0;
  let verifiedFailed = 0;
  const unfixable: Unfixable[] = [];

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
        unfixable.push({ id: rec.id, codeUrl: '(empty)', reason: 'no Code URL' });
        continue;
      }

      const rawScreenshotUrl = await findScreenshotForCodeUrl(codeUrl);
      if (!rawScreenshotUrl) {
        unfixable.push({ id: rec.id, codeUrl, reason: 'no DB match' });
        console.log(`  ${rec.id}  no DB match for ${codeUrl}`);
        continue;
      }

      const resolved = await resolveCdnUrl(rawScreenshotUrl);
      if (!resolved.ok) {
        unfixable.push({
          id: rec.id,
          codeUrl,
          reason: `CDN ${resolved.status}: ${resolved.reason ?? 'unknown'}`,
        });
        console.log(
          `  ${rec.id}  CDN unreachable (${resolved.status}: ${resolved.reason}) for ${rawScreenshotUrl}`,
        );
        continue;
      }

      console.log(`  ${rec.id}  ${codeUrl}  →  ${resolved.url}`);
      if (!DRY_RUN) {
        try {
          await patchApprovedProject(rec.id, {
            [FIELD_SCREENSHOT]: [
              {
                url: resolved.url,
                filename: `screenshot-${Date.now()}.png`,
              },
            ],
          });
        } catch (err) {
          unfixable.push({
            id: rec.id,
            codeUrl,
            reason: `PATCH failed: ${(err as Error).message}`,
          });
          continue;
        }
        // Airtable single-record PATCH: pace to ~4 req/sec.
        await new Promise((r) => setTimeout(r, 250));
      }
      fixed++;

      if (!DRY_RUN && VERIFY) {
        // Give Airtable ~6s to actually download the URL, then check
        // whether the attachment still has a populated `size`.
        await new Promise((r) => setTimeout(r, 6000));
        const after = await readScreenshotField(rec.id);
        const att = after?.[0];
        if (att && typeof att.size === 'number' && att.size > 0) {
          verifiedOk++;
          console.log(`    ✓ verified (${att.size}B, ${att.type ?? '?'})`);
        } else {
          verifiedFailed++;
          unfixable.push({
            id: rec.id,
            codeUrl,
            reason: 'Airtable cleared attachment after PATCH',
          });
          console.log(`    ✗ Airtable cleared attachment`);
        }
      }

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
  if (VERIFY) {
    console.log(`Verified ok:    ${verifiedOk}`);
    console.log(`Verify failed:  ${verifiedFailed}`);
  }
  console.log(`Unfixable:      ${unfixable.length}`);
  if (unfixable.length) {
    console.log('');
    console.log('Unfixable records:');
    for (const u of unfixable)
      console.log(`  ${u.id}  ${u.reason}  ${u.codeUrl}`);
  }
  if (DRY_RUN) console.log('(dry run — no writes were made)');
}

main().catch(async (err) => {
  console.error(err);
  await disconnectPrisma().catch(() => {});
  process.exit(1);
});
