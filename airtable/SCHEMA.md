# Airtable Table Schemas

Canonical field configs for the tables the backend syncs to in the YSWS base
(`YSWS_BASE_ID`). When creating or recreating a table, match these field names
**exactly** — the sync sends literal field names and Airtable rejects unknown
ones. Sync behavior is documented in [`docs/airtable-sync.md`](../docs/airtable-sync.md).

## Transactions

Mirror of the `transactions` Postgres table — one row per transaction, all
kinds (`ShopItem`, `EventTicket`, `EventRsvp`, `AdminAdjustment`). Created live
on purchase, PATCHed in place on fulfill/unfulfill/refund; an hourly sweep
backfills any row that missed its live sync. The Airtable record id is stored
back in `transactions.airtable_rec_id`.

Env var: `YSWS_TRANSACTIONS_TABLE_ID`

| Field name | Airtable type | Config | Source |
|---|---|---|---|
| Transaction ID | Number | Integer precision | `transactionId` |
| User | Link to another record | Link to the **Users** table (single record). Empty until the user has an `airtableRecId` (i.e. has synced to the Users table). | `user.airtableRecId` |
| Email | Lookup | Lookup via the **User** link → Users `Email`. Read-only; not written by the sync. | (lookup) |
| Slack ID | Lookup | Lookup via the **User** link → Users `Slack ID`. Read-only; not written by the sync. | (lookup) |
| First Name | Single line text | | `user.firstName` |
| Last Name | Single line text | | `user.lastName` |
| Kind | Single select | Options (pre-create all four, exact spelling): `ShopItem`, `EventTicket`, `EventRsvp`, `AdminAdjustment` | `kind` |
| Item Description | Long text | | `itemDescription` (up to 500 chars) |
| Item Name | Single line text | | `item.name` (empty for non-shop kinds) |
| Variant Name | Single line text | | `variant.name` (empty if no variant) |
| Event Name | Single line text | | `event.title` (empty for non-event kinds) |
| Cost (Hours) | Number | 1 decimal place, **must allow negative** (AdminAdjustment credits are stored as negative cost) | `cost` |
| Fulfilled | Checkbox | | `isFulfilled` |
| Fulfilled At | Date | Include time | `fulfilledAt` (cleared on unfulfill) |
| Refunded At | Date | Include time | `refundedAt` |
| Created At | Date | Include time | `createdAt` |

Notes:
- The sync always sends the full field set with explicit `null`s, so manual
  edits to these columns in Airtable get overwritten on the next PATCH. Add
  extra Airtable-only columns freely — the sync never touches fields it
  doesn't know.
- Deleting a record in Airtable is self-healing: the next PATCH attempt gets a
  404, the backend nulls its `airtable_rec_id`, and the hourly sweep recreates
  the record.

## Users

Lifecycle/engagement table — one row per user, looked up by email. Env var:
`YSWS_USERS_TABLE_ID`. Lifecycle (Loops) fields documented in
[`docs/airtable-sync.md`](../docs/airtable-sync.md#users-table).

Computed stats fields, rewritten by `syncUserStats` (live hooks) and the daily
sweep:

| Field name | Airtable type | Source |
|---|---|---|
| Approved Hours | Number, 1 decimal | sum of approved project hours |
| Hours in Review | Number, 1 decimal | hours on projects whose latest submission isn't fully finalized: approval pending, or fraud review (Joe) still pending — except rejected submissions, which are terminal |
| Unsubmitted Hours | Number, 1 decimal | Hackatime hours on never-submitted projects |
| Chosen Event | Single line text | pinned event slug |
| Country | Single line text | `user.country` |
| Slack ID | Single line text | `user.slackUserId` |
| Slack Username | Single line text | `user.slackUsername` (Slack display name, cached from Slack API) |
| Birthday | Date | `user.birthday` (date only, sent as `YYYY-MM-DD`; empty if unset) |
| Last Synced At | Date (include time) | stamped with the current timestamp on every backend write to the record (lifecycle events, stats syncs, daily sweep, pre-auth sign-up) |

## Approved Projects

One row per approved submission (the YSWS handoff). Env var:
`YSWS_APPROVED_PROJECTS_TABLE_ID`. Fields documented in
[`docs/airtable-sync.md`](../docs/airtable-sync.md#approved-projects-table).
