# Authentication & Authorization

Session-based authentication via Hack Club Auth (HCA) OAuth, with role-based access control across three roles: `user`, `admin`, `reviewer`.

## Flow Overview

```
Landing Page
  │
  ▼
GET /api/user/auth/login ──► Hack Club Auth (OAuth)
  │                                    │
  │  (signed state token, 10min TTL)   │  (user logs in)
  │                                    │
  │                                    ▼
  │                          GET /api/user/auth/callback
  │                            ├─ verify state signature + TTL
  │                            ├─ exchange code for tokens
  │                            ├─ fetch user info from HCA
  │                            ├─ find or create user in DB
  │                            ├─ create session (21-day expiry)
  │                            ├─ set sessionId cookie
  │                            └─ redirect: new users → /app/onboarding (always);
  │                               otherwise the stored redirect path or /app
  │
  ▼
App Layout (frontend or admin)
  ├─ requireAuth() → GET /api/user/auth/me
  ├─ if not authenticated → redirect to landing
  └─ if onboarding incomplete → redirect to /app/onboarding
```

## OAuth Login

**Provider**: Hack Club Auth (`https://auth.hackclub.com`)

**Scopes requested**: `openid email name profile birthdate address verification_status slack_id basic_info`

### State Token

The login URL includes a signed state token to prevent CSRF:

- **Signing**: HMAC-SHA256 using `STATE_SECRET` env var
- **Encoding**: base64url
- **TTL**: 10 minutes
- **Payload**: `{ referralCode, timestamp, redirectPath }`

The callback verifies the signature and checks the timestamp hasn't expired before proceeding.

### Post-login Redirect

`GET /api/user/auth/login` accepts an optional `redirect` query param. It rides inside the signed state token as `redirectPath` and the callback redirects there after setting the session cookie. Two safeguards apply:

- **Relative paths only** — the callback rejects anything that doesn't start with `/` (or that starts with `//`), so a tampered state can't leave the origin.
- **New users always land on `/app/onboarding`** — a stored redirect cannot skip onboarding.

The admin login page uses this to return reviewers to the exact admin page they were headed to (e.g. `redirect=/admin/review`).

### Token Exchange

On callback (`GET /api/user/auth/callback?code=...&state=...`):

1. Verify state signature and TTL
2. Exchange authorization code for tokens via `POST https://auth.hackclub.com/oauth/token`
3. Fetch user profile via `GET https://auth.hackclub.com/oauth/userinfo`
4. Create or update user record
5. Create session, set cookie, redirect

## Session Management

### Cookie Configuration

```
Name:     sessionId
HttpOnly: true
Secure:   true (production only)
SameSite: strict (production) / lax (development)
Path:     /
MaxAge:   21 days
Domain:   COOKIE_DOMAIN env var (optional)
```

A secondary `email` cookie is set for new users only (10-minute expiry, used by the landing page).

### Session Storage

Sessions live in the `UserSession` database table with fields: `id`, `userId`, `expiresAt`. The `sessionId` cookie value is the session's primary key.

### Validation

On every request, the global `AuthGuard` (unless `@Public()`):

1. Reads `sessionId` from cookies
2. Looks up the session in the database
3. Checks `expiresAt > now`
4. Injects `request.user` with the full user object
5. Throws `401 Unauthorized` if invalid or expired

### Logout

`POST /api/user/auth/logout` clears both cookies and deletes the session from the database.

## User Creation & Lookup

`findOrCreateUser()` handles both new signups and returning users:

**Lookup order**:
1. By `hcaId` (Hack Club Auth subject ID) — primary identifier
2. By `email` — secondary, catches users who existed before HCA linking

**New user defaults**:
- `role: 'user'`
- `firstName` / `lastName` from HCA claims (falls back to `'Temporary'` / `'User'`)
- `birthday`, `address`, `slackUserId`, `verificationStatus` from HCA claims
- `hackatimeAccount` looked up by email if available
- `rafflePos` calculated as max existing + 1
- Triggers Airtable `signUp` event sync

**Existing user updates**:
- `firstName`, `lastName`, `slackUserId`, `verificationStatus`, `birthday` updated if changed
- Address replaced as a unit from the HCA claim (all six fields, including clearing a dropped line 2); skipped when the claim has no street address so a transiently empty claim never wipes a stored address
- `hcaId`, `referralCode` set only if previously missing

## Roles & Guards

### Role Enum

```typescript
enum Role {
  User = 'user',
  Admin = 'admin',
  Reviewer = 'reviewer',
}
```

### Guards

| Guard | Scope | Behavior |
|-------|-------|----------|
| `AuthGuard` | Global (all routes) | Validates session cookie, injects `request.user`. Bypassed by `@Public()`. |
| `RolesGuard` | Per-controller/route | Checks `request.user.role` against `@Roles()` metadata. Returns 403 if no match. |

### Decorators

| Decorator | Purpose | Example |
|-----------|---------|---------|
| `@Public()` | Skip auth entirely | Login and callback endpoints |
| `@Roles(Role.Admin)` | Restrict to admin | Admin dashboard endpoints |
| `@Roles(Role.Reviewer, Role.Admin)` | Restrict to reviewer or admin | Review queue, submission review |
| `@CurrentUser()` | Inject user from request | Parameter decorator for controller methods |

### Access Patterns

| Area | Required Role | Guard |
|------|--------------|-------|
| Public endpoints (login, callback, health) | None | `@Public()` |
| User endpoints (projects, shop, hackatime) | `user` (any authenticated) | `AuthGuard` only |
| Reviewer endpoints (`/api/reviewer/*`) | `reviewer` or `admin` | `AuthGuard` + `RolesGuard` |
| Admin endpoints (`/api/admin/*`) | `admin` | `AuthGuard` + `RolesGuard` |

## Onboarding

### Status Check

`GET /api/user/auth/onboarding-status` returns:

```typescript
{
  onboardComplete: boolean,     // user.onboardComplete flag
  needsBirthday: boolean,       // birthday is default (2000-01-01)
  isTemporaryUser: boolean,     // firstName is 'Temporary'
  hasPrefilledData: boolean,    // !isTemporaryUser && !needsBirthday
}
```

### Completion Triggers

Onboarding is marked complete (`onboardComplete: true`) in two places:

1. **Explicit**: `POST /api/user/auth/complete-onboarding` — user finishes the onboarding flow
2. **Implicit**: user creates their first project — `createProject()` auto-completes onboarding

Both sync an `onboardingCompleted` event to Airtable.

### Frontend Enforcement

The app layout (`/app/+layout.svelte`) checks onboarding status on mount. If `PUBLIC_ENABLE_ONBOARDING=true` and `onboardComplete` is false, the user is redirected to `/app/onboarding`. The onboarding page is a multi-step flow: introduction, event selection, project setup, and Hackatime linking.

## Frontend Auth

### requireAuth() (`frontend/src/lib/auth.ts`)

```typescript
export async function requireAuth() {
  const response = await api.GET('/api/user/auth/me');
  if (!response.data || !response.data.hcaId) {
    window.location.href = '/';
    return false;
  }
  return true;
}
```

Called in the app layout's `onMount()`. Redirects unauthenticated users to the landing page.

### Landing Page

The landing page (`/+page.svelte`) checks auth on mount:
- If authenticated and onboarding incomplete → redirect to `/app/onboarding`
- If authenticated → redirect to `/app`
- If not authenticated → show landing page with login

## Admin Auth

### Admin Panel

The admin app is self-contained for auth — reviewers and admins never need the participant frontend:

- **Login page** (`admin/src/routes/login/+page.svelte`, public): "Sign in with Hack Club" button that calls `GET /api/user/auth/login?redirect=<intended admin path>` and forwards to the OAuth URL. If the visitor is signed in but lacks a privileged role, it shows an "no reviewer/admin access" state with a sign-out-and-switch-account action and a link to the main site.
- **Layout gate** (`(app)/+layout.svelte`): resolves the user once via the shared `$lib/auth` store (`ensureUser()`); unauthenticated visitors are sent to `/admin/login?next=<current path>` so login returns them to where they were headed. Non-privileged users are sent to the login page's unauthorized state.
- **Global 401 handling** (`$lib/api/client.ts` middleware): any 401 mid-session redirects to `/admin/login?next=<current path>` (skipped on the login page itself, which probes `/me` while signed out).
- **Sign out**: the sidebar's sign-out button calls `POST /api/user/auth/logout`, clears the store, and lands on `/admin/login`.

Privileged roles for the admin app: `admin`, `superadmin`, `reviewer`, `event_viewer`.

## Security Summary

| Measure | Implementation |
|---------|---------------|
| XSS protection | `httpOnly` cookies (JS can't read session) |
| CSRF protection | `sameSite: strict` in production + HMAC-signed state tokens |
| HTTPS enforcement | `secure: true` cookie flag in production |
| Session expiry | 21-day TTL, validated against database on every request |
| State replay | 10-minute TTL on OAuth state tokens |
| Role enforcement | Global `AuthGuard` + per-route `RolesGuard` |
| PII scoping | Reviewer endpoints strip email, address, birthday |
