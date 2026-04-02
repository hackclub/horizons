# Admin

The admin and reviewer dashboard for Horizons. Provides tools for managing users, projects, submissions, events, the shop, and gift codes. Includes a dedicated submission review interface used by reviewers.

## Directory Structure

```
admin/src/
├── routes/
│   ├── +layout.svelte                  # Root layout (imports layout.css)
│   ├── +page.svelte                    # Redirects to /admin/submissions
│   ├── +page.server.ts                 # Root page auth/redirect logic
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
│               ├── DemoIframe.svelte   # Sandboxed demo preview
│               ├── ReadmeDrawer.svelte # Collapsible README panel
│               ├── ActionBar.svelte    # Approve / Changes Needed forms
│               ├── GitHubPanel.svelte  # Repo stats, language, timestamps
│               ├── ReviewChecklist.svelte # 7-item per-submission checklist
│               ├── HoursBreakdown.svelte # Total + per-project hour editing
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

### Data Loading

Pages use client-side loading via `onMount`:

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
| Projects | `/admin/projects` | Project list with timeline, fraud/sus flags, recalculation, unlock |
| Users | `/admin/users` | User search, Slack ID editing, fraud/sus flag toggles |
| Shop | `/admin/shop` | Shop item CRUD |
| Gift Codes | `/admin/giftcodes` | Gift code generation and management |
| Events | `/admin/events` | Event list and creation |
| Settings | `/admin/settings` | Global submissions freeze toggle, reviewer leaderboard, priority users |

### Review Tool

The review page at `/admin/review` is a specialized interface for processing submissions:

- **Gallery view**: Grid of pending submissions, click to select
- **Detail view**: Multi-panel layout showing:
  - User info and profile data
  - Project screenshots gallery
  - GitHub repo panel (stats, language, README)
  - Demo iframe (sandboxed)
  - Hours breakdown with per-project details
  - Review history timeline
  - Notes (project and user-level)
  - 7-item review checklist
  - Action bar (approve / request changes)
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
