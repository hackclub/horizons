# Airtable (YSWS) Sync

The backend syncs data one-way (Horizon → Airtable) to three tables in the YSWS Airtable base: a **Users** table for lifecycle events, an **Approved Projects** table for approved submissions, and a **Transactions** table mirroring the shop/event/adjustment ledger.

Canonical table field configs (names, types, select options) live in [`airtable/SCHEMA.md`](../airtable/SCHEMA.md) — follow that file when creating tables.

Flow:
1. Someone builds a project and logs hours via Hackatime.
2. They submit the project for review in Horizon.
3. A reviewer checks the code, demo, hours, and screenshots, then approves or requests changes.
4. **On approval**, Horizon syncs the student's personal info (name, address, birthday) and project details (URLs, hours, screenshots) to the Approved Projects table in Airtable. This is the handoff — Airtable automations downstream handle shipping logistics, grant calculations, and reporting.
5. If a reviewer later edits an already-approved submission (e.g., adjusting hours), the existing Airtable record is updated in place.

The Users table serves a separate purpose: tracking lifecycle milestones (sign-up, first project, first submission, onboarding) for engagement analytics and email automation via Loops. These syncs happen at each milestone, independent of the review flow.

## Configuration

```env
YSWS_AIRTABLE_API_KEY              # Airtable API key
YSWS_BASE_ID                       # Airtable base ID
YSWS_APPROVED_PROJECTS_TABLE_ID    # Table ID for approved projects
YSWS_USERS_TABLE_ID                # Table ID for user events
YSWS_TRANSACTIONS_TABLE_ID         # Table ID for the transactions mirror
```

All are optional. If any are missing, syncs silently return without error.

## Users Table

Tracks user lifecycle events. Each user has one row, looked up by email.

### Fields

| Airtable Field | Source | Set When |
|----------------|--------|----------|
| Email | `user.email` | First event |
| Horizons User ID | `user.userId` | First event |
| Loops - horizonsSignUpAt | ISO date | User signs up via OAuth |
| Loops - horizonsFirstProjectCreatedAt | ISO date | User creates their first project |
| Loops - horizonsFirstSubmitAt | ISO date | User submits a project for the first time |
| Loops - horizonsOnboardingCompletedAt | ISO date | User completes onboarding |
| Last Synced At | ISO datetime | Every backend write to the record (lifecycle events, stats syncs, daily sweep) |

### Sync Behavior

- **Lookup**: finds existing record by email using Airtable's `filterByFormula`
- **Create**: if no record exists, creates one with Email, Horizons User ID, and the event timestamp
- **Update**: if record exists, patches only if the event field is empty (never overwrites a timestamp)
- **Record ID**: stored in `user.airtableRecId` for future lookups

### Trigger Points

| Event | Triggered By | Location |
|-------|-------------|----------|
| `signUp` | New user completes OAuth | `auth.service.ts` → `findOrCreateUser()` |
| `firstProjectCreated` | User creates their first project | `projects.service.ts` → `createProject()` |
| `onboardingCompleted` | First project creation or explicit onboarding endpoint | `projects.service.ts` → `createProject()` / `auth.service.ts` → `completeOnboarding()` |
| `firstSubmit` | User's first submission across all projects | `projects.service.ts` → `createSubmission()` |

All syncs are fire-and-forget — errors are logged but never thrown to the caller.

## Approved Projects Table

Tracks each approved submission as a separate row.

### Fields

| Airtable Field | Source | Notes |
|----------------|--------|-------|
| First Name | `user.firstName` | |
| Last Name | `user.lastName` | |
| Email | `user.email` | |
| Birthday | `user.birthday` | Formatted as YYYY-MM-DD |
| Address (Line 1) | `user.addressLine1` | |
| Address (Line 2) | `user.addressLine2` | Empty string if null |
| City | `user.city` | |
| State / Province | `user.state` | |
| Country | `user.country` | |
| ZIP / Postal Code | `user.zipCode` | |
| Playable URL | `submission.playableUrl` | |
| Code URL | `submission.repoUrl` | |
| Screenshot | `submission.screenshotUrl` | Sent as attachment array: `[{ url, filename: screenshot-{timestamp}.png }]` |
| GitHub Username | Extracted from `repoUrl` | Parsed from GitHub URL path |
| Optional - Override Hours Spent | Delta hours | See Delta Hours below |
| Optional - Override Hours Spent Justification | `hoursJustification` | |
| Description | `submission.description` | Optional |
| Approved At | Today's date | YYYY-MM-DD at time of approval |

### Trigger Points

| Action | Triggered By | Location |
|--------|-------------|----------|
| **Create** record | First approval of a submission | `reviewer.service.ts` → `syncAirtable()` |
| **Update** record | Editing an already-approved submission | `reviewer.service.ts` → `updateAirtableRecord()` |

The returned Airtable record ID is stored in `submission.airtableRecId` for future updates.

### Delta Hours Calculation

Airtable receives **delta hours** (new hours earned), not cumulative totals. This prevents double-counting across resubmissions.

```
deltaHours = max(0, currentApprovedHours - previouslyApprovedHours)
```

The previous hours come from the most recent prior approved submission for the same project:

```typescript
const lastApproved = await prisma.submission.findFirst({
  where: {
    projectId: submission.projectId,
    approvalStatus: 'approved',
    createdAt: { lt: submission.createdAt },  // strictly before current
  },
  orderBy: { createdAt: 'desc' },
  select: { approvedHours: true },
});

const previousHours = lastApproved?.approvedHours || 0;
const delta = Math.max(0, currentApprovedHours - previousHours);
```

**Example:**

| Submission | Approved Hours | Previous | Delta Sent to Airtable |
|------------|---------------|----------|----------------------|
| 1st | 10 | 0 | 10 |
| 2nd (resubmit) | 25 | 10 | 15 |
| 3rd (resubmit) | 30 | 25 | 5 |

`Math.max(0, ...)` ensures delta is never negative (e.g., if an admin reduces hours).

## Transactions Table

Mirrors every `Transaction` row (all kinds: `ShopItem`, `EventTicket`, `EventRsvp`, `AdminAdjustment`) — one Airtable record per transaction. Field config in [`airtable/SCHEMA.md`](../airtable/SCHEMA.md#transactions). Identity fields are limited to email, name, and Slack ID — no address PII.

### Sync Behavior

- **Create**: when a transaction has no `airtableRecId`, `syncTransaction()` POSTs a new record and stores the returned record ID on the row (`transaction.airtableRecId`)
- **Update**: when `airtableRecId` is set, the record is PATCHed with the full current row state (explicit `null`s clear fields, so unfulfilling clears `Fulfilled At`)
- **404 healing**: if the Airtable record was deleted, the PATCH 404 nulls out `airtableRecId` and the next sweep recreates it
- **Catch-up sweep**: on startup and hourly (`AirtableSyncService`), every row with a null `airtableRecId` is batch-created (10 records/request, 250ms pacing). This covers the one-time backfill of pre-feature rows and any live sync that failed

### Trigger Points

| Event | Triggered By | Location |
|-------|-------------|----------|
| Shop purchase (per unit, incl. quantity > 1) | `processPurchase()` after commit | `balance.service.ts` |
| Event ticket purchase | `buyTicket()` after commit | `events.service.ts` |
| Admin balance adjustment | `adjustUserHours()` after commit | `admin.service.ts` |
| Refund / fulfill / unfulfill | after the status update | `shop.service.ts` |
| Backfill + missed syncs | startup + hourly cron | `airtable-sync.service.ts` |

`EventRsvp` rows are legacy — nothing creates them anymore; existing rows are picked up by the sweep. All live syncs are fire-and-forget: failures are logged and healed by the sweep (creates) or retried on the next status change (updates).

`airtableRecId` is an internal pointer and is omitted from user-facing transaction responses (`getUserTransactions`).

## Backfill Service

A one-time backfill utility (`airtable-backfill.service.ts`) can retroactively sync all existing users to the Users table.

- **Trigger**: runs on module init if `RUN_AIRTABLE_USERS_BACKFILL=true`
- **Behavior**: iterates all users, syncs `signUp` (from `user.createdAt`), `firstProjectCreated` (from first project's `createdAt`), and `firstSubmit` (from earliest submission)
- **Rate limiting**: 700ms delay between users (~3 API calls per user, Airtable limit is 5 req/s)
- **Output**: logs synced/failed/skipped counts and a message to remove the env flag when done

## Error Handling

- **User events**: fire-and-forget with `.catch()` — errors logged, never thrown
- **Approved projects**: errors caught in the reviewer service and logged, but don't block the review action
- **No retries**: failed syncs are not retried. Manual re-approval or backfill is needed to fix gaps.
- **Missing config**: if API key or table IDs are unset, methods return early without error
