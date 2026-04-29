# Data Scoping by Role

Each role sees a different slice of the data. This document covers what's visible, what's hidden, and how the backend enforces it.

## Users

Users can only see **their own data**. All project/submission endpoints check `userId === requestingUserId` and throw `ForbiddenException` on mismatch. There are no endpoints for browsing other users' data.

### What users see about themselves

| Data | Visible | Notes |
|------|---------|-------|
| Name, email, birthday | Yes | Returned from `/api/user/auth/me` |
| Address | **No** | Only `hasAddress: boolean` is returned, never the actual fields |
| Slack ID, verification status | Yes | |
| Role, onboarding status | Yes | |
| Raffle position | Yes | |
| Hackatime account | Yes | Account ID only, not access token |
| Fraud/sus flags | **No** | Stripped via `excludeAdminFields()` |
| Admin comments | **No** | Never included in user responses |

### What users see about their projects

| Data | Visible | Notes |
|------|---------|-------|
| Project fields (title, description, URLs, hours) | Yes | |
| Submissions (status, hours) | Yes | |
| `hoursJustification` | **No** | Stripped via `excludeAdminFields()` |
| Fraud review fields (`joeFraudPassed`, `joeTrustScore`, `joeJustification`, etc.) | **No** | Stripped via `excludeAdminFields()` |
| `adminComment` on project | **No** | Never included |
| Submission `reviewPassed` | **No** | Reviewer gate — stripped via `scopeSubmissionForUser()` |
| Submission `finalizedAt`, `pendingSendEmail`, `reviewedBy`, `airtableRecId`, `reviewerAnalysis` | **No** | Stripped via `scopeSubmissionForUser()` |
| Silent-reject state (reviewer approved + fraud failed) | **No** | Remapped to `approvalStatus='pending'` for users via `scopeSubmissionForUser()` |

The legacy `Project.isFraud` admin flag has been removed. Fraud state is driven exclusively by Joe (`joeFraudPassed`).

### Enforcement

`projects.service.ts` uses `excludeAdminFields()` for Project-level scoping and `scopeSubmissionForUser()` for Submission-level scoping. Both are applied to all user-facing responses (including the `/me` endpoint in `auth.service.ts`).

## Reviewers

Reviewers see submission and project data for the review queue, but **user PII is stripped**. They cannot see other users' email, address, or raw birthday.

### What reviewers see about submission authors

| Data | Visible | Notes |
|------|---------|-------|
| First name, last name | Yes | |
| Slack user ID | Yes | For contacting via Slack |
| Age | Yes | **Computed** from birthday, raw date never returned |
| Hackatime start date | Yes | Per-user cutoff override (non-PII, operational — helps explain pre-default-cutoff hours) |
| Email | **No** | |
| Birthday (raw) | **No** | Only age is exposed |
| Address | **No** | |
| Fraud/sus flags | **No** | |

### What reviewers see about submissions

| Data | Visible | Notes |
|------|---------|-------|
| Submission status, hours, description, URLs | Yes | |
| Hackatime hours breakdown | Yes | |
| Project title, type, repo URL, playable URL | Yes | |
| Full submission timeline (all submissions on the project) | Yes | |
| Reviewer names on prior reviews | Yes | First/last name only |
| Audit log details (who changed what) | **No** | Admin-only |

### What reviewers can write

| Data | Writable | Notes |
|------|----------|-------|
| Approval status | Yes | `approved` or `rejected` |
| Approved hours | Yes | |
| User feedback / hours justification | Yes | |
| Reviewer notes (per-project, per-user) | Yes | Shared `adminComment` field |
| Review checklist | Yes | 7-item checklist per submission |

### Enforcement

`reviewer.service.ts` uses two mechanisms:

**1. `SCOPED_USER_SELECT`** — a Prisma select clause that only fetches safe fields:

```typescript
const SCOPED_USER_SELECT = {
  userId: true,
  firstName: true,
  lastName: true,
  slackUserId: true,
  birthday: true,  // fetched but not returned directly
  hackatimeStartDate: true,
};
```

**2. `scopeUserData()`** — transforms the fetched data, replacing birthday with computed age:

```typescript
private scopeUserData(user) {
  let age = null;
  if (user.birthday) {
    const today = new Date();
    const birth = new Date(user.birthday);
    age = today.getFullYear() - birth.getFullYear();
    // adjust if birthday hasn't occurred this year
  }
  return { userId, firstName, lastName, slackUserId, age };
}
```

Birthday is fetched from the database to compute age, but the raw date is never included in the response.

## Admins

Admins have **full access** to all data.

### What admins see beyond reviewers

| Data | Notes |
|------|-------|
| User emails | Full email addresses |
| User birthdays | Raw dates, not just age |
| User addresses | Complete: line 1, line 2, city, state, country, zip |
| Fraud signals | `User.isFraud`, `User.isSus` (manual admin flags) and `Project.joeFraudPassed` / `joeTrustScore` / `joeJustification` (Joe-driven) |
| Admin comments | Read/write on users and projects |
| Submission audit logs | Full history: who reviewed, what changed, before/after values |
| Hackatime access tokens | Stored but not returned in API responses |

### Admin-specific Prisma include

```typescript
const projectAdminInclude = {
  user: {
    select: {
      userId, firstName, lastName, email,
      birthday,
      addressLine1, addressLine2, city, state, country, zipCode,
      hackatimeAccount,
      isFraud, isSus, // user-level manual flags
      createdAt, updatedAt,
    },
  },
  submissions: true,
};
```

### What admins can write

| Data | Notes |
|------|-------|
| Fraud flag on users | `PUT /api/admin/users/:id/fraud-flag` (project-level fraud is read-only, driven by Joe) |
| Sus flag on users | `PUT /api/admin/users/:id/sus-flag` |
| Slack ID on users | `PUT /api/admin/users/:id/slack` |
| Unlock projects | `PUT /api/admin/projects/:id/unlock` |
| Delete projects | `DELETE /api/admin/projects/:id` |
| Submissions freeze | `PUT /api/admin/settings/submissions-frozen` |
| Recalculate hours | Single or bulk recalculation |

## Summary Table

| Data | User | Reviewer | Admin |
|------|------|----------|-------|
| Own profile (name, email) | Yes | — | — |
| Own address | `hasAddress` only | — | — |
| Other user's name | No | Yes | Yes |
| Other user's email | No | No | Yes |
| Other user's age | No | Yes (computed) | Yes (raw birthday) |
| Other user's address | No | No | Yes |
| Fraud/sus flags | No | No | Yes |
| Admin comments | No | Read/write | Read/write |
| Hours justification | No | Read/write | Read/write |
| Audit logs | No | No | Yes |
| Own projects/submissions | Yes | — | — |
| All projects/submissions | No | Queue only | Yes |

## Guidelines for New Endpoints

When adding new endpoints, follow these rules:

- **User endpoints**: always filter by `userId`. Use `excludeAdminFields()` on any project/submission data. Never return address fields, fraud flags, or admin comments.
- **Reviewer endpoints**: use `SCOPED_USER_SELECT` when fetching user data. Always pass through `scopeUserData()` before returning. Never expose email or raw birthday.
- **Admin endpoints**: use `projectAdminInclude` for full data access. No scoping needed.
- **Never return** `hackatimeAccessToken` to any role — it's an internal credential.
