# Admin Stats Dashboard

The admin home page (`/admin/home`) displays a comprehensive stats dashboard. All data is served by `GET /api/admin/stats` (defined in `backend/src/admin/admin.service.ts`).

Time-series charts pull from the `historical_metrics` table, populated by a daily cron job (`backend/src/admin/metrics-snapshot.service.ts`) and a manual backfill endpoint (`POST /api/admin/stats/backfill`).

## Data Sources

**Live queries** (computed on each request from current DB state):
- User funnel, user growth, review stats, review projects, signups per event, UTM sources, DAU per event

**Historical metrics** (pre-computed daily snapshots from `historical_metrics` table):
- DAU over time, daily hours logged, new signups, submissions created, reviews completed, median review time

---

## User Funnel

Each stage counts distinct **users** who meet the criteria. A user only needs one qualifying project to count.

| Stage | Query | SQL/Prisma Logic |
|-------|-------|-----------------|
| Total Users | `User.count()` | All users in the system |
| Has Hackatime Account | `User.count({ hackatimeAccount: not null })` | Users who linked a Hackatime account |
| Created Project | `User.count({ projects: { some: {} } })` | Users with at least 1 project |
| 10+ Hackatime Hours | `User.count({ projects: { some: { nowHackatimeHours >= 10 } } })` | Users with any project that has 10+ tracked hours |
| At Least 1 Submission | `User.count({ projects: { some: { submissions: { some: {} } } } })` | Users with any project that has been shipped (submitted) |
| At Least 1 Approved Hour | `User.count({ projects: { some: { approvedHours >= 1 } } })` | Users with any project that has approved hours |
| 10+ Approved Hours | Raw SQL: `SUM(p.approved_hours) >= 10 GROUP BY user_id` | Users whose **total** approved hours across all projects >= 10 |
| 30+ Approved Hours | Same as above with threshold 30 | |
| 60+ Approved Hours | Same as above with threshold 60 | |

**Note:** The 10+/30+/60+ approved hours stages use raw SQL because they require summing `approved_hours` across all of a user's projects (Prisma's `some` filter checks individual projects, not sums).

---

## User Growth

| Metric | Calculation |
|--------|-------------|
| Total Users | `User.count()` |
| New users in the past 7 days | `User.count({ createdAt >= 7 days ago })` |
| New users in the past 30 days | `User.count({ createdAt >= 30 days ago })` |
| % User growth (7d) | `newLast7Days / (totalUsers - newLast7Days) * 100` — percentage of the pre-existing user base that the new 7-day signups represent |

**Chart:** New Users (30d) — daily new signups from `historical_metrics` where `metric = 'new_signups'`.

---

## Daily Active Users (DAU)

DAU is determined by the **Hackatime API**, not from our database. The daily cron job queries each linked user's Hackatime stats for that day.

| Metric | Calculation |
|--------|-------------|
| DAUs today | Most recent value from `historical_metrics` where `metric = 'dau'` |
| Avg. DAU (7d) | Mean of last 7 daily DAU values |
| Avg. DAU (30d) | Mean of last 30 daily DAU values |
| % DAU growth (7d) | `(avg_last_7_days - avg_previous_7_days) / avg_previous_7_days * 100` — compares this week's average DAU to last week's |

**How DAU is computed (cron job):**
1. Query all users with a non-null `hackatimeAccount`
2. For each user, call `GET /api/v1/users/{account}/stats?features=projects&start_date={date}&end_date={date}`
3. If `total_seconds > 0`, the user was active that day
4. DAU = count of active users

**DAU per event:** Uses `Project.updatedAt` as a proxy for activity today. Joins `projects` -> `pinned_events` -> `events` to group active users by their pinned event:
```sql
SELECT e.event_id, e.title, e.slug, COUNT(DISTINCT p.user_id)
FROM projects p
INNER JOIN pinned_events pe ON pe.user_id = p.user_id
INNER JOIN events e ON e.event_id = pe.event_id
WHERE p.updated_at >= today_start
GROUP BY e.event_id, e.title, e.slug
```

**Chart:** DAU over time (30d) — from `historical_metrics` where `metric = 'dau'`.

**Daily Hours Logged chart:** From `historical_metrics` where `metric = 'total_tracked_hours'`. This is the cumulative `SUM(now_hackatime_hours)` across all projects as of each snapshot date.

---

## Review Stats — Hours

All computed live from current project state.

| Metric | Calculation |
|--------|-------------|
| Tracked Hours | `SUM(project.nowHackatimeHours)` across all projects |
| Unshipped Hours | `SUM(project.nowHackatimeHours)` for projects with **no** submissions |
| Shipped Hours | `SUM(project.nowHackatimeHours)` for projects with **at least 1** submission |
| Hours in Review | `SUM(project.now_hackatime_hours)` for projects whose **latest** submission has `approval_status = 'pending'` (raw SQL with correlated subquery to find the max `created_at` submission) |
| Approved Hours | `SUM(project.approvedHours)` across all projects |
| Weighted Grants | `approvedHours / 10` |

**Hours in Review SQL:**
```sql
SELECT COALESCE(SUM(p.now_hackatime_hours), 0)
FROM projects p
WHERE EXISTS (
  SELECT 1 FROM submissions s
  WHERE s.project_id = p.project_id
    AND s.approval_status = 'pending'
    AND s.created_at = (
      SELECT MAX(s2.created_at) FROM submissions s2
      WHERE s2.project_id = p.project_id
    )
)
```

**Chart:** Median Review Time (30d) — from `historical_metrics` where `metric = 'median_review_time_hours'`. The cron computes this via:
```sql
SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (
  ORDER BY EXTRACT(EPOCH FROM (reviewed_at - created_at)) / 3600.0
) AS median_hours
FROM submissions
WHERE reviewed_at BETWEEN day_start AND day_end
```

---

## Review Stats — Projects

Project funnel showing the review pipeline. All computed live.

| Metric | Calculation |
|--------|-------------|
| Shipped | Projects with >= 1 submission (`submissions: { some: {} }`) |
| Fraud Checked | Projects with `joeFraudPassed = true` AND at least 1 submission. **Includes** already-reviewed projects. |
| In Queue | Projects with `joeFraudPassed = true` AND a pending submission, but **no** approved or rejected submissions. These are truly waiting for human review. |
| Reviewed | Projects with at least 1 submission that is approved or rejected |
| Approved | Projects with at least 1 approved submission |

**In Queue** uses a `NOT` clause to exclude projects that have any approved/rejected submission:
```
where: {
  joeFraudPassed: true,
  submissions: { some: { approvalStatus: 'pending' } },
  NOT: { submissions: { some: { approvalStatus: { in: ['approved', 'rejected'] } } } }
}
```

**Chart:** Projects Reviewed (30d) — from `historical_metrics` where `metric = 'reviews_completed'` (count of submissions reviewed per day).

---

## Signups

| Metric | Calculation |
|--------|-------------|
| Total Signups | `User.count()` |
| Per Event | `COUNT(pinned_events)` grouped by event, joined to `events` table for title/slug. Uses `PinnedEvent` as a proxy for "planning to attend" since there's no RSVP model. |

**Chart:** Signups (30d) — from `historical_metrics` where `metric = 'new_signups'`.

---

## Referral Sources (UTM)

| Metric | Calculation |
|--------|-------------|
| Sources | `User.groupBy({ by: ['utmSource'] })` where `utmSource IS NOT NULL`, ordered by count descending |

UTM source is captured during signup: the `utm_source` query parameter on the login URL is passed through the OAuth state and stored on `User.utmSource` during user creation.

---

## Historical Metrics (Cron Job)

**Schedule:** Daily at midnight UTC (`@Cron('0 0 * * *')`)
**Service:** `MetricsSnapshotService` in `backend/src/admin/metrics-snapshot.service.ts`

The cron computes all metrics for the **previous day** and upserts them into `historical_metrics` as individual rows (one per metric per day).

| Metric key | Value |
|-----------|-------|
| `dau` | Count of users with Hackatime activity (via API) |
| `new_signups` | Users created that day |
| `submissions_created` | Submissions created that day |
| `reviews_completed` | Submissions reviewed that day |
| `median_review_time_hours` | Median hours between submission creation and review |
| `total_users` | Cumulative user count as of that day |
| `total_projects` | Cumulative project count as of that day |
| `total_tracked_hours` | Cumulative `SUM(nowHackatimeHours)` as of that day |
| `total_approved_hours` | Cumulative `SUM(approvedHours)` as of that day |
| `funnel` | JSON object with all 9 funnel values as of that day |
| `review_hours` | JSON object with tracked/unshipped/shipped/inReview/approved/weightedGrants |
| `review_projects` | JSON object with shipped/fraudChecked/inQueue/reviewed/approved |
| `signup_per_event` | JSON array of `{ eventId, title, slug, count }` |
| `utm_sources` | JSON array of `{ source, count }` |

**Backfill:** `POST /api/admin/stats/backfill?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD` recomputes all metrics for the given date range. DAU will be 0 for backfilled dates since the Hackatime API cannot provide historical daily activity retroactively.

### Database Schema

```prisma
model HistoricalMetric {
  id        Int      @id @default(autoincrement())
  date      DateTime @db.Date
  metric    String   @db.VarChar(100)
  value     Json
  createdAt DateTime @default(now())

  @@unique([date, metric])
  @@index([metric])
  @@map("historical_metrics")
}
```
