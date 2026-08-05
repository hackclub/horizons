/**
 * Backfill "Project Type", "Reviewed By", and "Event Submitted To" on YSWS
 * Approved Projects Airtable records from the Horizons Postgres database.
 *
 * The live backend sync now writes both fields on approval (create and edit),
 * so this script is only needed for records created before that change.
 *
 * DB-driven: fetch every submission linked to Airtable
 * (submission.airtableRecId set) and PATCH its record's two fields.
 * Submissions without a recId linkage are not covered — their Airtable rows
 * (if any) are left untouched.
 *
 * Values written:
 *   - Project Type: the raw ProjectType enum value (e.g. "web_playable"),
 *     same spelling the admin dashboard uses
 *   - Reviewed By: reviewer's "First Last" name resolved from
 *     submission.reviewedBy (a user id); falls back to "User <id>" when the
 *     account no longer exists; omitted when the submission has no reviewer
 *   - Event Submitted To: slug of the submitter's currently pinned event
 *     (user.pinnedEvent.event.slug); omitted when the user has no pinned event
 *
 * Writes are blind (no read-before-write) but idempotent. A failed batch is
 * retried record-by-record so one deleted Airtable record doesn't sink the
 * other nine in its batch.
 *
 * All three fields must already exist in Airtable. "Event Submitted To" is a
 * single line text field. "Reviewed By" is single line text too; "Project
 * Type" may be single line text or a single select — run with --typecast so
 * Airtable auto-creates its options.
 *
 * Usage (from airtable/):
 *   bun scripts/backfill-review-fields.ts             # write changes
 *   bun scripts/backfill-review-fields.ts --dry-run   # log only, no writes
 *   bun scripts/backfill-review-fields.ts --typecast  # let Airtable create
 *                                                     # missing select options
 *
 * Required env (loaded from backend/.env, then airtable/.env override):
 *   YSWS_AIRTABLE_API_KEY
 *   YSWS_BASE_ID
 *   YSWS_APPROVED_PROJECTS_TABLE_ID
 *   DATABASE_URL
 */
import {
  patchApprovedProject,
  patchApprovedProjects,
} from '../lib/airtable';
import { disconnectPrisma, prisma } from '../lib/prisma';

const FIELD_PROJECT_TYPE = 'Project Type';
const FIELD_REVIEWED_BY = 'Reviewed By';
const FIELD_EVENT_SUBMITTED_TO = 'Event Submitted To';

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const TYPECAST = args.includes('--typecast');

interface Update {
  id: string;
  fields: { [k: string]: string };
}

async function loadUpdates(): Promise<Update[]> {
  const submissions = await prisma.submission.findMany({
    where: { airtableRecId: { not: null } },
    orderBy: { createdAt: 'desc' },
    select: {
      airtableRecId: true,
      reviewedBy: true,
      project: {
        select: {
          projectType: true,
          user: {
            select: {
              pinnedEvent: { select: { event: { select: { slug: true } } } },
            },
          },
        },
      },
    },
  });

  const reviewerIds = [
    ...new Set(
      submissions
        .map((s) => s.reviewedBy)
        .filter((id): id is string => id !== null)
        .map((id) => parseInt(id))
        .filter((id) => !isNaN(id)),
    ),
  ];
  const reviewers = await prisma.user.findMany({
    where: { userId: { in: reviewerIds } },
    select: { userId: true, firstName: true, lastName: true },
  });
  const reviewerNames = new Map(
    reviewers.map((r) => [
      r.userId.toString(),
      `${r.firstName} ${r.lastName}`,
    ]),
  );

  // Each approved submission gets its own Airtable record, but dedupe by
  // recId anyway (newest submission wins — the list is sorted newest-first).
  const seen = new Set<string>();
  const updates: Update[] = [];
  for (const s of submissions) {
    if (seen.has(s.airtableRecId!)) continue;
    seen.add(s.airtableRecId!);
    const fields: { [k: string]: string } = {
      [FIELD_PROJECT_TYPE]: s.project.projectType,
    };
    if (s.reviewedBy) {
      fields[FIELD_REVIEWED_BY] =
        reviewerNames.get(s.reviewedBy) ?? `User ${s.reviewedBy}`;
    }
    const eventSlug = s.project.user?.pinnedEvent?.event?.slug;
    if (eventSlug) {
      fields[FIELD_EVENT_SUBMITTED_TO] = eventSlug;
    }
    updates.push({ id: s.airtableRecId!, fields });
  }
  return updates;
}

async function main(): Promise<void> {
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'WRITE'}`);

  console.log('Loading submissions from Postgres…');
  const updates = await loadUpdates();
  console.log(`Found ${updates.length} Airtable-linked submissions.`);

  let patched = 0;
  const failed: { id: string; reason: string }[] = [];

  for (let i = 0; i < updates.length; i += 10) {
    const batch = updates.slice(i, i + 10);
    for (const u of batch) {
      console.log(
        `  ${u.id}  ${Object.entries(u.fields)
          .map(([k, v]) => `${k}: → ${v}`)
          .join('  ')}`,
      );
    }
    if (!DRY_RUN) {
      try {
        await patchApprovedProjects(batch, { typecast: TYPECAST });
        patched += batch.length;
      } catch {
        // One bad record id (e.g. deleted in Airtable) fails the whole
        // batch — retry individually so the rest still land.
        for (const u of batch) {
          try {
            await patchApprovedProject(u.id, u.fields, {
              typecast: TYPECAST,
            });
            patched++;
          } catch (err) {
            failed.push({ id: u.id, reason: (err as Error).message });
          }
          await new Promise((r) => setTimeout(r, 250));
        }
      }
      // 5 req/sec base limit — keep ~4 req/sec.
      await new Promise((r) => setTimeout(r, 250));
    }
    if ((i + 10) % 100 === 0) {
      console.log(`[progress] ${Math.min(i + 10, updates.length)}/${updates.length}`);
    }
  }

  console.log('');
  console.log('── Summary ───────────────────────────────────────────');
  console.log(`Linked submissions:  ${updates.length}`);
  console.log(`Patched:             ${DRY_RUN ? 0 : patched}`);
  console.log(`Failed:              ${failed.length}`);
  if (failed.length) {
    console.log('');
    console.log('Failed records:');
    for (const f of failed) console.log(`  ${f.id}  ${f.reason}`);
  }
  if (DRY_RUN) console.log('(dry run — no writes were made)');
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => disconnectPrisma().catch(() => {}));
