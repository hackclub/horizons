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

## Adding a new script

Drop a `.ts` file in `scripts/`, import from `lib/airtable.ts` for Airtable
I/O, `lib/manifest.ts` for Unified manifest lookups, and `lib/prisma.ts` for
read-only DB access. Add a `package.json` script entry so it's discoverable.
