/**
 * Run data-quality checks over every row in the YSWS Approved Projects
 * Airtable and report the records that fail. Checks are modular — each is
 * a named entry in CHECKS below, so adding a new one is a ~10 line diff.
 *
 * Current checks:
 *   missing-screenshot    Screenshot attachment is empty
 *   missing-playable-url  Playable URL field is empty
 *   dead-playable-url     Playable URL doesn't respond (DNS failure,
 *                         connection error, timeout, or HTTP >= 400)
 *   missing-code-url      Code URL field is empty
 *   dead-code-url         Code URL doesn't respond
 *
 * By default this is read-only: it prints a per-record report and a
 * summary. Pass --write to also PATCH each record's "Check Issues" field
 * (long text — create it in Airtable first) with the list of failures,
 * clearing it on records that pass everything.
 *
 * Usage (from airtable/):
 *   bun scripts/check-records.ts                        # report only
 *   bun scripts/check-records.ts --only=missing-screenshot,dead-playable-url
 *   bun scripts/check-records.ts --write                # write "Check Issues"
 *   bun scripts/check-records.ts --write --field="QA Notes"
 *
 * Required env (loaded from backend/.env, then airtable/.env override):
 *   YSWS_AIRTABLE_API_KEY
 *   YSWS_BASE_ID
 *   YSWS_APPROVED_PROJECTS_TABLE_ID
 */
import {
  iterateApprovedProjects,
  isScreenshotMissing,
  patchApprovedProject,
  type AirtableAttachment,
  type AirtableRecord,
} from '../lib/airtable';

const FIELD_CODE_URL = 'Code URL';
const FIELD_PLAYABLE_URL = 'Playable URL';
const FIELD_SCREENSHOT = 'Screenshot';
const FIELD_FIRST_NAME = 'First Name';
const FIELD_LAST_NAME = 'Last Name';
const DEFAULT_ISSUES_FIELD = 'Check Issues';

const PROBE_TIMEOUT_MS = 15_000;
const PROBE_CONCURRENCY = 8;
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const args = process.argv.slice(2);
const WRITE = args.includes('--write');
const ISSUES_FIELD =
  args.find((a) => a.startsWith('--field='))?.slice('--field='.length) ??
  DEFAULT_ISSUES_FIELD;
const ONLY = args
  .find((a) => a.startsWith('--only='))
  ?.slice('--only='.length)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

interface RowFields {
  [FIELD_CODE_URL]?: string;
  [FIELD_PLAYABLE_URL]?: string;
  [FIELD_SCREENSHOT]?: AirtableAttachment[];
  [FIELD_FIRST_NAME]?: string;
  [FIELD_LAST_NAME]?: string;
}

type Row = AirtableRecord<RowFields>;

/** A failed check on one record. `detail` explains why, for the report. */
interface Issue {
  check: string;
  detail: string;
}

interface Check {
  name: string;
  run: (rec: Row) => Promise<Issue | null> | Issue | null;
}

// ── URL probing ──────────────────────────────────────────────────────

interface ProbeResult {
  ok: boolean;
  detail: string;
}

const probeCache = new Map<string, Promise<ProbeResult>>();

/**
 * Check whether a URL responds. HEAD first (cheap), falling back to GET
 * because plenty of hosts 403/404/405 HEAD requests they'd serve fine as
 * GET. Network-level failures (DNS, refused connection, timeout) are
 * reported distinctly from HTTP error statuses so "domain doesn't work"
 * is tellable apart from "site is up but page is gone".
 */
function probeUrl(rawUrl: string): Promise<ProbeResult> {
  const cached = probeCache.get(rawUrl);
  if (cached) return cached;
  const result = doProbe(rawUrl);
  probeCache.set(rawUrl, result);
  return result;
}

async function doProbe(rawUrl: string): Promise<ProbeResult> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, detail: `not a valid URL: ${rawUrl}` };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, detail: `non-http(s) URL: ${rawUrl}` };
  }

  let lastDetail = '';
  for (const method of ['HEAD', 'GET'] as const) {
    try {
      const res = await fetch(url, {
        method,
        redirect: 'follow',
        signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
        headers: { 'User-Agent': UA, Accept: '*/*' },
      });
      try {
        await res.body?.cancel();
      } catch {
        /* noop */
      }
      if (res.status < 400) return { ok: true, detail: `HTTP ${res.status}` };
      // 403 is often bot-blocking rather than a dead page — still flagged,
      // but the detail says so, so a human can eyeball those separately.
      lastDetail =
        res.status === 403
          ? `HTTP 403 (may be bot-blocking, check manually)`
          : `HTTP ${res.status}`;
    } catch (err) {
      const e = err as Error;
      lastDetail =
        e.name === 'TimeoutError'
          ? `timed out after ${PROBE_TIMEOUT_MS / 1000}s`
          : `unreachable: ${e.message}`;
      // A network-level failure won't get better by switching HEAD→GET.
      break;
    }
  }
  return { ok: false, detail: lastDetail };
}

// ── Checks ───────────────────────────────────────────────────────────

function urlChecks(fieldName: string, slug: string): Check[] {
  return [
    {
      name: `missing-${slug}`,
      run: (rec) =>
        (rec.fields[fieldName as keyof RowFields] as string | undefined)?.trim()
          ? null
          : { check: `missing-${slug}`, detail: `${fieldName} is empty` },
    },
    {
      name: `dead-${slug}`,
      run: async (rec) => {
        const raw = (
          rec.fields[fieldName as keyof RowFields] as string | undefined
        )?.trim();
        if (!raw) return null; // missing-* already covers this
        const probe = await probeUrl(raw);
        return probe.ok
          ? null
          : { check: `dead-${slug}`, detail: `${fieldName} ${probe.detail} (${raw})` };
      },
    },
  ];
}

const CHECKS: Check[] = [
  {
    name: 'missing-screenshot',
    run: (rec) =>
      isScreenshotMissing(rec.fields[FIELD_SCREENSHOT])
        ? { check: 'missing-screenshot', detail: 'Screenshot attachment is empty' }
        : null,
  },
  ...urlChecks(FIELD_PLAYABLE_URL, 'playable-url'),
  ...urlChecks(FIELD_CODE_URL, 'code-url'),
];

// ── Runner ───────────────────────────────────────────────────────────

function activeChecks(): Check[] {
  if (!ONLY) return CHECKS;
  const known = new Set(CHECKS.map((c) => c.name));
  const unknown = ONLY.filter((n) => !known.has(n));
  if (unknown.length) {
    console.error(
      `Unknown check(s): ${unknown.join(', ')}\nAvailable: ${[...known].join(', ')}`,
    );
    process.exit(1);
  }
  return CHECKS.filter((c) => ONLY.includes(c.name));
}

function recordLabel(rec: Row): string {
  const name = [rec.fields[FIELD_FIRST_NAME], rec.fields[FIELD_LAST_NAME]]
    .filter(Boolean)
    .join(' ');
  return name ? `${rec.id} (${name})` : rec.id;
}

async function checkRecord(rec: Row, checks: Check[]): Promise<Issue[]> {
  const issues: Issue[] = [];
  for (const check of checks) {
    const issue = await check.run(rec);
    if (issue) issues.push(issue);
  }
  return issues;
}

async function main(): Promise<void> {
  const checks = activeChecks();
  console.log(
    `Mode: ${WRITE ? `WRITE (→ "${ISSUES_FIELD}")` : 'REPORT ONLY'}`,
  );
  console.log(`Checks: ${checks.map((c) => c.name).join(', ')}`);
  console.log('');

  const records: Row[] = [];
  for await (const rec of iterateApprovedProjects<RowFields>({
    fields: [
      FIELD_CODE_URL,
      FIELD_PLAYABLE_URL,
      FIELD_SCREENSHOT,
      FIELD_FIRST_NAME,
      FIELD_LAST_NAME,
    ],
    pageSize: 100,
  })) {
    records.push(rec);
  }
  console.log(`Fetched ${records.length} records, probing…`);

  // Simple worker pool — URL probes dominate the runtime, so run a few
  // records at a time. Results keep the original record order.
  const results = new Array<Issue[]>(records.length);
  let cursor = 0;
  let done = 0;
  await Promise.all(
    Array.from({ length: PROBE_CONCURRENCY }, async () => {
      while (cursor < records.length) {
        const i = cursor++;
        results[i] = await checkRecord(records[i], checks);
        done++;
        if (done % 25 === 0)
          console.log(`[progress] checked ${done}/${records.length}`);
      }
    }),
  );

  const failing: { rec: Row; issues: Issue[] }[] = [];
  const countByCheck = new Map<string, number>(checks.map((c) => [c.name, 0]));
  records.forEach((rec, i) => {
    const issues = results[i];
    if (issues.length === 0) return;
    failing.push({ rec, issues });
    for (const issue of issues)
      countByCheck.set(issue.check, (countByCheck.get(issue.check) ?? 0) + 1);
  });

  console.log('');
  for (const { rec, issues } of failing) {
    console.log(recordLabel(rec));
    for (const issue of issues)
      console.log(`  [${issue.check}] ${issue.detail}`);
  }

  let written = 0;
  let cleared = 0;
  const writeFailures: string[] = [];
  if (WRITE) {
    console.log('');
    console.log(`Writing "${ISSUES_FIELD}"…`);
    for (let i = 0; i < records.length; i++) {
      const issues = results[i];
      const value = issues.length
        ? issues.map((iss) => `[${iss.check}] ${iss.detail}`).join('\n')
        : '';
      try {
        await patchApprovedProject(records[i].id, { [ISSUES_FIELD]: value });
        issues.length ? written++ : cleared++;
      } catch (err) {
        writeFailures.push(`${records[i].id}: ${(err as Error).message}`);
      }
      // Airtable single-record PATCH: pace to ~4 req/sec.
      await new Promise((r) => setTimeout(r, 250));
    }
  }

  console.log('');
  console.log('── Summary ───────────────────────────────────────────');
  console.log(`Checked:        ${records.length}`);
  console.log(`With issues:    ${failing.length}`);
  for (const [name, count] of countByCheck)
    console.log(`  ${name.padEnd(22)} ${count}`);
  if (WRITE) {
    console.log(`Wrote issues:   ${written}`);
    console.log(`Cleared clean:  ${cleared}`);
    if (writeFailures.length) {
      console.log(`Write failures: ${writeFailures.length}`);
      for (const f of writeFailures) console.log(`  ${f}`);
    }
  } else {
    console.log('(report only — pass --write to store results in Airtable)');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
