# airtable scripts

Ad-hoc operational scripts that run against the YSWS Approved Projects
Airtable. Mirrors the conventions in [`backend/scripts/`](../backend/scripts/):
TypeScript, run with `bun`, env loaded from `backend/.env` via `dotenv`.

## Setup

1. Add `airtable` to [`pnpm-workspace.yaml`](../pnpm-workspace.yaml) under
   `packages:` and run `pnpm install` at the repo root.
2. Make sure [`backend/.env`](../backend/.env) has the env vars listed at the
   top of each script (or drop overrides in `airtable/.env`).
3. The Prisma client is reused from `backend/generated/prisma/client`. Run
   `pnpm --filter backend prisma:generate` first if you haven't already.

## Scripts

### `sync-in-unified` — keep "In Unified Already?" honest

For every row in the Approved Projects table, look up the Code URL in the
Unified YSWS manifest and set the **In Unified Already?** field:

| Manifest state                                    | Field |
| ------------------------------------------------- | ----- |
| At least one submission with `shipStatus=shipped` | `yes` |
| Only drafts, or no manifest record at all         | `no`  |

```bash
cd airtable
bun scripts/sync-in-unified.ts --dry-run   # preview
bun scripts/sync-in-unified.ts             # write
```

### `fix-screenshots` — re-attach missing screenshots from the DB

For every row whose **Screenshot** attachment is empty, match the row to a
Horizons `Project` via `repoUrl == "Code URL"` and re-attach the screenshot
URL (prefers `project.screenshotUrl`, falls back to the latest submission's).

```bash
cd airtable
bun scripts/fix-screenshots.ts --dry-run   # preview
bun scripts/fix-screenshots.ts             # write
```

### `backfill-review-fields` — backfill Project Type and Reviewed By

For every Horizons submission linked to Airtable (`submission.airtableRecId`
set), PATCH its Approved Projects record with:

- **Project Type** — the raw `ProjectType` enum value (e.g. `web_playable`)
- **Reviewed By** — the reviewer's "First Last" name resolved from
  `submission.reviewedBy` (omitted if the submission has no reviewer)

Both fields must exist in Airtable first (single line text; or make Project
Type a single select and pass `--typecast` so Airtable creates the options).
Writes are blind but idempotent; a failed batch is retried record-by-record
so a record deleted in Airtable doesn't sink the rest.

```bash
cd airtable
bun scripts/backfill-review-fields.ts --dry-run   # preview
bun scripts/backfill-review-fields.ts             # write
```

### `check-records` — data-quality checks over every row

Runs a set of modular checks against every Approved Projects record and
reports failures. Current checks:

| Check                  | Fails when                                            |
| ---------------------- | ----------------------------------------------------- |
| `missing-screenshot`   | **Screenshot** attachment is empty                    |
| `missing-playable-url` | **Playable URL** is empty                             |
| `dead-playable-url`    | **Playable URL** doesn't respond (DNS failure, connection error, timeout, or HTTP ≥ 400) |
| `missing-code-url`     | **Code URL** is empty                                 |
| `dead-code-url`        | **Code URL** doesn't respond                          |

Read-only by default. With `--write`, findings are also PATCHed into a
long-text **Check Issues** field (create it in Airtable first; the backend
sync never touches it) and cleared on records that pass — so you can
group/filter on it in Airtable. HTTP 403s are flagged but annotated as
possible bot-blocking; eyeball those before treating them as dead.

```bash
cd airtable
bun scripts/check-records.ts                          # report only
bun scripts/check-records.ts --only=missing-screenshot,dead-playable-url
bun scripts/check-records.ts --write                  # write "Check Issues"
bun scripts/check-records.ts --write --field="QA Notes"
```

To add a new check, add an entry to the `CHECKS` array in the script — a
name plus a function that takes a record and returns an issue or `null`.

## Adding a new script

Drop a `.ts` file in `scripts/`, import from `lib/airtable.ts` for Airtable
I/O, `lib/manifest.ts` for Unified manifest lookups, and `lib/prisma.ts` for
read-only DB access. Add a `package.json` script entry so it's discoverable.
