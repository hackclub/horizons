/**
 * Probe a single Approved Projects record: read its current state, PATCH a
 * Screenshot URL, then re-read twice (immediate + after a delay so
 * Airtable's async attachment downloader has time to run).
 *
 * Use when fix-screenshots claims to have written but the records still
 * look empty in Airtable — this isolates whether the issue is the PATCH
 * itself or Airtable's downstream URL fetcher.
 *
 * Usage (from airtable/):
 *   bun scripts/probe-screenshot.ts <recordId> [<screenshotUrl>]
 *
 * If <screenshotUrl> is omitted, we look it up in the DB by the record's
 * Code URL, same way fix-screenshots does.
 */
import {
  APPROVED_PROJECTS_TABLE_ID,
  AIRTABLE_API_KEY,
  YSWS_BASE_ID,
} from '../lib/env';
import { disconnectPrisma, prisma } from '../lib/prisma';
import { resolveCdnUrl } from '../lib/resolve-url';

const FIELD_CODE_URL = 'Code URL';
const FIELD_SCREENSHOT = 'Screenshot';

const [recordId, urlArg] = process.argv.slice(2);
if (!recordId) {
  console.error('Usage: bun scripts/probe-screenshot.ts <recordId> [<url>]');
  process.exit(1);
}

const RECORD_URL = `https://api.airtable.com/v0/${YSWS_BASE_ID}/${APPROVED_PROJECTS_TABLE_ID}/${recordId}`;
const HEADERS = { Authorization: `Bearer ${AIRTABLE_API_KEY}` };

async function readRecord(): Promise<any> {
  const res = await fetch(RECORD_URL, { headers: HEADERS });
  if (!res.ok) {
    console.error(`GET ${recordId} → ${res.status}`);
    console.error(await res.text());
    process.exit(1);
  }
  return res.json();
}

function summary(rec: any): {
  codeUrl: string | undefined;
  screenshot: any;
  screenshotCount: number;
} {
  return {
    codeUrl: rec.fields?.[FIELD_CODE_URL],
    screenshot: rec.fields?.[FIELD_SCREENSHOT],
    screenshotCount: Array.isArray(rec.fields?.[FIELD_SCREENSHOT])
      ? rec.fields[FIELD_SCREENSHOT].length
      : 0,
  };
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

async function main(): Promise<void> {
  console.log('── BEFORE ────────────────────────────────────');
  const before = await readRecord();
  console.log(JSON.stringify(summary(before), null, 2));

  let url = urlArg;
  if (!url) {
    const codeUrl = before.fields?.[FIELD_CODE_URL];
    if (!codeUrl) {
      console.error('Record has no Code URL and no <url> arg given.');
      process.exit(1);
    }
    const found = await findScreenshotForCodeUrl(codeUrl);
    if (!found) {
      console.error(`No DB match for Code URL: ${codeUrl}`);
      process.exit(1);
    }
    url = found;
  }
  console.log('');
  console.log(`Raw URL: ${url}`);
  const resolved = await resolveCdnUrl(url);
  if (!resolved.ok) {
    console.error(
      `Resolve failed (${resolved.status}): ${resolved.reason ?? 'unknown'}`,
    );
    process.exit(1);
  }
  console.log(
    `Resolved URL: ${resolved.url}  (${resolved.status} ${resolved.contentType ?? '?'})`,
  );
  console.log('');
  console.log(`Patching Screenshot ← ${resolved.url}`);

  const patchBody = {
    fields: {
      [FIELD_SCREENSHOT]: [
        { url: resolved.url, filename: `screenshot-${Date.now()}.png` },
      ],
    },
  };
  const patchRes = await fetch(RECORD_URL, {
    method: 'PATCH',
    headers: { ...HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify(patchBody),
  });
  const patchBodyText = await patchRes.text();
  console.log(`PATCH status: ${patchRes.status}`);
  console.log('PATCH response:');
  try {
    console.log(JSON.stringify(JSON.parse(patchBodyText), null, 2));
  } catch {
    console.log(patchBodyText);
  }

  console.log('');
  console.log('── IMMEDIATELY AFTER ─────────────────────────');
  const after = await readRecord();
  console.log(JSON.stringify(summary(after), null, 2));

  console.log('');
  console.log('Waiting 8s for Airtable async download...');
  await new Promise((r) => setTimeout(r, 8000));

  console.log('── AFTER 8s ──────────────────────────────────');
  const later = await readRecord();
  console.log(JSON.stringify(summary(later), null, 2));
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => disconnectPrisma());
