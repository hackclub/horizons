# Hackatime Hours Calculation

Hackatime is the time-tracking service that measures how many hours students spend on their projects. This document explains how hours are fetched, calculated, stored, and recalculated.

## Overview

```
Hackatime API                    Horizon Backend                   Database
─────────────                    ───────────────                   ────────
                                                                   
/stats?start_date=...  ────►  fetchDurationsAfterDate()  ────►  Project.nowHackatimeHours
                              calculateHackatimeHours()          Submission.hackatimeHours
                              Math.round((sec/3600)*10)/10       Project.approvedHours
```

Hours are only counted **after a cutoff date** (configured via `HACKATIME_CUTOFF_DATE`, defaults to `2025-10-10T00:00:00Z`). Time logged before the cutoff is excluded.

## Configuration

```env
HACKATIME_CLIENT_ID          # OAuth client ID (for user linking)
HACKATIME_CLIENT_SECRET      # OAuth client secret
HACKATIME_REDIRECT_URI       # OAuth callback URL
HACKATIME_API_KEY            # Admin API key (for server-side calls)
HACKATIME_ADMIN_API_URL      # Admin API base (default: https://hackatime.hackclub.com/api/admin/v1)
HACKATIME_CUTOFF_DATE        # Hours counted after this date (default: 2025-10-10T00:00:00Z)
```

## The Math

### Formula

```
totalHours = Math.round((totalSeconds / 3600) * 10) / 10
```

This rounds to **1 decimal place** (0.1 hour = 6 minutes).

| Seconds | Raw Hours | Result |
|---------|-----------|--------|
| 91234 | 25.342... | 25.3 |
| 90000 | 25.0 | 25.0 |
| 90180 | 25.05 | 25.1 |

### Per-Project Calculation

When a project has multiple linked Hackatime projects, hours are summed:

```typescript
let totalSeconds = 0;

for (const projectName of linkedProjectNames) {
  const match = hackatimeProjects.find(p => p.name === projectName);
  if (match) {
    totalSeconds += match.total_seconds;
  }
}

const hours = Math.round((totalSeconds / 3600) * 10) / 10;
```

The `total_seconds` values from the Hackatime API already respect the `start_date` filter (cutoff date), so no additional date filtering is needed client-side.

## Cutoff Date

The cutoff date controls which hours count. Only time logged **after** this date is included.

```typescript
const cutoffDate = new Date(process.env.HACKATIME_CUTOFF_DATE || '2025-10-10T00:00:00Z');
const startDate = cutoffDate.toISOString().split('T')[0];  // "2026-02-21"
// Passed as: ?start_date=2026-02-21
```

The cutoff is passed to the Hackatime API as `start_date`, which filters server-side. The backend does not do any date filtering itself.

## Hackatime API Calls

### Two Authentication Methods

| Method | Used By | Auth Header | Use Case |
|--------|---------|-------------|----------|
| **User OAuth token** | `hackatime.service.ts` | `Bearer {user.hackatimeAccessToken}` | User-initiated actions (listing projects, checking account) |
| **Admin API key** | `projects.service.ts`, `admin.service.ts` | `Bearer {HACKATIME_API_KEY}` | Server-side calculations (submission, recalculation) |

### Endpoints Called

**1. List user's projects (OAuth)**
```
GET https://hackatime.hackclub.com/api/v1/authenticated/projects?start_date={cutoff}
Authorization: Bearer {userAccessToken}
```
Returns: array of `{ name, total_seconds }` — used for listing available projects.

**2. List user's projects (Admin)**
```
GET https://hackatime.hackclub.com/api/admin/v1/user/projects?id={hackatimeUserId}
Authorization: Bearer {HACKATIME_API_KEY}
```
Returns: array of projects with `total_duration` — used for admin-side operations.

**3. Get project stats with cutoff (OAuth or Admin)**
```
GET https://hackatime.hackclub.com/api/v1/users/{hackatimeUserId}/stats?features=projects&start_date={cutoff}
Authorization: Bearer {token}
```
Returns: `data.projects[]` with `{ name, total_seconds }` — **this is the primary endpoint for hours calculation**. Only returns time after `start_date`.

## How Hours Are Stored

| Entity | Field | Type | Purpose |
|--------|-------|------|---------|
| **Project** | `nowHackatimeHours` | Float, nullable | Current calculated hours (updated frequently) |
| **Project** | `nowHackatimeProjects` | String[] | Names of linked Hackatime projects |
| **Project** | `approvedHours` | Float, nullable | Cumulative admin-approved hours |
| **Submission** | `hackatimeHours` | Float, nullable | Snapshot of hours at submission time |
| **Submission** | `approvedHours` | Float, nullable | Hours approved by reviewer for this submission |

**Key distinction:**
- `Project.nowHackatimeHours` = live value, recalculated on demand
- `Submission.hackatimeHours` = frozen snapshot taken at submission time

## When Hours Are Calculated

### 1. Linking Hackatime Projects

**Trigger**: `PUT /api/projects/:id/hackatime-projects`

When a user links or unlinks Hackatime projects:
- Validates no duplicate links across the user's other projects
- Fetches current hours from Hackatime API
- Updates `Project.nowHackatimeProjects` (array of names)
- Updates `Project.nowHackatimeHours` (calculated total)

### 2. Submission

**Trigger**: `POST /api/projects/auth/submissions`

When a user submits a project for review:
- Recalculates hours fresh from the Hackatime API (using admin key)
- Stores the result in `Submission.hackatimeHours` (snapshot)
- Also refreshes `Project.nowHackatimeHours`

### 3. User Self-Recalculation

**Trigger**: `POST /api/hackatime/hours/recalculate`

- Fetches all of the user's Hackatime data once
- Recalculates `nowHackatimeHours` for every project they own
- Returns `{ updatedProjects, totalNowHackatimeHours }`

### 4. Admin Single Recalculation

**Trigger**: `POST /api/admin/projects/:id/recalculate`

- Recalculates one project using admin API key
- **Strict mode** (default): throws if user has no linked Hackatime account
- Updates `Project.nowHackatimeHours`

### 5. Admin Bulk Recalculation

**Trigger**: `POST /api/admin/projects/recalculate-all`

- Iterates all projects in the database
- **Caches** Hackatime data per user to avoid redundant API calls (if a user has 3 projects, Hackatime is called once)
- Skips projects with no linked Hackatime account (non-strict)
- Returns detailed results: `{ processed, updated[], skipped[], errors[] }`

## Project Linking Rules

### Linking
- A Hackatime project can only be linked to **one** Horizon project per user
- Attempting to link a project that's already linked to another of the user's projects throws `BadRequestException`
- Linking can be updated even when the project is locked (these are system-managed fields)

### Unlinked vs Linked
- **Unlinked**: Hackatime projects in the user's account that aren't in any Horizon project's `nowHackatimeProjects` array
- **Linked**: Hackatime projects whose names appear in a specific project's `nowHackatimeProjects` array
- Determined by set comparison of project name strings

## User-Facing Hours Endpoints

| Endpoint | Returns |
|----------|---------|
| `GET /api/hackatime/hours/total` | Sum of `nowHackatimeHours` across all user's projects |
| `GET /api/hackatime/hours/approved` | Sum of `approvedHours` across all user's projects |
| `GET /api/projects/:id/hackatime-projects` | Per-project hour breakdown with live recalculation |

## Submission Validation

Before a submission is accepted, the following hours-related checks must pass:

```
- User must have a linked Hackatime account
- Project must have at least 1 linked Hackatime project (nowHackatimeProjects.length > 0)
- Project must have calculated hours (nowHackatimeHours !== null)
```

Hours are then recalculated fresh at submission time to ensure accuracy.

## Total Hours Aggregation

```typescript
// Sum across all user's projects
const total = await prisma.project.aggregate({
  where: { userId },
  _sum: { nowHackatimeHours: true },
});

const approved = await prisma.project.aggregate({
  where: { userId },
  _sum: { approvedHours: true },
});
```

Both return 0 if null. Leaderboard entries re-round to 1 decimal place.
