/**
 * End-to-end test for the URL-check worker and the backend forwarder.
 *
 * Usage (from backend/):
 *   bun scripts/url-check-test.ts             # both worker + backend
 *   bun scripts/url-check-test.ts --worker    # worker direct only
 *   bun scripts/url-check-test.ts --backend   # backend forwarder only
 *
 * Required env vars (shell or backend/.env):
 *   URL_CHECK_WORKER_URL     deployed worker URL (e.g. https://x.workers.dev/)
 *   URL_CHECK_WORKER_SECRET  shared bearer secret
 *
 * For backend tests, also set:
 *   BACKEND_URL              defaults to http://localhost:3000 if unset
 *   SESSION_ID               sessionId cookie value from your browser
 */
import { config as dotenvConfig } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const scriptDir = dirname(fileURLToPath(import.meta.url));
dotenvConfig({ path: resolve(scriptDir, '../.env') });

const argv = process.argv.slice(2);
const onlyWorker = argv.includes('--worker');
const onlyBackend = argv.includes('--backend');
if (onlyWorker && onlyBackend) {
  console.error('Pass at most one of --worker or --backend');
  process.exit(2);
}

const WORKER_URL = process.env.URL_CHECK_WORKER_URL;
const WORKER_SECRET = process.env.URL_CHECK_WORKER_SECRET;
const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:3000';
const SESSION_ID = process.env.SESSION_ID;

const c = {
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
};

interface CheckResult {
  ok: boolean;
  status: number;
  error?: string;
  favicon?: string | null;
}

let pass = 0;
let fail = 0;
let skip = 0;

async function check(
  name: string,
  fn: () => Promise<{ ok: boolean; detail?: string }>,
): Promise<void> {
  process.stdout.write(`  ${name} ... `);
  try {
    const r = await fn();
    const tag = r.ok ? c.green('PASS') : c.red('FAIL');
    const tail = r.detail ? c.dim(`  ${r.detail}`) : '';
    console.log(tag + tail);
    if (r.ok) pass++;
    else fail++;
  } catch (e: any) {
    console.log(c.red('ERROR') + c.dim(`  ${e?.message ?? e}`));
    fail++;
  }
}

async function postWorker(
  body: Record<string, unknown>,
  opts: { auth?: string; subpath?: string } = {},
): Promise<Response> {
  const base = WORKER_URL!.replace(/\/+$/, '');
  const url = base + (opts.subpath ?? '/');
  return fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(opts.auth !== undefined ? { Authorization: opts.auth } : {}),
    },
    body: JSON.stringify(body),
  });
}

async function getBackend(query: string): Promise<Response> {
  const url = `${BACKEND_URL.replace(/\/+$/, '')}/api/utils/check-url?${query}`;
  return fetch(url, { headers: { Cookie: `sessionId=${SESSION_ID}` } });
}

async function runWorkerTests(): Promise<void> {
  const WORKER_TEST_COUNT = 13;
  if (!WORKER_URL || !WORKER_SECRET) {
    console.log(
      c.yellow(
        'SKIP worker tests: set URL_CHECK_WORKER_URL and URL_CHECK_WORKER_SECRET',
      ),
    );
    skip += WORKER_TEST_COUNT;
    return;
  }
  const auth = `Bearer ${WORKER_SECRET}`;
  console.log(c.bold('\nWorker direct'));

  await check('happy path (example.com)', async () => {
    const r = await postWorker({ url: 'https://example.com/', type: 'url' }, { auth });
    if (r.status !== 200) return { ok: false, detail: `HTTP ${r.status}` };
    const j = (await r.json()) as CheckResult;
    return {
      ok: j.ok === true && j.status === 200,
      detail: `ok=${j.ok} status=${j.status} favicon=${j.favicon ?? 'null'}`,
    };
  });

  await check('missing auth returns 401', async () => {
    const r = await postWorker({ url: 'https://example.com/' });
    return { ok: r.status === 401, detail: `HTTP ${r.status}` };
  });

  await check('wrong auth returns 401', async () => {
    const r = await postWorker(
      { url: 'https://example.com/' },
      { auth: 'Bearer wrong' },
    );
    return { ok: r.status === 401, detail: `HTTP ${r.status}` };
  });

  await check('reject IPv4 literal', async () => {
    const r = await postWorker({ url: 'http://1.1.1.1/', type: 'url' }, { auth });
    const j = (await r.json()) as CheckResult;
    return {
      ok: !j.ok && /IP|domain name/i.test(j.error ?? ''),
      detail: j.error,
    };
  });

  await check('reject octal IPv4 (WHATWG normalization)', async () => {
    const r = await postWorker({ url: 'http://0177.0.0.1/', type: 'url' }, { auth });
    const j = (await r.json()) as CheckResult;
    return { ok: !j.ok, detail: `ok=${j.ok} err=${j.error ?? ''}` };
  });

  await check('reject decimal IPv4 (WHATWG normalization)', async () => {
    const r = await postWorker({ url: 'http://2130706433/', type: 'url' }, { auth });
    const j = (await r.json()) as CheckResult;
    return { ok: !j.ok, detail: `ok=${j.ok} err=${j.error ?? ''}` };
  });

  await check('reject IPv6 literal', async () => {
    const r = await postWorker({ url: 'http://[::1]/', type: 'url' }, { auth });
    const j = (await r.json()) as CheckResult;
    return { ok: !j.ok, detail: j.error };
  });

  await check('reject non-http scheme', async () => {
    const r = await postWorker(
      { url: 'file:///etc/passwd', type: 'url' },
      { auth },
    );
    const j = (await r.json()) as CheckResult;
    return { ok: !j.ok, detail: j.error };
  });

  await check('reject self-reference', async () => {
    const r = await postWorker({ url: WORKER_URL, type: 'url' }, { auth });
    const j = (await r.json()) as CheckResult;
    return { ok: !j.ok, detail: j.error };
  });

  await check('4xx bucket', async () => {
    const r = await postWorker(
      { url: 'https://example.com/this-path-does-not-exist', type: 'url' },
      { auth },
    );
    const j = (await r.json()) as CheckResult;
    return {
      ok: !j.ok && j.status === 400,
      detail: `status=${j.status} err=${j.error ?? ''}`,
    };
  });

  await check('repo flow on real git repo (gitlab.com)', async () => {
    const r = await postWorker(
      { url: 'https://gitlab.com/gitlab-org/gitlab', type: 'repo' },
      { auth },
    );
    const j = (await r.json()) as CheckResult;
    return {
      ok: j.ok === true,
      detail: `ok=${j.ok} status=${j.status} ${j.error ?? ''}`,
    };
  });

  await check('repo flow on non-repo URL', async () => {
    const r = await postWorker(
      { url: 'https://example.com/', type: 'repo' },
      { auth },
    );
    const j = (await r.json()) as CheckResult;
    return {
      ok: !j.ok && /git repository/i.test(j.error ?? ''),
      detail: j.error,
    };
  });

  await check('unknown path returns 404', async () => {
    const r = await postWorker(
      { url: 'https://example.com/' },
      { auth, subpath: '/asdf' },
    );
    return { ok: r.status === 404, detail: `HTTP ${r.status}` };
  });
}

async function runBackendTests(): Promise<void> {
  const BACKEND_TEST_COUNT = 5;
  if (!SESSION_ID) {
    console.log(
      c.yellow(
        '\nSKIP backend tests: set SESSION_ID (sessionId cookie value)',
      ),
    );
    skip += BACKEND_TEST_COUNT;
    return;
  }
  console.log(c.bold('\nBackend forwarder') + c.dim(`  (${BACKEND_URL})`));

  await check('auth required (no cookie)', async () => {
    const url = `${BACKEND_URL.replace(/\/+$/, '')}/api/utils/check-url?url=${encodeURIComponent('https://example.com/')}`;
    const r = await fetch(url);
    return { ok: r.status === 401, detail: `HTTP ${r.status}` };
  });

  await check('authed happy path', async () => {
    const r = await getBackend(`url=${encodeURIComponent('https://example.com/')}`);
    if (r.status !== 200) return { ok: false, detail: `HTTP ${r.status}` };
    const j = (await r.json()) as CheckResult;
    return {
      ok: j.ok === true && j.status === 200,
      detail: `ok=${j.ok} status=${j.status}`,
    };
  });

  await check('invalid URL handled by controller (no worker hop)', async () => {
    const r = await getBackend(`url=${encodeURIComponent('not-a-url')}`);
    const j = (await r.json()) as CheckResult;
    return {
      ok: !j.ok && /Invalid URL/i.test(j.error ?? ''),
      detail: j.error,
    };
  });

  await check('IP literal forwarded and rejected', async () => {
    const r = await getBackend(`url=${encodeURIComponent('http://1.1.1.1/')}`);
    const j = (await r.json()) as CheckResult;
    return { ok: !j.ok, detail: j.error };
  });

  await check('repo URL forwarded', async () => {
    const r = await getBackend(
      `url=${encodeURIComponent('https://gitlab.com/gitlab-org/gitlab')}&type=repo`,
    );
    const j = (await r.json()) as CheckResult;
    return { ok: j.ok === true, detail: `ok=${j.ok} ${j.error ?? ''}` };
  });
}

async function main(): Promise<void> {
  if (!onlyBackend) await runWorkerTests();
  if (!onlyWorker) await runBackendTests();

  const summary = [
    c.green(`${pass} passed`),
    fail > 0 ? c.red(`${fail} failed`) : `${fail} failed`,
    skip > 0 ? c.yellow(`${skip} skipped`) : null,
  ]
    .filter(Boolean)
    .join(', ');
  console.log(`\n${summary}`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
