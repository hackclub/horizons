# CLAUDE.md

## Project Overview

Horizons is Hack Club's spring event platform — a pnpm monorepo with four services: frontend (SvelteKit 5), admin (SvelteKit 5), backend (NestJS 11 + Prisma), and gateway (Express.js proxy). See `README.md`, `frontend/FRONTEND.md`, `admin/ADMIN.md`, and `backend/BACKEND.md` for detailed architecture docs.

This is a pnpm workspace monorepo. Type checking: `pnpm --filter frontend check` / `pnpm --filter admin check` (svelte-check) and `pnpm --filter backend lint` (ESLint). Backend also has `pnpm --filter backend format` (Prettier).

## Workspace Layout

- `frontend/` — User-facing SvelteKit app (port 5173 dev)
- `admin/` — Admin/reviewer SvelteKit dashboard (port 5174 dev, base path `/admin`)
- `backend/` — NestJS API server (port 3002)
- `gateway/` — Express proxy that unifies everything at port 3000

Gateway routes: `/` → frontend, `/admin/*` → admin, `/api/*` → backend.

### Backend Modules

The backend is organized into NestJS feature modules under `backend/src/`:

- `auth/` — HCA OAuth login, session management, global AuthGuard, role decorators
- `user/` — User profile service (RSVP system currently disabled)
- `projects/` — Project CRUD, submission creation, Hackatime project linking
- `reviewer/` — Review queue, approve/reject flow, notes, checklist (PII-scoped)
- `admin/` — Metrics, user/project management, fraud flags, settings, Slack lookup
- `shop/` — Shops, items, variants, purchases, transaction fulfillment
- `gift-codes/` — Gift code generation, email distribution, claiming
- `hackatime/` — Hackatime OAuth, hours tracking, project linking, recalculation
- `github/` — Repo info and README fetching with token pooling (reviewer/admin only)
- `events/` — Event CRUD and pinning
- `uploads/` — Image upload to Hack Club CDN
- `mail/` — Email queue service (currently disabled, logs only)
- `slack/` — Slack DM notifications (internal service, no controller)
- `airtable/` — Airtable record sync for users and approved projects (internal service)
- `health/` — Health check endpoint

See `backend/BACKEND.md` for full endpoint tables, database schema, and business flow documentation.

## Code Conventions

### Svelte (frontend + admin)
- **Svelte 5 runes only** — use `$state()`, `$derived()`, `$props()`, `$bindable()`, `$effect()`. No legacy `let` reactivity or `export let` props.
- **Snippet-based slots** — use `{@render children()}`, not `<slot>`.
- **Stores** — `writable`/`derived` from `svelte/store` with `$` auto-subscription for caching layers.
- **API calls** — always use the typed `api` client from `$lib/api` (openapi-fetch). Never use raw `fetch` for backend calls.
- **Styling** — Tailwind CSS 4 via `@tailwindcss/vite` plugin. No separate tailwind config file.
- **Typing** — TypeScript strict mode. Import types from the generated `schema.d.ts` as `components['schemas']['TypeName']`.

### Backend (NestJS)
- **Module pattern** — each feature is a NestJS module with its own controller, service, DTOs, and response types.
- **Auth** — global `AuthGuard` on all routes. Use `@Public()` to opt out. Use `@Roles(Role.Admin)` or `@Roles(Role.Reviewer, Role.Admin)` for restricted endpoints.
- **DTOs** — use `class-validator` decorators for request validation. Create DTOs in a `dto/` subdirectory.
- **Prisma** — inject `PrismaService`. No raw SQL except for complex aggregation queries.
- **TypeScript** — `strictNullChecks` is off, `noImplicitAny` is off. Decorators are enabled.
- **Error handling** — throw NestJS `HttpException` subclasses (`NotFoundException`, `BadRequestException`, etc.).

### Commit Style
- Conventional commits: `feat:`, `fix:`, `chore:` prefix, lowercase, short description.
- PRs are squash-merged with PR number suffix (e.g., `fix: cookie forwarding (#81)`).

## Key Patterns

### API Type Generation
Backend serves OpenAPI docs at `/api/docs-json`. Frontend and admin consume them:
```bash
pnpm --filter frontend generate:api   # writes frontend/src/lib/api/schema.d.ts
pnpm --filter admin generate:api      # writes admin/src/lib/api/schema.d.ts
```
Always regenerate after changing backend DTOs, controllers, or response types.

### Authentication Flow
OAuth via Hack Club Auth, session cookies, three roles (`user`, `admin`, `reviewer`). See `docs/auth-flow.md` for the full flow, guards, decorators, onboarding, and security details.

### Data Scoping by Role (IMPORTANT)
Every endpoint must respect role-based data scoping. Users must never see other users' data, fraud/sus flags, admin comments, or raw address fields. Reviewers must never see email, raw birthday, or address — only computed age via `scopeUserData()`. See `docs/data-scoping.md` for the full breakdown and guidelines for new endpoints.

### Admin Base Path
The admin app is mounted at `/admin` via `svelte.config.js` `paths.base`. All admin routes are relative to this.

## Common Pitfalls

- **Forgot to regenerate API types** — after backend changes, run `generate:api` for frontend/admin or you'll get type errors.
- **Prisma client not generated** — run `pnpx prisma generate` in `backend/` before first run or after schema changes.
- **Admin base path** — admin routes must account for the `/admin` base path. Use SvelteKit's `base` import from `$app/paths`.
- **Gateway must be running** — frontend and admin call `/api/*` which routes through the gateway. All 4 services need to be up for full functionality.

## Documentation

When making changes, update the relevant documentation: `README.md`, `frontend/FRONTEND.md`, `admin/ADMIN.md`, `backend/BACKEND.md`, and files in `docs/`. Create new docs in `docs/` when a feature, flow, or integration is complex enough to warrant its own explanation.

## IMPORTANT: DO NOT WRITE YOUR OWN MIGRATIONS
ONLY USE PRISMA CLI. This is to avoid conflicts in production. You are allowed to use Prisma CLI --create-only to create migrations. 