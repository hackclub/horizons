/**
 * Restore Submission.hoursJustification (the feedback shown to the submitter)
 * on rows the Airtable justification reverse-sync overwrote with the internal
 * project justification. Each overwrite left an `airtable_justification_pull`
 * audit row whose `changes.from` holds the value it replaced. The value to
 * restore is the newest `from` that was not itself written by an earlier pull,
 * so feedback a reviewer rewrote between two pulls wins over the original.
 *
 * A row is restored only when its current value still equals the last pulled
 * value, so feedback rewritten after the last pull is left alone.
 *
 * Usage (from backend/):
 *   bun scripts/restore-submission-feedback.ts          dry run, prints the plan
 *   bun scripts/restore-submission-feedback.ts --apply  writes the restores
 *
 * Required env (loaded from backend/.env): DATABASE_URL
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

const PULL_ACTION = 'airtable_justification_pull';

function normalize(value: string | null | undefined): string {
  return (value ?? '').replace(/\r\n/g, '\n').trim();
}

function preview(value: string | null, max = 20): string {
  if (value === null) return 'null';
  const flat = value.replace(/\s+/g, ' ').trim();
  return JSON.stringify(flat.length > max ? `${flat.slice(0, max)}…` : flat);
}

async function main() {
  const apply = process.argv.includes('--apply');
  const rawUrl = process.env.DATABASE_URL;
  if (!rawUrl) throw new Error('DATABASE_URL is not set');

  const useSsl = /sslmode=(require|verify-ca|verify-full|prefer|allow)/i.test(
    rawUrl,
  );
  const pool = new Pool({
    connectionString: rawUrl,
    ssl: useSsl
      ? {
          ca: tls.rootCertificates as unknown as string[],
          rejectUnauthorized: true,
        }
      : undefined,
  });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    const pulls = await prisma.submissionAuditLog.findMany({
      where: { action: PULL_ACTION },
      orderBy: [{ submissionId: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      select: { submissionId: true, changes: true },
    });

    type Pull = { from: string | null; to: string };
    const bySubmission = new Map<number, Pull[]>();
    for (const row of pulls) {
      const changes = (row.changes ?? {}) as Record<string, unknown>;
      // Pulls written after the fix carry `field` and never touched the
      // submission row.
      if (changes.field !== undefined) continue;
      const list = bySubmission.get(row.submissionId) ?? [];
      list.push({
        from: typeof changes.from === 'string' ? changes.from : null,
        to: typeof changes.to === 'string' ? changes.to : '',
      });
      bySubmission.set(row.submissionId, list);
    }

    let restored = 0;
    let skipped = 0;
    for (const [submissionId, history] of bySubmission) {
      const lastPulled = history[history.length - 1].to;
      let original = history[0].from;
      for (let i = history.length - 1; i > 0; i--) {
        const writtenByPull = history
          .slice(0, i)
          .some((pull) => normalize(pull.to) === normalize(history[i].from));
        if (!writtenByPull) {
          original = history[i].from;
          break;
        }
      }
      const submission = await prisma.submission.findUnique({
        where: { submissionId },
        select: { hoursJustification: true },
      });
      if (!submission) continue;

      if (normalize(submission.hoursJustification) !== normalize(lastPulled)) {
        skipped++;
        console.log(
          `skip submission ${submissionId}: feedback changed since the last pull`,
        );
        continue;
      }

      console.log(
        `${apply ? 'restore' : 'would restore'} submission ${submissionId}: ${history.length} pull(s), original ${original === null ? 'null' : `${original.length} chars`}\n    from: ${preview(submission.hoursJustification)}\n    to:   ${preview(original)}`,
      );
      if (apply) {
        await prisma.submission.update({
          where: { submissionId },
          data: { hoursJustification: original },
        });
      }
      restored++;
    }

    console.log(
      `${apply ? 'restored' : 'would restore'} ${restored}, skipped ${skipped}, submissions with pulls ${bySubmission.size}`,
    );
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
