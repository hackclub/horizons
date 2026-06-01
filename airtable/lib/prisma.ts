import * as tls from 'node:tls';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../backend/generated/prisma/client';
import { requireEnv } from './env';

const rawUrl = requireEnv('DATABASE_URL');

// `sslrootcert=system` in the URL is the libpq shorthand for "use the OS
// trust store"; pg-connection-string resolves it by passing the literal
// string `'system'` as the TLS `ca` option. Node 22 understands it, but
// Bun doesn't — it tries to fs.open('system') and throws ENOENT. Strip
// the param and feed Node's bundled Mozilla root CAs via
// tls.rootCertificates instead. `verify-full` semantics (cert chain +
// hostname check) are preserved by rejectUnauthorized + default
// checkServerIdentity.
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
const adapter = new PrismaPg(pool);

export const prisma = new PrismaClient({ adapter });

export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect();
  await pool.end();
}
