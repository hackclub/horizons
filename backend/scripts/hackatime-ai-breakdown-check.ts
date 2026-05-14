/**
 * Compares Hackatime's AI vs non-AI totals for a given Hackatime account slug
 * and one or more project names. The AI slice (ai coding, browsing, meeting,
 * communicating) is what `HackatimeService.getProjectHourBreakdown` counts as
 * non-coding time; non-AI = total − AI.
 *
 * Runs three Hackatime stats calls:
 *   1. per-project totals (no category filter)  → raw per-project seconds
 *   2. deduped total (no category filter)       → matches nowHackatimeHours
 *   3. deduped AI total (category filter)       → only reliable AI form
 *
 * NOTE: the non-deduped (`features=projects`, no `total_seconds=true`) variant
 * with `filter_by_category` is unreliable — it returns 0 or full hours rather
 * than the category-filtered slice — so we don't produce per-project AI
 * numbers, only the aggregate deduped split.
 *
 * Usage (from backend/):
 *   bun scripts/hackatime-ai-breakdown-check.ts <hackatime-account> <project-csv> \
 *     [--from <YYYY-MM-DD>] [--days <n>]
 *
 * Examples:
 *   bun scripts/hackatime-ai-breakdown-check.ts U0123ABC "horizon,horizon-frontend"
 *   bun scripts/hackatime-ai-breakdown-check.ts U0123ABC horizon --from 2026-02-21
 *
 * Auth: looks up the user's stored OAuth access token from the DB by their
 * `hackatimeAccount` slug (read-only `findFirst`). Override with the
 * HACKATIME_USER_TOKEN env var to bypass the DB lookup entirely.
 */
import { config as dotenvConfig } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import * as tls from 'node:tls';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

const scriptDir = dirname(fileURLToPath(import.meta.url));
dotenvConfig({ path: resolve(scriptDir, '../.env') });

const HACKATIME_BASE_URL = 'https://hackatime.hackclub.com';
const DAY_MS = 86_400_000;

// Must match HackatimeService.AI_BREAKDOWN_CATEGORIES — these are the buckets
// the reviewer UI counts as "AI / non-coding" time.
const AI_CATEGORIES = ['ai coding', 'browsing', 'meeting', 'communicating'];

interface Args {
  hackatimeAccount: string;
  projectNames: string[];
  fromYmd?: string;
  days: number;
}

function parseArgs(argv: string[]): Args {
  const positional: string[] = [];
  const flags: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) {
        throw new Error(`Missing value for --${key}`);
      }
      flags[key] = next;
      i++;
    } else {
      positional.push(a);
    }
  }
  if (positional.length < 2) {
    throw new Error(
      'Usage: hackatime-ai-breakdown-check.ts <hackatime-account> <project-csv> [--from YYYY-MM-DD] [--days N]',
    );
  }
  const projectNames = positional[1]
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (projectNames.length === 0) {
    throw new Error('No project names parsed from CSV');
  }
  return {
    hackatimeAccount: positional[0],
    projectNames,
    fromYmd: flags.from,
    days: flags.days ? Number(flags.days) : 30,
  };
}

function shiftYmd(ymd: string, deltaDays: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const ts = Date.UTC(y, m - 1, d) + deltaDays * DAY_MS;
  const dt = new Date(ts);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

function todayUtcYmd(): string {
  const dt = new Date();
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

function fmtHours(seconds: number): string {
  return (seconds / 3600).toFixed(2);
}

// Hackatime's stats endpoint silently ignores `filter_by_category` when the
// query uses `URLSearchParams`' defaults: spaces encode as `+` (instead of
// `%20`) and commas encode as `%2C`. Force the encoding the API expects.
function buildStatsQuery(params: Record<string, string>): string {
  const usp = new URLSearchParams(params);
  return usp.toString().replace(/\+/g, '%20').replace(/%2C/g, ',');
}

interface PerProjectResult {
  total: number;
  perProject: Map<string, number>;
}

async function fetchPerProjectSum(
  account: string,
  token: string,
  startYmd: string,
  projectNames: string[],
  label: string,
): Promise<PerProjectResult> {
  const params: Record<string, string> = {
    features: 'projects',
    start_date: startYmd,
    filter_by_project: projectNames.join(','),
  };
  const url = `${HACKATIME_BASE_URL}/api/v1/users/${encodeURIComponent(account)}/stats?${buildStatsQuery(params)}`;
  console.log(`[${label}] GET ${url}`);
  const resp = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });
  const rawBody = await resp.text();
  console.log(`[${label}] HTTP ${resp.status} (${rawBody.length} bytes)`);
  if (!resp.ok) {
    console.log(`[${label}] body: ${rawBody}`);
    throw new Error(`${label} per-project stats: HTTP ${resp.status}`);
  }
  let data: any;
  try {
    data = JSON.parse(rawBody);
  } catch {
    console.log(`[${label}] body: ${rawBody}`);
    throw new Error(`${label} per-project stats: response was not JSON`);
  }
  const projects: Array<{ name?: string; total_seconds?: number }> =
    data?.data?.projects ?? [];
  const wanted = new Set(projectNames);
  const filtered = projects.filter((p) => p?.name && wanted.has(p.name));
  console.log(
    `[${label}] body (filtered to requested projects):\n${JSON.stringify(filtered, null, 2)}`,
  );
  const perProject = new Map<string, number>();
  for (const name of projectNames) perProject.set(name, 0);
  for (const p of projects) {
    if (p?.name && wanted.has(p.name) && typeof p.total_seconds === 'number') {
      perProject.set(p.name, p.total_seconds);
    }
  }
  const total = Array.from(perProject.values()).reduce((a, b) => a + b, 0);
  return { total, perProject };
}

async function fetchDedupedSeconds(
  account: string,
  token: string,
  startYmd: string,
  projectNames: string[],
  categories: string[] | undefined,
  label: string,
): Promise<number> {
  // Minimal param shape Hackatime is known to honor for deduped totals:
  //   total_seconds=true & filter_by_project=<csv> [& filter_by_category=<csv>]
  // Adding `features=projects` or `boundary_aware=true` here changes the
  // returned number (observed: inflated total). The production
  // `HackatimeService.fetchDeduplicatedTotalSeconds` query includes those flags
  // — that may be wrong, but we keep this script aligned with the working URL.
  const params: Record<string, string> = {
    total_seconds: 'true',
    filter_by_project: projectNames.join(','),
    start_date: startYmd,
  };
  if (categories && categories.length > 0) {
    params.filter_by_category = categories.join(',');
  }
  const url = `${HACKATIME_BASE_URL}/api/v1/users/${encodeURIComponent(account)}/stats?${buildStatsQuery(params)}`;
  console.log(`[${label}] GET ${url}`);
  const resp = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });
  const rawBody = await resp.text();
  console.log(`[${label}] HTTP ${resp.status} (${rawBody.length} bytes)`);
  if (!resp.ok) {
    console.log(`[${label}] body: ${rawBody}`);
    throw new Error(`${label} deduped stats: HTTP ${resp.status}`);
  }
  let data: any;
  try {
    data = JSON.parse(rawBody);
  } catch {
    console.log(`[${label}] body: ${rawBody}`);
    throw new Error(`${label} deduped stats: response was not JSON`);
  }
  console.log(`[${label}] body:\n${JSON.stringify(data, null, 2)}`);
  const total = data?.total_seconds;
  if (typeof total !== 'number') {
    throw new Error(
      `${label} deduped response missing total_seconds: ${JSON.stringify(data).slice(0, 200)}`,
    );
  }
  return total;
}

async function resolveToken(
  hackatimeAccount: string,
): Promise<{ token: string; source: string }> {
  const override = process.env.HACKATIME_USER_TOKEN;
  if (override) return { token: override, source: 'HACKATIME_USER_TOKEN' };

  if (!process.env.DATABASE_URL) {
    throw new Error(
      'No HACKATIME_USER_TOKEN set and DATABASE_URL is missing from backend/.env — cannot look up access token.',
    );
  }

  const rawUrl = process.env.DATABASE_URL;
  let dbUrl = rawUrl;
  try {
    const u = new URL(rawUrl);
    if (u.searchParams.has('sslrootcert')) {
      u.searchParams.delete('sslrootcert');
      dbUrl = u.toString();
    }
  } catch {
    // malformed URL — let pg surface a clear error
  }
  const useSsl = /sslmode=(require|verify-ca|verify-full|prefer|allow)/i.test(
    rawUrl,
  );
  const pool = new Pool({
    connectionString: dbUrl,
    ssl: useSsl
      ? {
          ca: tls.rootCertificates as unknown as string[],
          rejectUnauthorized: true,
        }
      : undefined,
  });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  try {
    const user = await prisma.user.findFirst({
      where: { hackatimeAccount },
      select: { userId: true, hackatimeAccessToken: true },
    });
    if (!user) {
      throw new Error(
        `No user found with hackatimeAccount=${hackatimeAccount}. Pass HACKATIME_USER_TOKEN to override.`,
      );
    }
    if (!user.hackatimeAccessToken) {
      throw new Error(
        `User ${user.userId} (hackatimeAccount=${hackatimeAccount}) has no hackatimeAccessToken stored. Pass HACKATIME_USER_TOKEN to override.`,
      );
    }
    return {
      token: user.hackatimeAccessToken,
      source: `db (userId=${user.userId})`,
    };
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const fromYmd = args.fromYmd ?? shiftYmd(todayUtcYmd(), -(args.days - 1));

  const { token, source } = await resolveToken(args.hackatimeAccount);

  console.log(`Hackatime account: ${args.hackatimeAccount}`);
  console.log(
    `Projects (${args.projectNames.length}): ${args.projectNames.join(', ')}`,
  );
  console.log(`Start date: ${fromYmd}`);
  console.log(`AI categories: ${AI_CATEGORIES.join(', ')}`);
  console.log(`Token source: ${source}`);

  const sep = '='.repeat(72);

  console.log(
    `\n${sep}\n PER-PROJECT TOTAL  (no category filter, raw per-project seconds)\n${sep}`,
  );
  const totalPerProj = await fetchPerProjectSum(
    args.hackatimeAccount,
    token,
    fromYmd,
    args.projectNames,
    'total/per-proj',
  );

  console.log(
    `\n${sep}\n DEDUPED TOTAL      (total_seconds=true, no category filter)\n${sep}`,
  );
  const totalDedup = await fetchDedupedSeconds(
    args.hackatimeAccount,
    token,
    fromYmd,
    args.projectNames,
    undefined,
    'total/dedup',
  );

  console.log(
    `\n${sep}\n DEDUPED AI         (total_seconds=true + AI category filter)\n${sep}`,
  );
  const aiDedup = await fetchDedupedSeconds(
    args.hackatimeAccount,
    token,
    fromYmd,
    args.projectNames,
    AI_CATEGORIES,
    'ai/dedup',
  );

  console.log(`\n${sep}\n SUMMARY\n${sep}`);
  console.log('Per-project totals (raw seconds, NOT deduped — no AI split):');
  for (const name of args.projectNames) {
    const sec = totalPerProj.perProject.get(name) ?? 0;
    console.log(
      `  ${name.padEnd(32)} ${sec.toString().padStart(8)} sec  (${fmtHours(sec)} hr)`,
    );
  }
  console.log('');

  // Clamp: dedup/rounding on Hackatime's side can briefly put AI > total,
  // which would otherwise produce a negative non-AI value.
  const dedupNonAi = Math.max(0, totalDedup - aiDedup);

  const fmtRow = (label: string, seconds: number) =>
    `${label.padEnd(30)} ${seconds.toString().padStart(8)} sec  (${fmtHours(seconds)} hr)`;

  console.log('Aggregate (deduped — what the UI / nowHackatimeHours uses):');
  console.log(`  ${fmtRow('total', totalDedup)}`);
  console.log(`  ${fmtRow('ai', aiDedup)}`);
  console.log(`  ${fmtRow('non-ai (total − ai)', dedupNonAi)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
