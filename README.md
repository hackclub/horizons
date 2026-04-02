# Horizons

Horizons is Hack Club's spring event platform where high school students submit projects, earn hours via Hackatime, and receive approval and feedback from reviewers. It powers the full lifecycle: onboarding, project creation, time tracking, submission review, and a reward shop.

## Architecture Overview

Horizons is a **pnpm monorepo** with four services behind a single gateway:

```
                        ┌──────────────────────────────────┐
                        │          Gateway (:3000)         │
                        │        Express.js proxy          │
                        └──┬──────────┬──────────┬────────┘
                           │          │          │
               ┌───────────▼──┐ ┌─────▼──────┐ ┌▼──────────────┐
               │ Frontend     │ │ Admin      │ │ Backend        │
               │ SvelteKit    │ │ SvelteKit  │ │ NestJS + Prisma│
               │ :5173 (dev)  │ │ :5174 (dev)│ │ :3002          │
               └──────────────┘ └────────────┘ └───────┬────────┘
                                                       │
                                                ┌──────▼──────┐
                                                │  PostgreSQL  │
                                                │  + Redis     │
                                                └─────────────┘
```

**Routing through the gateway:**
- `/` -> Frontend (user-facing app)
- `/admin/*` -> Admin dashboard
- `/api/*` -> Backend API

## Project Structure

```
horizon/
├── backend/          # NestJS 11 API server (Prisma, PostgreSQL, Redis)
├── frontend/         # User-facing SvelteKit 5 app
├── admin/            # Admin & reviewer SvelteKit 5 dashboard
├── gateway/          # Express.js reverse proxy
├── pnpm-workspace.yaml
└── package.json      # Root workspace scripts
```

## Tech Stack

| Layer      | Technology                                    |
|------------|-----------------------------------------------|
| Frontend   | SvelteKit 2, Svelte 5 (runes), Tailwind 4    |
| Admin      | SvelteKit 2, Svelte 5 (runes), Tailwind 4    |
| Backend    | NestJS 11, Prisma 7, PostgreSQL, Redis        |
| Gateway    | Express.js, http-proxy-middleware             |
| API Client | openapi-fetch (auto-generated TypeScript types)|
| Build      | Vite 7, pnpm workspaces                       |
| Deploy     | Docker (multi-stage, Node 20 Alpine)          |

## Shared Patterns

### Authentication & Authorization
- **Cookie-based sessions** validated by a global `AuthGuard` on the backend
- **Three roles**: `user`, `admin`, `reviewer` (enforced via `@Roles()` decorator + `RolesGuard`)
- **Reviewer scoping**: reviewer endpoints strip PII (no email, address, birthday)
- Frontend/admin call `requireAuth()` to check `/api/user/auth/me` and redirect if unauthenticated
- OAuth via Hack Club's HCA (OpenID Connect)

### API Communication
- Backend exposes OpenAPI docs at `/api/docs-json`
- Frontend and admin use `openapi-fetch` with auto-generated TypeScript types from the schema
- Run `pnpm --filter <frontend|admin> generate:api` to regenerate types after backend changes

### Svelte 5 Conventions
- **Runes**: `$state()`, `$derived()`, `$props()`, `$bindable()`, `$effect()`
- **Stores**: `writable`/`derived` from `svelte/store` with `$` auto-subscription
- **Component slots**: Svelte 5 snippet-based slots (`{@render children()}`)

### Design Themes
- **User-facing (frontend)**: beige/cream (`#f3e8d8`) with black borders, animated backgrounds
- **Admin management pages**: light theme with metrics dashboard
- **Reviewer interface**: dark theme (`#1c1c1c`) with orange accents

## Environment Variables

### Backend
```env
DATABASE_URL=              # PostgreSQL connection string
HACKCLUB_CLIENT_ID=        # HCA OAuth app client ID
HACKCLUB_CLIENT_SECRET=    # HCA OAuth app client secret
HACKCLUB_REDIRECT_URI=     # OAuth redirect URI
STATE_SECRET=              # Run: openssl rand -base64 32
```

### Frontend / Admin
```env
PUBLIC_API_URL=http://localhost:3000/
PUBLIC_HACKATIME_CUTOFF_DATE=2026-02-21T00:00:00Z
PUBLIC_ENABLE_ONBOARDING=true
```

### Gateway
```env
PORT=3000
SERVICE_URL=http://localhost:3002       # Backend
UI_SERVICE_URL=http://localhost:5173    # Frontend
ADMIN_UI_SERVICE_URL=http://localhost:5174  # Admin
```

## Running Locally

```bash
# 1. Install dependencies
pnpm install

# 2. Generate Prisma client
cd backend && pnpx prisma generate && cd ..

# 3. Run database migrations
cd backend && pnpx prisma migrate deploy && cd ..

# 4. Start all services concurrently
pnpm run dev
```

Open `http://localhost:3000` in your browser.

### Running Individual Services
```bash
pnpm --filter backend dev
pnpm --filter frontend dev
pnpm --filter admin dev
pnpm --filter gateway dev
```

### Regenerating API Types
```bash
pnpm --filter frontend generate:api
pnpm --filter admin generate:api
```

## Deployment

Each service has its own `Dockerfile` with multi-stage builds targeting Node 20 Alpine. All services expose port 3000 in production, with the gateway routing traffic to each.

## Database

PostgreSQL managed through Prisma. Key models:
- **User** - profiles, roles, fraud/sus flags, HCA IDs
- **Project** - student projects with type, hours, URLs
- **Submission** - per-project submission with approval status
- **ReviewerNote** - notes from reviewers on projects/users
- **ReviewChecklist** - 7-item checklist per submission
- **Transaction** - shop purchases

Run `pnpm --filter backend prisma:migrate` for migrations and `pnpm --filter backend prisma:generate` to regenerate the client.
