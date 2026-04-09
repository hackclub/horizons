# Metabase Queries

SQL queries for Metabase questions/dashboard cards. All queries target the Horizons PostgreSQL database.

## Files

| File | Dashboard Section |
|------|------------------|
| `01-user-funnel.sql` | User funnel (9 stages) |
| `02-user-growth.sql` | User growth stats + daily signups |
| `03-dau.sql` | Daily active users + DAU per event |
| `04-review-stats-hours.sql` | Review stats — hours breakdown |
| `05-median-review-time.sql` | Median review time over 30 days |
| `06-review-stats-projects.sql` | Review stats — project funnel + in queue |
| `07-projects-reviewed-daily.sql` | Projects reviewed per day (30d) |
| `08-signups.sql` | Signup totals + per event |
| `09-signups-daily.sql` | Daily signups (30d chart) |
| `10-signup-routes.sql` | Origin country → destination event routes |
| `11-utm-sources.sql` | Referral sources (UTM) |
| `12-dau-per-event.sql` | DAU breakdown by pinned event |
| `13-daily-hours-logged.sql` | Daily total tracked hours from snapshots |

## Setup

Point Metabase at the same PostgreSQL database the backend uses. All queries use the snake_case table/column names from Prisma's `@@map` directives.

## Notes

- DAU queries that use `historical_metrics` require the daily cron job to have run (or a backfill via `POST /api/admin/stats/backfill`).
- Queries marked "live" compute from current DB state and can be used as Metabase questions without historical snapshots.
- For funnel visualizations, use Metabase's "Funnel" chart type with the result of `01-user-funnel.sql`.
