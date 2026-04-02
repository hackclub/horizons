# AGENTS.md

Instructions for AI coding agents working on this codebase.

## Project Structure

This is a pnpm monorepo with four services:

| Service | Stack | Port (dev) | Directory |
|---------|-------|------------|-----------|
| Frontend | SvelteKit 5, Svelte 5, Tailwind 4 | 5173 | `frontend/` |
| Admin | SvelteKit 5, Svelte 5, Tailwind 4 | 5174 | `admin/` |
| Backend | NestJS 11, Prisma 7, PostgreSQL | 3002 | `backend/` |
| Gateway | Express.js | 3000 | `gateway/` |

The gateway proxies all traffic: `/` → frontend, `/admin/*` → admin, `/api/*` → backend.

## Commands

```bash
pnpm install                              # Install all dependencies
pnpm run dev                              # Start all services
pnpm --filter <service> dev               # Start one service

# Backend
cd backend && pnpx prisma generate        # Generate Prisma client (required before first run)
cd backend && pnpx prisma migrate dev     # Create/apply DB migrations
pnpm --filter backend lint                # ESLint
pnpm --filter backend test                # Jest

# Frontend / Admin
pnpm --filter frontend generate:api       # Regenerate OpenAPI types
pnpm --filter admin generate:api
pnpm --filter frontend check              # Type check (svelte-check)
pnpm --filter admin check
```

## Backend Modules

The backend (`backend/src/`) is organized into NestJS feature modules:

- `auth/` — HCA OAuth login, session management, global AuthGuard, role decorators
- `user/` — User profile service (RSVP currently disabled)
- `projects/` — Project CRUD, submission creation, Hackatime project linking
- `reviewer/` — Review queue, approve/reject, notes, checklist (PII-scoped, reviewer+admin only)
- `admin/` — Metrics, user/project management, fraud flags, settings (admin only)
- `shop/` — Shops, items, variants, purchases, transactions
- `gift-codes/` — Gift code generation, email distribution, claiming
- `hackatime/` — Hackatime OAuth, hours tracking, recalculation
- `github/` — Repo info and README fetching with token pooling (reviewer+admin only)
- `events/` — Event CRUD and pinning
- `uploads/` — Image upload to Hack Club CDN
- `mail/` — Email queue (currently disabled, logs only)
- `slack/` — Slack DM notifications (internal service, no controller)
- `airtable/` — Airtable record sync (internal service, no controller)
- `health/` — Health check endpoint

## Coding Rules

### Svelte (frontend + admin)
- Use **Svelte 5 runes**: `$state()`, `$derived()`, `$props()`, `$bindable()`, `$effect()`. Do not use legacy `let` reactivity or `export let`.
- Use **snippet-based slots**: `{@render children()}`, not `<slot>`.
- Use the **typed `api` client** from `$lib/api` (openapi-fetch) for all backend calls. Never use raw `fetch`.
- Use **Tailwind CSS 4** for styling. There is no separate tailwind config file; it runs via the Vite plugin.
- Import API types from the generated schema: `components['schemas']['TypeName']`.
- Admin app has a **`/admin` base path** — use `base` from `$app/paths` when building URLs.

### Backend (NestJS)
- Each feature is a **NestJS module** with controller, service, DTOs (`dto/` subdirectory), and response types.
- **Auth is global** via `AuthGuard`. Use `@Public()` to make an endpoint public. Use `@Roles(Role.Admin)` or `@Roles(Role.Reviewer, Role.Admin)` for restricted access.
- Use **`class-validator` decorators** on DTOs for request validation.
- Use **`PrismaService`** for database access. Avoid raw SQL unless doing complex aggregations.
- Throw **NestJS `HttpException` subclasses** (`NotFoundException`, `BadRequestException`, etc.) for errors.
- TypeScript config has `strictNullChecks: false` and `noImplicitAny: false`.

### Reviewer PII Scoping
Reviewer endpoints must **never expose** email, address, or birthday. Only return: userId, firstName, lastName, slackUserId, and computed age. Use `scopeUserData()` in `reviewer.service.ts`.

## API Type Generation

Backend serves OpenAPI docs at `/api/docs-json`. Frontend and admin auto-generate TypeScript types from it.

**After any backend change to DTOs, controllers, or response types**, regenerate:
```bash
pnpm --filter frontend generate:api
pnpm --filter admin generate:api
```

Failing to do this will cause type errors in frontend/admin.

## Database

- ORM: Prisma 7 with PostgreSQL
- Schema: `backend/prisma/schema.prisma`
- After schema changes: run `pnpx prisma migrate dev` (creates migration) then `pnpx prisma generate` (regenerates client)
- Key models: User, Project, Submission, SubmissionAuditLog, ReviewerNote, ReviewerChecklist, Shop, ShopItem, Transaction, Event, GiftCode, GlobalSettings

## Authentication

1. OAuth via Hack Club Auth (OpenID Connect)
2. Backend sets session cookie on callback, validated by global `AuthGuard`
3. Frontend/admin check auth via `requireAuth()` which calls `/api/user/auth/me`
4. Three roles: `user`, `admin`, `reviewer`

## Commit Style

Conventional commits: `feat:`, `fix:`, `chore:` prefix, lowercase, short description.

## Common Pitfalls

- Run `pnpx prisma generate` in `backend/` before first run or after schema changes.
- Run `generate:api` for frontend/admin after backend endpoint changes.
- All 4 services must be running for full functionality (gateway routes everything).
- Hours are only counted after the `PUBLIC_HACKATIME_CUTOFF_DATE` env var.
- Admin routes are relative to the `/admin` base path.

## Documentation

- `README.md` — Project overview, setup, environment variables
- `frontend/FRONTEND.md` — Frontend architecture, navigation, caching, components
- `admin/ADMIN.md` — Admin/reviewer UI, pages, review tool
- `backend/BACKEND.md` — All modules, endpoints, database schema, business flows
