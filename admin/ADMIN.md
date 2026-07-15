# Admin

The admin and reviewer dashboard for Horizons. Provides tools for managing users, projects, submissions, events, the shop, and gift codes. Includes a dedicated submission review interface used by reviewers.

## Directory Structure

```
admin/src/
├── routes/
│   ├── +layout.svelte                  # Root layout (imports layout.css)
│   ├── +page.svelte                    # Redirects to /admin/submissions
│   ├── +page.server.ts                 # Root page auth/redirect logic
│   ├── login/+page.svelte              # Self-contained login (OAuth + unauthorized state)
│   └── (app)/                          # Grouped layout for authenticated pages
│       ├── +layout.svelte              # Admin chrome: header, nav, metrics cards
│       ├── submissions/+page.svelte    # View/manage submissions
│       ├── projects/+page.svelte       # Project admin (timeline, flags, recalc)
│       ├── users/+page.svelte          # User admin (search, Slack IDs, fraud flags)
│       ├── shop/+page.svelte           # Shop item management
│       ├── giftcodes/+page.svelte      # Gift code management
│       ├── settings/+page.svelte       # Global settings, reviewer leaderboard
│       ├── events/
│       │   ├── +page.svelte            # Event list
│       │   └── new/+page.svelte        # Create event form
│       └── review/                     # Reviewer interface (separate from admin panel)
│           ├── +page.svelte            # Main review page (gallery + detail view)
│           ├── +page.server.ts         # Auth check (admin or reviewer role)
│           ├── utils.ts                # timeAgo, formatDate, parseGitHubUrl
│           └── components/
│               ├── TopBar.svelte       # Logo, project counter, prev/next
│               ├── UserInfo.svelte     # Name, Slack, links, age
│               ├── NotesSection.svelte # Project/user notes (save to backend)
│               ├── ReviewHistory.svelte# Submission/review timeline
│               ├── DemoIframe.svelte   # Sandboxed demo preview (new-tab fallback when framing is blocked)
│               ├── ReadmeDrawer.svelte # Collapsible README panel
│               ├── ActionBar.svelte    # Approve / Changes Needed forms
│               ├── GitHubPanel.svelte  # Repo stats, language, timestamps
│               ├── ReviewChecklist.svelte # 7-item per-submission checklist
│               ├── HoursBreakdown.svelte # Total + per-project hour editing
│               ├── LapsePanel.svelte   # Lapse timelapses for linked Hackatime projects
│               └── ProjectGallery.svelte # Screenshot gallery
│
├── lib/
│   └── api/
│       ├── client.ts                   # openapi-fetch client setup
│       ├── index.ts                    # Exports api client and types
│       └── schema.d.ts                 # Auto-generated OpenAPI types
│
├── app.d.ts                            # TypeScript global namespace
└── hooks.server.ts                     # Server hooks (currently commented out)
```

## Structural Patterns

### Two Distinct Interfaces

The admin app contains two separate UIs under one SvelteKit app:

1. **Admin Panel** (`(app)/` group, excluding `review/`) - Management dashboard for admins. Light theme, metrics cards, CRUD tables.
2. **Review Tool** (`(app)/review/`) - Submission review interface for reviewers. Dark theme, gallery/detail layout, specialized review components.

Both share the same API client and auth layer but have different layouts and visual styles.

### Layout Hierarchy

```
+layout.svelte (root)
  └── (app)/+layout.svelte (admin chrome)
        ├── submissions/    ─┐
        ├── projects/        │
        ├── users/           │  Admin management pages
        ├── shop/            │  (shared nav, metrics header)
        ├── giftcodes/       │
        ├── settings/        │
        ├── events/         ─┘
        └── review/         ── Reviewer tool (own layout within)
```

The `(app)` layout provides:
- Dashboard metrics bar (total hours, approved hours, projects, users)
- Navigation sidebar with links to all sections
- Auth context and user role checks
- Recalculate-all action

### State Management

All state is managed with **Svelte 5 runes** — no external store library:

```svelte
let items = $state([]);              // Reactive array
let loading = $state(true);          // Loading flag
let filtered = $derived(             // Computed from state
  items.filter(i => i.name.includes(query))
);
```

**Per-item status tracking** is a common pattern for inline operations:

```svelte
let errors = $state<Record<number, string>>({});
let success = $state<Record<number, string>>({});
```

### Authentication

The admin app is auth-self-contained — see `docs/auth-flow.md` § Admin Panel. `/admin/login` starts the HCA OAuth flow with `redirect=<intended admin path>`; the `(app)` layout gates on a single `ensureUser()` from the shared `$lib/auth` store (pages read `$currentUser` instead of refetching `/me`); a global 401 middleware in `$lib/api/client.ts` bounces expired sessions to the login page with a `next` param; the sidebar has sign-out.

### Data Loading

Shared, slow, or cross-page data goes through the stale-while-revalidate cache (`$lib/swr.ts` + `$lib/reviewCache.ts`) — the review queue, past-reviews, fraud-rejected, events, and priority-queue are cached so gallery ↔ project navigation doesn't refetch them; verdicts must call `invalidateReviewData()`.

Pages otherwise use client-side loading via `onMount`:

```typescript
import { onMount } from 'svelte';
import { api } from '$lib/api';

let data = $state([]);
let loading = $state(true);

onMount(async () => {
  const { data: result, error } = await api.GET('/api/admin/users');
  if (result) data = result;
  loading = false;
});
```

Server-side load functions (`+page.server.ts`) are used only for auth checks and redirects, not data fetching.

### API Usage

The API client is configured identically to the frontend:

```typescript
const { data, error } = await api.GET('/api/endpoint', { params: {...} });
const { data, error } = await api.POST('/api/endpoint', { body: {...} });
const { data, error } = await api.PUT('/api/endpoint/{id}', {
  params: { path: { id } }, body: {...}
});
const { data, error } = await api.DELETE('/api/endpoint/{id}', {
  params: { path: { id } }
});
```

Types are auto-generated from the backend OpenAPI schema:
```bash
pnpm --filter admin generate:api
```

## Pages

### Admin Management Pages

| Page | Route | Purpose |
|------|-------|---------|
| Submissions | `/admin/submissions` | View and manage all project submissions |
| Projects | `/admin/projects` | Project list with timeline, fraud/sus flags, recalculation, unlock. Search is debounced, scopable by field (all/title/user/Slack ID/description/code URL/playable URL/project ID) with match highlighting; every searchable field is visible on the cards. Filters collapse behind a funnel toggle next to the search bar (badge counts non-default filters; none applied by default) and the list renders in 100-card chunks that load on scroll |
| Project Detail | `/admin/projects/{id}` | Viewer + editor for one project, in the review dash's visual language (rv tokens). Split rule: everything project-level lives in the left bar; the main pane is submission-specific only. Left bar: "Showing selected submission #N" banner, title/type + status tags + description + created/updated, screenshot, toolkit card (gridded Demo/Repo/Airlock/README/Journal/Joe/Introspect/Review Dash buttons, colored like the review panel's link grid), Hours card (tracked now, project approved total or pending, recalculate), user card (view-user link, click-to-copy email/Slack ID/Hackatime account, Slack DM + Joe links, collapsible birthday/address, sus toggle), Project Details card (labeled demo/repo/README/journal/screenshot URLs), Linked Hackatime Projects card, user notes (amber) and project notes (purple) cards, Perm-Reject Note card (`project.adminComment` — the internal reason written by the review dash's perm-reject flow; shown only when it has content or the project is perm-rejected), collapsible danger zone (unlock, Joe reset & requeue, delete). Main pane: horizontal submission-timeline strip (newest → oldest, day-gap separators; clicking scrolls to that submission) above the selected-submission snapshot card (hours grid, screenshot, at-submit description/URLs), the Verdict card (status pill, per-submission approved hours, reviewer feedback, project hours justification, Airtable sync status with an Open-in-Airtable record link), and the Joe fraud panel (trust score/pass state/justification — fraud review runs per submission). Right edge: activity-timeline bar that slides out on hover and pins open on click (lazy-loaded; day dividers, colored event dots, relative times, key/value detail rows). Editing is inline via pencils, one section at a time; hovering a pencil tints the region it edits. Superadmin pencils: title/type, lock/perm-reject flags, Project Details (description + all URLs), linked Hackatime projects, perm-reject note, and the snapshot card's submission data (at-submit description/URLs/screenshot/hackatime hours, via `PATCH /api/admin/submissions/{id}` — changes are audit-logged). Admin+ pencils: the Hours card's "Approved" row (shown only when approved) edits the latest submission's approved hours, and the Verdict card edits verdict/approved hours/reviewer feedback/perm-reject through `PUT /api/reviewer/submissions/{id}/review` (optional email; finalized-verdict flips stay superadmin-only server-side) plus, for superadmins, the project-level hours justification via the admin PATCH in the same save |
| Fraud Gallery | `/admin/fraud-review` | Review-gallery-style grid/list of submitted projects (debounced field-scoped search — all/title/author/Slack ID/event/type/project-or-Joe ID — with match highlighting; same type/event/sort/fraud filters, plus a multiselect approved/rejected/unreviewed project filter on the reviewer gate's verdict, which is set even while fraud review is pending). Each card deep-links to Joe at `https://joe.fraud.hackclub.com/ysws/horizons/projects/{joeProjectId}`. Filters persist in `sessionStorage`. Admin-only. Distinct from the perm-reject queue at `/admin/review/fraud-review`. |
| Users | `/admin/users` | Server-paginated user list (50/page, debounced server-side search + sort — matches name, email, Slack ID, cached Slack display name, and Hackatime ID), hour balance chip per user (spendable balance + earned/spent breakdown, kept in sync after superadmin hours adjustments), Slack display name shown next to the Slack ID, Slack ID editing, fraud/sus flag toggles |
| Shop | `/admin/shop` | Shop item CRUD |
| Gift Codes | `/admin/giftcodes` | Gift code generation and management |
| Events | `/admin/events` | Event list and creation |
| Announcements | `/admin/announcements` | Create/edit announcements — markdown body with live preview, event tags (none = everyone), and "show on open" / "show as tag" / active toggles. Admin, Superadmin, and Event Viewer. |
| Settings | `/admin/settings` | Global submissions freeze toggle, reviewer leaderboard, priority users |

### Review Tool

The review page at `/admin/review` is a specialized interface for processing submissions:

- **Gallery view**: Grid of pending submissions, click to select. Debounced field-scoped search (all/title/author/Slack ID/event/type/project ID) with match highlighting across the pending queue, past reviews, and fraud-rejected sections. Resubmissions of projects the current reviewer previously rejected carry a "Your re-review" badge and a "My re-reviews" filter chip (same condition as the Slack re-review ping)
- **Admin queue**: Reviewers can escalate a submission via the "Send to Admin" verdict option (required note). Escalated submissions leave the pending queue and appear in an amber admin-only gallery section; only admins can approve/reject them or return them to the reviewer queue (the escalation shows in the review timeline)
- **Detail view**: Multi-panel layout showing:
  - User info and profile data, with external tool links: Airlock (sandboxed repo VM, all reviewers), Introspect (`introspect.sahil.ink` prefilled with repo/demo/Slack ID/hours/submission date/Hackatime projects, all reviewers), and Joe (fraud platform, admin-only)
  - Project screenshots gallery
  - GitHub repo panel (stats, language, README)
  - Demo iframe (sandboxed). On navigation it probes the demo URL via `/api/utils/check-url`; if the site blocks framing (`X-Frame-Options` / CSP `frame-ancestors`), the preview is replaced with an "Open in new tab" prompt instead of a silently blank frame. Falls back to attempting the iframe when embeddability can't be determined.
  - Hours breakdown with per-project details
  - Review history timeline
  - Notes (project and user-level)
  - 7-item review checklist
  - Action bar (approve / request changes / send to admin)
- **Navigation**: Previous/Next buttons to move through queue
- **Access**: Requires `admin` or `reviewer` role

## Configuration

### Base Path
The admin app is served under `/admin` (configured in `svelte.config.js`). All routes are relative to this base path.

### Key Files
- `svelte.config.js` - adapter-node, `/admin` base path
- `vite.config.ts` - Tailwind CSS plugin, dev server on port 5174
- `.env` - `PUBLIC_API_URL`, `PUBLIC_HACKATIME_CUTOFF_DATE`, `PUBLIC_ENABLE_ONBOARDING`

### API Endpoints Used

**Admin endpoints** (`/api/admin/*`):
- `/api/admin/metrics` - Dashboard metrics
- `/api/admin/users` - User CRUD
- `/api/admin/users/{id}/slack` - Update Slack ID
- `/api/admin/users/{id}/fraud-flag` - Toggle fraud flag
- `/api/admin/users/{id}/sus-flag` - Toggle sus flag
- `/api/admin/projects/{id}/timeline` - Project event timeline
- `/api/admin/projects/{id}/recalculate` - Recalculate hours
- `/api/admin/projects/{id}/unlock` - Unlock project
- `/api/admin/projects/recalculate-all` - Bulk recalculation

**Reviewer endpoints** (`/api/reviewer/*`):
- `/api/reviewer/queue` - Submission review queue
- `/api/reviewer/submissions/{id}` - Submission detail

**Event endpoints**:
- `/api/events/admin` - Event management

## Design

### Admin Theme (Light)
- Gray/white backgrounds
- Purple accent on active navigation
- Metrics cards with colored indicators
- Standard table layouts with search/filter

### Reviewer Theme (Dark)
- Base: `#1c1c1c` / gray-950
- Surface: gray-700/800
- Accent: orange (`--color-rv-accent`)
- Success: green (`--color-rv-green`)
- Error: red (`--color-rv-red`)
- Typography: Bricolage Grotesque
- Custom CSS variables prefixed with `--color-rv-*`
