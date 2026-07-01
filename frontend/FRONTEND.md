# Frontend

The user-facing SvelteKit 5 application for Horizons. Students use this to create projects, link Hackatime time tracking, submit projects for review, and browse the reward shop.

## Directory Structure

```
frontend/src/
├── routes/
│   ├── +layout.svelte              # Root layout (beige theme, texture background)
│   ├── +page.svelte                # Landing page (event showcase)
│   ├── layout.css                  # Global styles, fonts, Tailwind imports, theme vars
│   ├── [eventname]/                # Dynamic event pages (loaded from YAML config)
│   ├── faq/ arcana-faq/ crux-faq/  # Event-specific FAQ pages
│   └── app/                        # Authenticated routes
│       ├── +layout.svelte          # Auth wrapper (requireAuth check)
│       ├── +page.svelte            # Home dashboard (grid navigation)
│       ├── onboarding/             # First-time user flow
│       │   └── tutorial/           # Tutorial walkthrough
│       ├── projects/
│       │   ├── +page.svelte        # Project list (scrollable, keyboard nav)
│       │   ├── new/                # Create project form
│       │   └── [id]/
│       │       ├── +page.svelte    # Project detail (grid nav layout)
│       │       ├── edit/           # Edit project form
│       │       └── ship/           # Multi-step submission wizard
│       │           ├── presubmit/  # Pre-check before submitting
│       │           ├── project/    # Project details step
│       │           ├── personal/   # Personal info step
│       │           ├── integrity/  # Integrity pledge step
│       │           └── finish/     # Confirmation step
│       └── shop/
│           ├── +page.svelte        # Shop categories
│           └── [slug]/
│               └── [itemId]/       # Individual shop item
│
├── lib/
│   ├── api/
│   │   ├── client.ts               # openapi-fetch client (credentials: 'include')
│   │   ├── index.ts                # Exports api client and types
│   │   └── schema.d.ts             # Auto-generated OpenAPI types (~3,600 lines)
│   ├── auth.ts                     # requireAuth() - checks /api/user/auth/me
│   ├── index.ts                    # Constants (EXIT_DURATION, ENTER_DURATION)
│   ├── input.ts                    # Input prompt type definitions
│   ├── components/
│   │   ├── form/                   # Reusable form components
│   │   │   ├── FormField.svelte    # Text input with label
│   │   │   ├── FormTextarea.svelte # Textarea with label
│   │   │   ├── FormSelect.svelte   # Select dropdown
│   │   │   ├── FileUpload.svelte   # File upload with preview
│   │   │   ├── FormCard.svelte     # Form section wrapper
│   │   │   ├── FormButtons.svelte  # Navigation buttons (back/next)
│   │   │   ├── FormError.svelte    # Error display
│   │   │   ├── FormSubmitButton.svelte
│   │   │   ├── BackButton.svelte
│   │   │   └── HackatimeSelect.svelte  # Hackatime project picker
│   │   ├── anim/                   # Page transition animations
│   │   │   ├── CircleIn.svelte     # Circle clip-path enter
│   │   │   ├── CircleOut.svelte    # Circle clip-path exit
│   │   │   └── SlideOut.svelte     # Slide transition
│   │   ├── BG.svelte               # Animated background pattern
│   │   ├── BobaButton.svelte       # Large interactive button with press state
│   │   ├── BobaText.svelte         # GSAP-animated text
│   │   ├── Card.svelte             # Card container
│   │   ├── FAQ.svelte              # FAQ accordion
│   │   ├── MenuItem.svelte         # Navigation menu item
│   │   ├── Stripes.svelte          # Decorative SVG stripes
│   │   ├── TextWave.svelte         # Wave animation text
│   │   └── TurbulentImage.svelte   # Canvas-based image distortion
│   ├── nav/
│   │   └── wasd.svelte.ts          # WASD/arrow key navigation composables
│   ├── store/
│   │   ├── projectCache.ts         # Project list store (5 min TTL cache)
│   │   └── projectDetailCache.ts   # Project detail + submission store (3 min TTL)
│   ├── data/
│   │   ├── shops.ts                # Shop config loader
│   │   └── shops.yaml              # Shop branding data
│   ├── events/
│   │   ├── types.ts                # Event config TypeScript interfaces
│   │   └── events.yaml             # Event definitions
│   └── fonts/                      # Custom font files (woff2)
│       ├── Hypebuzz.woff2
│       ├── CookWidetype.woff2
│       └── Grotesqon.woff2
│
└── static/                         # Public static assets
```

## Structural Patterns

### Navigation System (Keyboard-First)

The frontend features a custom WASD/arrow key navigation system defined in `lib/nav/wasd.svelte.ts`:

- **`createListNav(options)`** - 1D vertical navigation for lists (e.g., project list). Supports W/S or Up/Down, Enter to select, mouse wheel scrolling.
- **`createGridNav(options)`** - 2D grid navigation for dashboard layouts. Supports WASD or arrow keys.
- **`navState`** - Shared state tracking keyboard vs. mouse mode (persisted in sessionStorage).
- All navigable items auto-scroll to center when selected via keyboard.

### Bottom Nav (`AppNav`)

`lib/components/AppNav.svelte` is the persistent bottom bar shown on every `/app` page. It is rendered **once** in `routes/app/+layout.svelte`, *outside* the keyed `{#key page.url.pathname}` transition, so it never remounts or re-animates on navigation and layers above page content (`z-50`). Modals therefore sit at `z-60` to stay above it.

- **Left — nav hints**: a Figma WASD d-pad + mouse-cursor glyph, chosen per route by `hintsFor(pathname)` in the layout. Each page kind advertises only the input(s) it actually supports:
  - WASD + mouse — 2D grids (`/app`, `/app/shop`, `/app/events/shop`)
  - WS + scroll — vertical lists (`/app/projects`, `/app/events`, `/app/events/explore`, `/app/community`, `/app/refer`)
  - click — the edit form (`/app/projects/[id]/edit`)
  - mouse-only — traditional detail/checkout pages (project detail, `new`, item detail, hackatime, …) — this is the default.
- **Per-key lighting**: individual d-pad keys light to 100% on the matching physical key (WASD / arrows). Keyboard and mouse glyphs are mutually exclusive — inactive 25% / active 50% / just-used 100% — and keys a page doesn't use render "disabled" at 10%.
- **Right — user info**: username with an eye toggle to hide it, a streak pill, a pulsing "Refer A Friend" button (hidden on `/app/refer` itself), and logout. Reads `userStore`.
- **Space reservation**: `.page-transition.with-nav` reserves the bar height (`3rem`) at ≥640px so page content is never occluded. The bar is hidden below `sm` and on focused flows (onboarding, the ship wizard), which also skip the reserve.

### Data Caching & Preloading

The store layer (`lib/store/`) wraps API calls with time-based caching:

```
┌─────────────┐    ┌───────────────────┐    ┌──────────┐
│ Component   │───>│ Store (cache+TTL) │───>│ API call │
│ subscribes  │<───│ writable store    │<───│ openapi  │
└─────────────┘    └───────────────────┘    └──────────┘
```

- **Project list**: `projectsStore` with 5-minute TTL
- **Project detail**: `projectDetailStore` bundles project + submission + hackatime data with 3-minute TTL
- **Edit data**: `editDataStore` bundles project + linked/unlinked hackatime projects with 3-minute TTL
- **Preloading**: Uses `requestIdleCallback` to prefetch data before user navigates. Project details are staggered with 200ms delays.
- **Cache invalidation**: `invalidateCache()`, `invalidateProjectCaches()`, `invalidateAllCaches()` for post-mutation refreshes.

### Page Transitions

Pages use GSAP-based animations with shared timing constants:

- `EXIT_DURATION = 750ms` / `ENTER_DURATION = 750ms`
- `CircleIn` / `CircleOut` - clip-path circle reveal/hide
- `SlideOut` - directional slide
- Components coordinate via `$effect()` blocks and state flags

### Form Architecture

The submission wizard (`/app/projects/[id]/ship/`) is a multi-step flow:

1. **presubmit** - Pre-check validation
2. **project** - Project metadata (URLs, description, screenshots)
3. **personal** - Personal information
4. **integrity** - Integrity pledge
5. **finish** - Confirmation

Each step uses shared form components from `lib/components/form/` with consistent patterns:
- `FormCard` wraps each section
- `FormField` / `FormTextarea` / `FormSelect` for inputs
- `FormButtons` for back/next navigation
- `FormError` for validation display

### Event System (YAML-Driven)

Events are defined in `lib/events/events.yaml` and loaded at build time. The `[eventname]` dynamic route renders event-specific pages based on this config. Shop branding follows the same pattern via `lib/data/shops.yaml`.

## Design System

### Theme
- **Background**: beige/cream (`#f3e8d8`) with animated texture pattern
- **Borders**: solid black
- **Cards**: cream background with black borders
- **Typography**: Bricolage Grotesque (body), Agdasima (headings), custom display fonts (Hypebuzz, CookWidetype, Grotesqon)

### Responsive Behavior
- `windowWidth < 768` or `< 640` triggers mobile mode
- `windowWidth < 1024 || windowHeight < 700` triggers small viewport layout
- Mobile displays a warning overlay (desktop-optimized experience)
- Animations can be disabled via `localStorage: 'disableAnimations'`

## API Integration

The frontend communicates with the backend via a typed openapi-fetch client:

```typescript
import { api } from '$lib/api';

// GET with params
const { data, error } = await api.GET('/api/projects/{id}', {
  params: { path: { id: projectId } }
});

// POST with body
const { data, error } = await api.POST('/api/projects', {
  body: { name, description, repoUrl }
});
```

The TypeScript types are auto-generated from the backend's OpenAPI schema. Regenerate with:
```bash
pnpm --filter frontend generate:api
```

## Authentication

`requireAuth()` in `lib/auth.ts` checks `/api/user/auth/me`:
- If authenticated, returns user data
- If not, redirects to the landing page
- If onboarding is enabled and not completed, redirects to `/app/onboarding`

The app layout (`routes/app/+layout.svelte`) calls this on mount.

## Performance

- **Idle preloading**: `requestIdleCallback` + `queueMicrotask` for non-blocking data fetches
- **Staggered preloading**: Project details prefetched with 200ms intervals to avoid request storms
- **TTL caching**: Avoids redundant API calls within 3-5 minute windows
- **Smart invalidation**: Caches cleared on mutations (create, edit, submit)
- **Scroll-aware**: Only preloads data for projects visible/near viewport
