# Metabase Queries

SQL queries for Metabase questions/dashboard cards. All queries target the Horizons PostgreSQL database.

## Files

| File | Dashboard Section | Chart Type |
|------|------------------|------------|
| `01-user-funnel.sql` | User funnel (9 stages) | Funnel |
| `02-user-growth.sql` | User growth stats | Number cards |
| `03-dau.sql` | Daily active users + summary cards | Line + Numbers |
| `04-review-stats-hours.sql` | Review stats — hours breakdown | Number cards |
| `05-median-review-time.sql` | Median review time (weekly avg) | Line (per week) |
| `06-review-stats-projects.sql` | Review stats — project funnel + in queue | Funnel + Number |
| `07-projects-reviewed-daily.sql` | Projects reviewed (cumulative) | Line |
| `08-signups.sql` | Signup totals + per event | Number + Table |
| `09-signups-daily.sql` | Signups (cumulative) | Line |
| `10-signup-routes.sql` | Origin country → destination event routes | Map / Table |
| `11-utm-sources.sql` | Referral sources (UTM) | Bar |
| `12-dau-per-event.sql` | DAU breakdown by pinned event | Table |
| `13-daily-hours-logged.sql` | Daily hours logged (actual, not cumulative) | Line |

## Setup

Point Metabase at the same PostgreSQL database the backend uses. All queries use the snake_case table/column names from Prisma's `@@map` directives.

## Notes

- **Historical data:** Queries using `historical_metrics` require the daily cron job to have run (or a backfill via `POST /api/admin/stats/backfill`).
- **DAU & Daily Hours:** Computed via the Hackatime `/api/summary` endpoint. Returns actual daily coding time, not cumulative totals. DAU = users with >0 seconds that day.
- **Cumulative charts:** Signups (`09`) and projects reviewed (`07`) show running totals, not daily counts.
- **Median review time:** Grouped by ISO week and averaged (`05`). X-axis is per-week, not per-day.
- **Daily hours logged:** Actual hours coded that day from Hackatime, not the cumulative `nowHackatimeHours` field.
- **Live queries:** Funnel (`01`), growth (`02`), hours (`04`), project stats (`06`), signups (`08`), UTM (`11`) compute from current DB state — no historical snapshots needed.
- **Geocoding:** Signup routes (`10`) rely on `users.country` (from HCA OAuth) and `events.country` (admin-set field). The backend geocodes these via Nominatim for map coordinates.
