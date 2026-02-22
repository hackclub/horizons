# Preloading Strategy

This document outlines the data preloading optimization implemented to speed up the website loading.

## Overview

Implemented intelligent preloading of critical user data and assets to minimize waiting times when navigating the app.

## Changes Made

### 1. **Project Cache Store** (`frontend/src/lib/store/projectCache.ts`)
- Caches user's projects list in-memory for 5 minutes
- Provides `projectsStore` writable store for reactive updates
- Exports `preloadProjects()` to preload in background using `queueMicrotask`
- Exports `fetchProjects()` for explicit data fetching with cache logic

**Key Features:**
- Cache invalidation after 5 minutes
- Non-blocking microtask-based preload
- Automatic error handling

### 2. **Project Detail Cache Store** (`frontend/src/lib/store/projectDetailCache.ts`)
- Caches individual project details and submissions for 3 minutes
- Provides `projectDetailStore` for reactive access
- Exports `preloadProjectDetail(id)` for background preloading
- Uses `requestIdleCallback` for optimal timing

**Key Features:**
- Per-project caching
- Batch loading of project + submissions in parallel
- Idle-time loading to avoid blocking UI

### 3. **App Layout Preloading** (`frontend/src/routes/app/+layout.svelte`)
- On app mount, preloads projects list immediately
- On idle time, preloads:
  - Hero placeholder and home images
  - Project creation route JS chunk

### 4. **Projects List Page** (`frontend/src/routes/app/projects/+page.svelte`)
- Uses cached store instead of direct API calls
- Connected to `projectsStore` for automatic updates
- **Preloads ALL projects in background** (staggered 200ms apart)
- **Preloads selected project details** when user hovers/selects
- **Preloads edit and ship routes** for selected project
- Uses `requestIdleCallback` for route prefetching

### 5. **Project Detail Page** (`frontend/src/routes/app/projects/[id]/+page.svelte`)
- Replaced direct API calls with `projectDetailStore`
- Connected to cache store for instant data display
- Shows cached data immediately while fresh data loads
- **Preloads edit page data** (`preloadEditData`) when project is viewed
- Supports navigation between project detail views

### 6. **Project Edit Page** (`frontend/src/routes/app/projects/[id]/edit/+page.svelte`)
- Replaced direct API calls with `editDataStore`
- Shows cached form data instantly when loaded
- Form auto-populates from cache while fresh data loads
- Integrated with `fetchEditData` for smart caching

## Performance Benefits

1. **Instant Project List**: Projects display immediately when entering `/app/projects` (from cache)
2. **Instant Project Details**: `/app/projects/[id]` shows cached data immediately, new data loads in background
3. **Instant Edit Form**: `/app/projects/[id]/edit` form pre-populates from cache instantly
4. **Preloaded All Project Data**: All projects have their details preloaded in background
5. **Preloaded Edit Data**: Edit page data preloaded when viewing project details
6. **Preloaded Routes**: Edit and ship routes load in idle time while user views projects
7. **Background Assets**: Images and JS chunks load during idle time, not blocking interaction
8. **Smart Caching**: Data refreshed after timeout, but fresh requests return instantly
9. **Staggered Loading**: Project preloading staggered 200ms apart to prevent network congestion
10. **Non-blocking**: All preloading uses `requestIdleCallback` or `queueMicrotask`

## Cache TTL (Time To Live)

- **Projects List**: 5 minutes
- **Project Details**: 3 minutes

## Cache Invalidation Strategy

When users perform operations (create, edit, delete), caches are automatically invalidated:

- **After Edit**: Clears THREE caches to ensure full freshness:
  1. Project detail cache (for project view)
  2. Edit data cache (for form data)
  3. Projects list cache (for thumbnail/info in list view)
  - Uses both `invalidateProjectCaches(id)` and `invalidateCache()`
  
- **After Create**: `invalidateAllProjectCaches()` clears all caches
  - Ensures projects list shows new project

- Invalidation happens BEFORE navigation
- Ensures next page load always shows fresh data from server

## Technical Details

### Network Optimization
- **Staggered Project Preloading**: Projects preloaded at 200ms intervals to prevent network saturation
- **Parallel API Calls**: Project details and submissions fetched in parallel within cache store
- **Batch Requests**: Multiple projects loaded asynchronously without blocking main thread

### Memory Management
- **In-Memory Cache**: Uses Map for O(1) lookup performance
- **TTL-Based Cleanup**: Automatic cache expiration prevents memory bloat
- **Soft References**: Cached data discarded when expired, allowing garbage collection
- **Smart Invalidation**: Caches cleared after mutations to prevent stale data

## User Journey with Caching

1. **User enters `/app/projects`**
   - Projects list loads from cache (instant)
   - All project details preload in background

2. **User clicks on a project → `/app/projects/123`**
   - Project details show from cache (instant)
   - Edit page data preloads in background
   - Edit & ship routes prefetch in idle time

3. **User clicks Edit → `/app/projects/123/edit`**
   - Edit form pre-populates from cache (instant)
   - Fresh data loads in background

4. **User saves changes**
   - API request sent
   - THREE caches invalidated:
     - Project detail cache → Will reload fresh data
     - Edit data cache → Next edit gets fresh form
     - Projects list cache → Background image/info updated
   - User redirected to project detail page
   - Fresh data fetched and displayed

5. **User returns to projects list → `/app/projects`**
   - Projects list loads fresh (cache cleared)
   - Updated project thumbnail and info displayed
   - New preloading cycle begins

## Future Improvements

- Preload submit/ship routes on project detail page
- Implement Service Worker caching for offline support
- Add visual preloading indicators for long operations
- Monitor cache hit rates and adjust TTL dynamically
- Invalidate on other user's changes via WebSocket
