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
| Email | Email | | `user.email` |
| First Name | Single line text | | `user.firstName` |
| Last Name | Single line text | | `user.lastName` |
| Slack ID | Single line text | | `user.slackUserId` (empty string if unlinked) |
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
`YSWS_USERS_TABLE_ID`. Fields documented in
[`docs/airtable-sync.md`](../docs/airtable-sync.md#users-table).

## Approved Projects

One row per approved submission (the YSWS handoff). Env var:
`YSWS_APPROVED_PROJECTS_TABLE_ID`. Fields documented in
[`docs/airtable-sync.md`](../docs/airtable-sync.md#approved-projects-table).
