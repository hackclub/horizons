/**
 * Compares Hackatime's deduped vs non-deduped totals for a given Hackatime
 * account slug and one or more project names. Useful for confirming how much
 * of a user's logged time was double-counted across overlapping projects
 * (the gap between summing per-project `total_seconds` and the deduped
 * `total_seconds=true&filter_by_project=<csv>` response).
 *
 * Usage (from backend/):
 *   bun scripts/hackatime-dedup-check.ts <hackatime-account> <project-csv> \
 *     [--from <YYYY-MM-DD>] [--days <n>]
 *
 * Examples:
 *   bun scripts/hackatime-dedup-check.ts U0123ABC "horizon,horizon-frontend"
 *   bun scripts/hackatime-dedup-check.ts U0123ABC horizon --from 2026-01-01
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

// Load backend/.env regardless of where bun was invoked from. DATABASE_URL
// lives there.
const scriptDir = dirname(fileURLToPath(import.meta.url));
dotenvConfig({ path: resolve(scriptDir, '../.env') });

const HACKATIME_BASE_URL = 'https://hackatime.hackclub.com';
const DAY_MS = 86_400_000;

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
      'Usage: hackatime-dedup-check.ts <hackatime-account> <project-csv> [--from YYYY-MM-DD] [--days N]',
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

async function fetchPerProjectSum(
  account: string,
  token: string,
  startYmd: string,
  projectNames: string[],
): Promise<{ total: number; perProject: Map<string, number> }> {
  const url = `${HACKATIME_BASE_URL}/api/v1/users/${encodeURIComponent(account)}/stats?features=projects&start_date=${startYmd}`;
  console.log(`[non-deduped] GET ${url}`);
  const resp = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });
  const rawBody = await resp.text();
  console.log(`[non-deduped] HTTP ${resp.status} (${rawBody.length} bytes)`);
  if (!resp.ok) {
    console.log(`[non-deduped] body: ${rawBody}`);
    throw new Error(`per-project stats: HTTP ${resp.status}`);
  }
  let data: any;
  try {
    data = JSON.parse(rawBody);
  } catch {
    console.log(`[non-deduped] body: ${rawBody}`);
    throw new Error('per-project stats: response was not JSON');
  }
  const projects: Array<{ name?: string; total_seconds?: number }> =
    data?.data?.projects ?? [];
  const wantedForLog = new Set(projectNames);
  const filteredProjects = projects.filter(
    (p) => p?.name && wantedForLog.has(p.name),
  );
  console.log(
    `[non-deduped] body (filtered to requested projects):\n${JSON.stringify(filteredProjects, null, 2)}`,
  );
  const wanted = new Set(projectNames);
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

async function fetchDedupedTotal(
  account: string,
  token: string,
  startYmd: string,
  projectNames: string[],
): Promise<number> {
  const params = new URLSearchParams({
    features: 'projects',
    start_date: startYmd,
    boundary_aware: 'true',
    total_seconds: 'true',
    filter_by_project: projectNames.join(','),
  });
  const url = `${HACKATIME_BASE_URL}/api/v1/users/${encodeURIComponent(account)}/stats?${params.toString()}`;
  console.log(`[deduped]     GET ${url}`);
  const resp = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });
  const rawBody = await resp.text();
  console.log(`[deduped]     HTTP ${resp.status} (${rawBody.length} bytes)`);
  if (!resp.ok) {
    console.log(`[deduped]     body: ${rawBody}`);
    throw new Error(`deduped stats: HTTP ${resp.status}`);
  }
  let data: any;
  try {
    data = JSON.parse(rawBody);
  } catch {
    console.log(`[deduped]     body: ${rawBody}`);
    throw new Error('deduped stats: response was not JSON');
  }
  console.log(`[deduped]     body:\n${JSON.stringify(data, null, 2)}`);
  const total = data?.total_seconds;
  if (typeof total !== 'number') {
    throw new Error(
      `deduped response missing total_seconds: ${JSON.stringify(data).slice(0, 200)}`,
    );
  }
  return total;
}

async function fetchUndedupedFilteredTotal(
  account: string,
  token: string,
  startYmd: string,
  projectNames: string[],
): Promise<number> {
  const params = new URLSearchParams({
    features: 'projects',
    start_date: startYmd,
    total_seconds: 'true',
    filter_by_project: projectNames.join(','),
  });
  const url = `${HACKATIME_BASE_URL}/api/v1/users/${encodeURIComponent(account)}/stats?${params.toString()}`;
  console.log(`[no-boundary] GET ${url}`);
  const resp = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });
  const rawBody = await resp.text();
  console.log(`[no-boundary] HTTP ${resp.status} (${rawBody.length} bytes)`);
  if (!resp.ok) {
    console.log(`[no-boundary] body: ${rawBody}`);
    throw new Error(`no-boundary stats: HTTP ${resp.status}`);
  }
  let data: any;
  try {
    data = JSON.parse(rawBody);
  } catch {
    console.log(`[no-boundary] body: ${rawBody}`);
    throw new Error('no-boundary stats: response was not JSON');
  }
  console.log(`[no-boundary] body:\n${JSON.stringify(data, null, 2)}`);
  const total = data?.total_seconds;
  if (typeof total !== 'number') {
    throw new Error(
      `no-boundary response missing total_seconds: ${JSON.stringify(data).slice(0, 200)}`,
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

  // Mirrors streak-check.ts: strip sslrootcert=system (libpq shorthand Bun
  // doesn't understand) and supply Node's bundled root CAs explicitly.
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
    // hackatimeAccount is NOT @unique in the schema, so findFirst not
    // findUnique. In practice the same Hackatime slug only ever maps to one
    // active user, but Prisma's typing requires the broader call.
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
    return { token: user.hackatimeAccessToken, source: `db (userId=${user.userId})` };
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const fromYmd =
    args.fromYmd ?? shiftYmd(todayUtcYmd(), -(args.days - 1));

  const { token, source } = await resolveToken(args.hackatimeAccount);

  console.log(`Hackatime account: ${args.hackatimeAccount}`);
  console.log(`Projects (${args.projectNames.length}): ${args.projectNames.join(', ')}`);
  console.log(`Start date: ${fromYmd}`);
  console.log(`Token source: ${source}`);

  const sep = '='.repeat(72);

  console.log(`\n${sep}\n NON-DEDUPED  (per-project total_seconds, summed client-side)\n${sep}`);
  const perProject = await fetchPerProjectSum(
    args.hackatimeAccount,
    token,
    fromYmd,
    args.projectNames,
  );

  console.log(`\n${sep}\n DEDUPED      (filter_by_project + total_seconds=true + boundary_aware=true)\n${sep}`);
  const dedupedTotal = await fetchDedupedTotal(
    args.hackatimeAccount,
    token,
    fromYmd,
    args.projectNames,
  );

  console.log(`\n${sep}\n NO-BOUNDARY  (filter_by_project + total_seconds=true, NO boundary_aware)\n${sep}`);
  const noBoundaryTotal = await fetchUndedupedFilteredTotal(
    args.hackatimeAccount,
    token,
    fromYmd,
    args.projectNames,
  );

  console.log(`\n${sep}\n SUMMARY\n${sep}`);
  console.log('Per-project total_seconds (raw, NOT deduped):');
  for (const name of args.projectNames) {
    const sec = perProject.perProject.get(name) ?? 0;
    console.log(`  ${name.padEnd(32)} ${sec.toString().padStart(8)} sec  (${fmtHours(sec)} hr)`);
  }
  console.log('');

  const nondedup = perProject.total;
  console.log(`Sum of per-project   : ${nondedup.toString().padStart(8)} sec  (${fmtHours(nondedup)} hr)`);
  console.log(`Deduped total        : ${dedupedTotal.toString().padStart(8)} sec  (${fmtHours(dedupedTotal)} hr)`);
  console.log(`No-boundary total    : ${noBoundaryTotal.toString().padStart(8)} sec  (${fmtHours(noBoundaryTotal)} hr)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
