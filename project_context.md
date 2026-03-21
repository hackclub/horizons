# Horizons — Hack Club Spring Event

A platform for Hack Club's Horizons event where high school students submit projects, earn hours via Hackatime, and receive approval/feedback from reviewers.

## Architecture

- **Frontend**: SvelteKit 2 + Svelte 5, Tailwind CSS 4, Vite 7
- **Backend**: NestJS + Prisma (PostgreSQL)
- **Package manager**: pnpm
- **API communication**: OpenAPI-typed client (`openapi-fetch`) for user-facing routes; plain fetch for reviewer routes

## Codebase Structure

```
spring-event/
├── backend/
│   ├── prisma/
│   │   └── schema.prisma              # DB models (User, Project, Submission, ReviewerNote, etc.)
│   └── src/
│       ├── app.module.ts              # Root module — registers all feature modules
│       ├── auth/                      # Auth guard (global), roles guard, Role enum (user/admin/reviewer)
│       ├── admin/                     # Admin endpoints — full PII access, all CRUD
│       ├── reviewer/                  # Reviewer endpoints — scoped PII, review queue, approve/reject
│       │   ├── reviewer.controller.ts # GET /api/reviewer/queue, PUT .../review, notes, checklist
│       │   ├── reviewer.service.ts    # Scoped data queries, timeline builder, approval flow
│       │   └── dto/                   # ReviewSubmissionDto, SaveNoteDto, SaveChecklistDto
│       ├── projects/                  # User-facing project CRUD, submissions
│       ├── hackatime/                 # Hackatime hours integration
│       ├── mail/                      # Email service (templates, job queue)
│       ├── airtable/                  # Airtable sync for approved projects
│       ├── slack/                     # Slack notifications
│       ├── shop/                      # Shop items and transactions
│       ├── gift-codes/                # Gift code generation and claiming
│       ├── uploads/                   # File upload handling
│       └── user/                      # User profile management
│
├── frontend/
│   └── src/
│       ├── lib/
│       │   ├── api/                   # OpenAPI client + generated schema types
│       │   ├── auth.ts                # requireAuth() helper
│       │   ├── components/
│       │   │   ├── form/              # FormField, FormTextarea, FormSelect, FormButtons, etc.
│       │   │   ├── anim/              # CircleIn, CircleOut, SlideOut transitions
│       │   │   ├── BG.svelte          # Animated background pattern
│       │   │   ├── Card.svelte        # Generic card with beige theme
│       │   │   └── BobaButton.svelte  # Interactive button with animations
│       │   └── store/
│       │       ├── projectCache.ts    # Project list cache (5 min TTL)
│       │       └── projectDetailCache.ts # Single project + submission cache (3 min TTL)
│       │
│       └── routes/
│           ├── +layout.svelte         # Root layout — beige theme for users, bypass for admin/review
│           ├── +page.svelte           # Landing page
│           ├── app/                   # Authenticated user routes (projects, submissions)
│           ├── admin/                 # Admin dashboard (full data access)
│           ├── faq/                   # FAQ page
│           └── review/                # Reviewer UI (dark theme, 3-panel layout)
│               ├── +page.svelte       # Main review page — assembles all panels
│               ├── api.ts             # Reviewer API client + GitHub fetch + types
│               ├── store.ts           # Review queue state management (writable stores)
│               ├── utils.ts           # timeAgo, formatDate, parseGitHubUrl
│               └── components/
│                   ├── TopBar.svelte         # Logo, project counter, prev/next nav
│                   ├── UserInfo.svelte       # Name, Slack DM, links (Code/Demo/README/Airlock), age
│                   ├── HoursBreakdown.svelte # Total hours + per-project editable breakdown
│                   ├── NotesSection.svelte   # Collapsible notes (project or user), save to backend
│                   ├── ReviewHistory.svelte  # Reverse-chronological timeline of submissions/reviews
│                   ├── DemoIframe.svelte     # URL bar + sandboxed iframe for demo preview
│                   ├── ReadmeDrawer.svelte   # Collapsible README panel, session-persisted state
│                   ├── ActionBar.svelte      # Approve/Changes Needed forms + submission
│                   ├── GitHubPanel.svelte    # Repo stats, language, timestamps
│                   ├── CommitList.svelte     # Scrollable commit history with diff stats
│                   └── ReviewChecklist.svelte # 7-item checklist, persisted per submission
│
└── .claude/
    └── CLAUDE.md                      # Coding standards and conventions
```

## Key Patterns

- **Roles**: `user`, `admin`, `reviewer` — defined in `auth/enums/role.enum.ts`
- **Auth**: Global `AuthGuard` validates session cookies; `RolesGuard` + `@Roles()` decorator for per-route access
- **Reviewer scoping**: Reviewer endpoints strip PII (no email, address, birthday) — only expose name, Slack ID, computed age
- **Svelte stores**: `writable`/`derived` from `svelte/store` with `$` auto-subscription in templates
- **Component props**: Svelte 5 runes — `$props()`, `$state()`, `$derived()`, `$bindable()`, `$effect()`
- **Design system**: User-facing = beige/cream (`#f3e8d8`) + black borders; Review UI = dark theme (`#1c1c1c`)
