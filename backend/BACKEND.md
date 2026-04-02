# Backend

NestJS 11 API server for Horizons. Manages authentication, projects, submissions, reviews, the shop, and integrations with Hack Club Auth, Hackatime, Airtable, Slack, and GitHub.

## Directory Structure

```
backend/src/
├── main.ts                      # Bootstrap (CORS, Helmet, Swagger, validation pipes)
├── app.module.ts                # Root module (registers all feature modules)
├── prisma.service.ts            # Prisma client wrapper
├── redis.service.ts             # Redis operations
├── job-lock.service.ts          # Distributed job locking
├── posthog.service.ts           # PostHog analytics
├── http-exception.filter.ts     # Global exception handler
├── metadata.ts                  # Swagger metadata
├── datadog.config.ts            # Datadog tracing
│
├── auth/                        # Authentication & session management
├── user/                        # User profile service
├── projects/                    # Project CRUD & submission creation
├── reviewer/                    # Submission review queue & actions
├── admin/                       # Admin dashboard operations
├── shop/                        # Shop, items, variants, transactions
├── gift-codes/                  # Promotional gift codes
├── hackatime/                   # Hackatime OAuth & hours tracking
├── mail/                        # Email service (currently disabled)
├── slack/                       # Slack bot integration
├── airtable/                    # Airtable record sync
├── github/                      # GitHub repo info & README fetching
├── uploads/                     # Image upload to CDN
├── events/                      # Event management
└── health/                      # Health check endpoint
```

## Modules

---

### Auth (`/api/user/auth`)

Handles Hack Club Auth (HCA) OAuth login, session management, and onboarding.

**Endpoints:**

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/login` | Public | Returns HCA OAuth URL (accepts optional `referralCode`, `email`) |
| GET | `/callback` | Public | OAuth callback — exchanges code, creates/updates user, sets session cookie |
| GET | `/me` | User | Returns current user with projects and submissions |
| POST | `/verify-session` | User | Validates session is still active |
| POST | `/logout` | User | Clears session and cookies |
| POST | `/complete-onboarding` | User | Marks onboarding as complete, syncs to Airtable |
| GET | `/onboarding-status` | User | Checks if user still needs to complete profile |
| GET | `/raffle-pos` | User | Returns user's raffle position number |
| POST | `/sync` | User | Forces re-login to sync HCA profile data |

**Key implementation details:**
- State tokens are HMAC-signed with 10-minute TTL
- Sessions expire after 21 days
- `findOrCreateUser()` checks for duplicate HCA accounts, links Hackatime, assigns raffle position, and syncs to Airtable
- Cookie flags: `httpOnly`, `secure` (production), `sameSite: strict/lax`

**Guards & Decorators:**
- `AuthGuard` (global) — validates session cookie, injects `req.user`
- `RolesGuard` — checks `user.role` against `@Roles()` decorator
- `@Public()` — bypasses auth
- `@Roles(Role.Admin)` — restricts to specific roles

---

### User (`/api/user`)

User profile service. The RSVP/sticker system is currently disabled (all methods throw "not enabled").

**Methods (service only, no active endpoints):**
- `createInitialRsvp()` — disabled
- `completeRsvp()` — disabled
- `getRsvpCount()` — returns `{ count: 0 }`
- `verifyStickerToken()` — marks StickerToken as used

---

### Projects (`/api/projects`)

User-facing project creation, editing, submission, and Hackatime linking.

**Endpoints:**

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| POST | `/auth` | User | Create new project |
| GET | `/auth` | User | List current user's projects |
| GET | `/auth/:id` | User | Get project with submissions |
| PUT | `/auth/:id` | User | Update project fields |
| DELETE | `/auth/:id` | User | Delete project (only if no submissions) |
| POST | `/auth/submissions` | User | Submit project for review |
| GET | `/auth/:id/submissions` | User | Get project's submissions |
| PUT | `/auth/:id/hackatime-projects` | User | Link Hackatime projects |
| GET | `/auth/:id/hackatime-projects` | User | Get linked projects with hours |

**Submission validation rules:**
- User must be under 19 years old
- User address must be complete
- Hackatime account must be linked
- All required project fields must be filled (title, description, repo URL, playable URL, screenshot)
- Global submissions freeze must be off

**Key logic:**
- `createProject()` uses a Redis lock to prevent race conditions
- First project creation auto-completes onboarding and syncs to Airtable
- `createSubmission()` recalculates hours from Hackatime API before submitting
- `updateHackatimeProjects()` validates projects aren't linked to other users
- Hackatime hours are calculated from a configurable cutoff date

---

### Reviewer (`/api/reviewer`)

Submission review queue and actions. Accessible to `reviewer` and `admin` roles.

**Endpoints:**

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/queue` | Reviewer | List pending submissions (PII-scoped) |
| GET | `/submissions/:id` | Reviewer | Full submission detail with timeline |
| PUT | `/submissions/:id/review` | Reviewer | Review submission (approve/reject with hours and feedback) |
| POST | `/submissions/:id/quick-approve` | Reviewer | Auto-approve using Hackatime hours |
| GET | `/projects/:id/notes` | Reviewer | Get shared reviewer note on project |
| PUT | `/projects/:id/notes` | Reviewer | Save reviewer note on project |
| GET | `/users/:id/notes` | Reviewer | Get shared reviewer note on user |
| PUT | `/users/:id/notes` | Reviewer | Save reviewer note on user |
| GET | `/submissions/:id/checklist` | Reviewer | Get 7-item review checklist state |
| PUT | `/submissions/:id/checklist` | Reviewer | Save checklist state |

**PII scoping:** Reviewer endpoints never expose email, address, or birthday. Only `userId`, `firstName`, `lastName`, `slackUserId`, and computed `age` are returned via `scopeUserData()`.

**Review flow:**
1. Reviewer pulls queue → gets pending submissions with project/user overview
2. Selects submission → gets full detail with timeline of all submissions and reviews
3. Reviews: sets `approvalStatus`, `approvedHours`, `userFeedback`, `hoursJustification`
4. Creates audit log entry
5. On first approval: syncs to Airtable with delta hours (subtracts previously approved hours)
6. Sends Slack DM always on status change; email is conditional

**Quick approve:** Auto-fills `approvedHours` from Hackatime hours, sets status to `approved`, sends Slack notification only (no email).

---

### Admin (`/api/admin`)

Full administrative operations. Accessible to `admin` role only.

**Endpoints:**

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| **Submissions** |||
| GET | `/submissions` | Admin | All submissions with full user/project details |
| GET | `/submissions/:id/audit-logs` | Admin | Audit log history for a submission |
| **Projects** |||
| GET | `/projects` | Admin | All projects with user details |
| GET | `/projects/:id/timeline` | Admin | Full project timeline (creation, submissions, reviews) |
| POST | `/projects/:id/recalculate` | Admin | Recalculate hours from Hackatime |
| POST | `/projects/recalculate-all` | Admin | Bulk recalculate all projects |
| PUT | `/projects/:id/unlock` | Admin | Unlock a locked project |
| DELETE | `/projects/:id` | Admin | Delete a project |
| **Users** |||
| GET | `/users` | Admin | All users with projects and submissions |
| PUT | `/users/:id/fraud-flag` | Admin | Toggle `isFraud` flag |
| PUT | `/users/:id/sus-flag` | Admin | Toggle `isSus` flag |
| PUT | `/users/:id/slack` | Admin | Manually set `slackUserId` |
| **Metrics** |||
| GET | `/metrics` | Admin | Dashboard metrics (total hours, users, projects, submitted projects) |
| GET | `/reviewer-leaderboard` | Admin | Reviewer stats (approved, rejected, total, last reviewed) |
| GET | `/priority-users` | Admin | Users near 50-hour threshold with pending approvals |
| **Slack** |||
| GET | `/slack/lookup-by-email` | Admin | Find Slack user by email |
| GET | `/slack/user-info` | Admin | Get Slack user info by ID |
| **Settings** |||
| GET | `/settings` | Admin | Global settings (submissions freeze flag) |
| PUT | `/settings/submissions-frozen` | Admin | Toggle global submissions freeze |

**Key operations:**
- `recalculateProjectHours()` re-fetches hours from Hackatime API for individual or all projects
- `getProjectTimeline()` builds a comprehensive timeline with creation, submissions, reviews, and audit log entries
- `getPriorityUsers()` uses raw SQL to find users who need 50+ hours and would reach it with pending approvals

---

### Shop (`/api/shop`)

Shop items, variants, purchases, and transaction management.

**Endpoints:**

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| **Public** |||
| GET | `/shops` | Public | List public shops |
| GET | `/:slug/items` | Public | List items in a shop |
| GET | `/:slug/items/:id` | Public | Get specific item |
| **User** |||
| GET | `/auth/balance` | User | User's balance (approved hours - spent) |
| POST | `/auth/purchase` | User | Purchase item (validates eligibility, stock, limits) |
| GET | `/auth/transactions` | User | User's transaction history |
| GET | `/auth/pinned-item` | User | Get pinned item |
| POST | `/auth/pinned-item` | User | Set pinned item |
| DELETE | `/auth/pinned-item` | User | Remove pinned item |
| **Admin** |||
| GET | `/admin/shops` | Admin | List all shops |
| POST | `/admin/shops` | Admin | Create shop |
| PUT | `/admin/shops/:id` | Admin | Update shop |
| DELETE | `/admin/shops/:id` | Admin | Delete shop |
| POST | `/admin/shops/:shopId/items` | Admin | Create item |
| PUT | `/admin/items/:id` | Admin | Update item |
| DELETE | `/admin/items/:id` | Admin | Delete item |
| POST | `/admin/items/:id/variants` | Admin | Create variant |
| PUT | `/admin/variants/:id` | Admin | Update variant |
| DELETE | `/admin/variants/:id` | Admin | Delete variant |
| GET | `/admin/transactions` | Admin | List transactions (filter by shopId) |
| DELETE | `/admin/transactions/:id` | Admin | Refund (delete transaction) |
| PUT | `/admin/transactions/:id/fulfill` | Admin | Mark fulfilled (sends email) |
| DELETE | `/admin/transactions/:id/fulfill` | Admin | Unmark fulfilled |

**Purchase validation:**
- Checks user is `verified_eligible` via external Hack Club API
- Validates item/variant exists and is active
- Enforces `maxPerUser` limit
- Special handling for item #1 (Midnight ticket) — registers user in attend.hackclub.com

---

### Gift Codes (`/api/gift-codes`)

Promotional gift code distribution via email.

**Endpoints:**

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/:code` | Public | Get gift code info (image, description, claimed status) |
| POST | `/:code/claim` | Public | Mark code as claimed |
| POST | `/admin/send` | Admin | Generate and email codes to multiple recipients |
| GET | `/admin` | Admin | List all gift codes |

**Send flow:** Generates unique hex codes, looks up user names, builds Fillout claim URL with parameters, sends email with claim link.

---

### Hackatime (`/api/hackatime`)

Hackatime OAuth integration and hours tracking.

**Endpoints:**

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/link` | User | Get Hackatime OAuth URL |
| GET | `/callback` | User | OAuth callback (auto-closes browser window) |
| POST | `/unlink` | User | Unlink Hackatime account |
| GET | `/projects/unlinked` | User | Projects not linked to any Horizon project |
| GET | `/projects/linked/:id` | User | Projects linked to specific project |
| GET | `/projects/all` | User | All user's Hackatime projects |
| GET | `/hours/total` | User | Total `nowHackatimeHours` across all projects |
| GET | `/hours/approved` | User | Total approved hours |
| POST | `/hours/recalculate` | User | Recalculate all project hours from Hackatime |
| GET | `/account` | User | Check if account is linked and token is valid |

**Key logic:**
- OAuth state tokens are HMAC-signed with user ID
- `handleCallback()` checks for duplicate Hackatime accounts across users
- Hours are fetched since a configurable cutoff date (currently 2026-02-21)
- `recalculateNowHackatimeHours()` updates all projects in parallel
- `calculateHackatimeHours()` sums durations and rounds to 0.1 hours

---

### GitHub (`/api/github`)

GitHub repository information and README fetching. Accessible to `reviewer` and `admin` roles.

**Endpoints:**

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/repo?url=<github-url>` | Reviewer | Fetch repo stats, commits with diff stats |
| GET | `/readme?url=<github-url>` | Reviewer | Get raw README markdown content |

**Key implementation details:**
- **Token pooling:** Distributes API calls across multiple GitHub tokens (configured via `GITHUB_TOKENS` env var, comma-separated). Tracks per-token usage to stay under 5000 req/hr per token.
- **Commit fetching:** Retrieves all commits in batches of 15, includes additions/deletions stats per commit.
- **README resolution:** Tries `raw.githubusercontent.com` across common branches (`main`, `master`) and filenames (`README.md`, `readme.md`, `README`).
- Falls back to unauthenticated requests (60 req/hr) if no tokens configured.

---

### Events (`/api/events`)

Event (hackathon) management.

**Endpoints:**

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/` | Public | List active events |
| GET | `/auth/pinned-event` | User | Get user's pinned event |
| POST | `/auth/pinned-event` | User | Pin event by slug |
| DELETE | `/auth/pinned-event` | User | Unpin event |
| GET | `/admin` | Admin | List all events |
| GET | `/admin/:slug` | Admin | Get event by slug |
| POST | `/admin` | Admin | Create event |
| PUT | `/admin/:slug` | Admin | Update event |
| DELETE | `/admin/:slug` | Admin | Delete event |

---

### Uploads (`/api/uploads`)

Image upload to Hack Club CDN.

**Endpoints:**

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| POST | `/` | User | Upload image (100MB max, 2 req/min throttle) |

Validates image MIME type, uploads to Hack Club CDN via `HC_CDN_API_KEY`, returns `{ url }`.

---

### Mail (internal service)

Email sending service. **Currently disabled** — logs intent but does not send via SMTP.

**Email types supported:**
- RSVP confirmation
- Early supporter stickers (delayed 5 min)
- OTP codes
- Submission approved/denied
- Gift code claim links
- Order fulfilled notifications

Uses MJML templates for HTML rendering. Has a job queue with distributed locking for scheduled emails.

---

### Slack (internal service)

Slack bot integration. No controller — used internally by other modules.

**Methods:**
- `lookupSlackUserByEmail(email)` — find user by email
- `getSlackUserInfo(slackUserId)` — get display name and email
- `sendDirectMessage(slackUserId, text, blocks?)` — open DM channel and post message
- `notifySubmissionReview(slackUserId, project, status, hours, feedback)` — formatted review notification with emoji

Called by the Reviewer service on every submission status change.

---

### Airtable (internal service)

Syncs data to Airtable. No controller — used internally by other modules.

**Methods:**
- `syncUserEvent(userId, eventName)` — creates/updates User record with event timestamps (signUp, firstProjectCreated, firstSubmit, onboardingCompleted)
- `createApprovedProject(submission)` — creates Approved Projects record on first approval (with delta hours calculation)
- `updateApprovedProject(submission)` — updates existing record when re-editing an approval

---

### Health (`/api/healthcheck`)

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/` | Public | Returns `{ success: true, message: 'Health check passed' }` |

---

## Database Schema

Managed by Prisma. Schema at `prisma/schema.prisma` with 30+ migrations.

### Core Models

| Model | Key Fields | Purpose |
|-------|------------|---------|
| **User** | hcaId, email, firstName, lastName, birthday, address fields, role, onboardComplete, hackatimeAccount, hackatimeAccessToken, rafflePos, airtableRecId, isFraud, isSus | Student profiles |
| **Project** | userId, projectTitle, projectType, description, approvedHours, nowHackatimeHours, nowHackatimeProjects[], URLs, isLocked, isFraud | Student projects |
| **Submission** | projectId, approvalStatus, approvedHours, hackatimeHours, hoursJustification, reviewedBy, reviewedAt, airtableRecId | Per-project submissions |
| **SubmissionAuditLog** | submissionId, adminId, action, newStatus, approvedHours, changes (JSON) | Review audit trail |
| **ReviewerNote** | projectId or userId, content | Shared reviewer notes |
| **ReviewerChecklist** | submissionId, checkedItems (JSON) | 7-item per-submission checklist |

### Commerce Models

| Model | Key Fields | Purpose |
|-------|------------|---------|
| **Shop** | slug, description, isActive, isPublic | Shop containers |
| **ShopItem** | shopId, name, cost, maxPerUser, isActive, imageUrl | Purchasable items |
| **ShopItemVariant** | itemId, name, cost, isActive | Item variants |
| **Transaction** | userId, itemId, variantId, cost, isFulfilled | Purchase records |
| **PinnedItem** | userId, itemId | User's pinned shop item |

### Other Models

| Model | Key Fields | Purpose |
|-------|------------|---------|
| **Event** | slug, title, startDate, endDate, hourCost, isActive | Hackathon events |
| **PinnedEvent** | userId, eventId | User's pinned event |
| **UserSession** | userId, expiresAt | Auth sessions (21-day TTL) |
| **EmailJob** | recipientEmail, status, scheduledFor, lockedBy | Email queue |
| **GiftCode** | code, email, filloutUrl, isClaimed | Promotional codes |
| **GlobalSettings** | submissionsFrozen | App-wide flags |
| **HackatimeLinkOtp** | otpCode, email, userId | OTP for Hackatime linking |

### Enums

- **Role**: `user`, `admin`, `reviewer`
- **ProjectType**: `windows_playable`, `mac_playable`, `linux_playable`, `web_playable`, `cross_platform_playable`, `hardware`
- **ApprovalStatus**: `pending`, `approved`, `rejected`

## Security

### Authentication
- Session-based with 21-day expiry
- HMAC-signed state tokens with 10-minute TTL
- Cookie flags: `httpOnly`, `secure` (production), `sameSite: strict/lax`
- Global `AuthGuard` on all routes (opt out with `@Public()`)

### Authorization
- Role-based: `@Roles(Role.Admin)`, `@Roles(Role.Reviewer, Role.Admin)`
- PII scoping for reviewers (no email, address, birthday exposed)
- Fraud/sus flags hidden from normal users

### Rate Limiting
- Global: 1M requests/hour
- File uploads: 2 requests/minute
- Applied via NestJS `ThrottlerModule`

### Audit Trail
- `SubmissionAuditLog` records every review action with admin ID, status change, hours, and diff of changes

## External Integrations

| Service | Purpose | Config |
|---------|---------|--------|
| **Hack Club Auth** | OAuth login (OpenID Connect) | `HACKCLUB_CLIENT_ID`, `HACKCLUB_CLIENT_SECRET`, `HACKCLUB_REDIRECT_URI` |
| **Hackatime** | Time tracking OAuth + hours API | `HACKATIME_CLIENT_ID`, `HACKATIME_CLIENT_SECRET`, `HACKATIME_API_KEY` |
| **Airtable** | Record sync for users and approved projects | `AIRTABLE_API_KEY`, `AIRTABLE_BASE_ID` |
| **Slack** | DM notifications to students | `SLACK_BOT_TOKEN` |
| **GitHub** | Repo info and README for reviewers | `GITHUB_TOKENS` (comma-separated pool) |
| **Hack Club CDN** | Image uploads | `HC_CDN_API_KEY` |
| **PostHog** | Analytics | `POSTHOG_API_KEY` |
| **Datadog** | APM tracing | `DD_TRACE_ENABLED` |
| **attend.hackclub.com** | Midnight ticket registration | Called on item #1 purchase |

## Key Business Flows

### Project Submission
1. User creates project → Redis lock prevents duplicates → auto-completes onboarding
2. User links Hackatime projects → validates not linked to other users
3. User fills all fields (title, description, repo, playable URL, screenshot)
4. User submits → validates age < 19, address complete, Hackatime linked, submissions not frozen
5. Hours recalculated from Hackatime API at submission time

### Submission Review
1. Reviewer fetches queue → pending submissions with PII-scoped user data
2. Reviewer opens submission → full detail with timeline
3. Reviewer sets status, hours, feedback → audit log created
4. First approval → Airtable record created with delta hours
5. Subsequent edits → Airtable record updated
6. Slack DM sent always; email sent conditionally

### Shop Purchase
1. User checks balance (approved hours - spent)
2. User purchases → validates `verified_eligible` via external API, checks stock and per-user limits
3. Transaction created, balance deducted
4. Item #1 (Midnight ticket) → registers in attend.hackclub.com
5. Admin fulfills → email sent to user
