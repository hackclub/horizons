import { writable, type Writable } from 'svelte/store';
import { api, type components } from '$lib/api';
import { m } from '$lib/paraglide/messages.js';

type ProjectResponse = components['schemas']['ProjectResponse'];

interface CacheEntry {
	data: ProjectResponse[];
	timestamp: number;
}

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// In-memory cache
let cache: Map<string, CacheEntry> = new Map();

export const projectsStore: Writable<{
	projects: ProjectResponse[];
	loading: boolean;
	error: string | null;
}> = writable({
	projects: [],
	loading: true,
	error: null,
});

export async function fetchProjects(forceRefresh = false) {
	const cacheKey = 'user-projects';
	const cached = cache.get(cacheKey);
	const now = Date.now();

	// Return cached data if still valid
	if (!forceRefresh && cached && now - cached.timestamp < CACHE_DURATION) {
		projectsStore.set({
			projects: cached.data,
			loading: false,
			error: null,
		});
		return cached.data;
	}

	try {
		projectsStore.update(s => ({ ...s, loading: true, error: null }));
		const { data, error } = await api.GET('/api/projects/auth');

		if (data && Array.isArray(data)) {
			const projects = data as ProjectResponse[];
			cache.set(cacheKey, { data: projects, timestamp: now });
			projectsStore.set({
				projects,
				loading: false,
				error: null,
			});
			return projects;
		} else {
			throw new Error(m.ts_projects_invalid_data());
		}
	} catch (err) {
		const errorMsg = err instanceof Error ? err.message : m.ts_projects_load_failed();
		projectsStore.set({
			projects: [],
			loading: false,
			error: errorMsg,
		});
		throw err;
	}
}

// Preload projects in background (non-blocking)
export function preloadProjects() {
	// Use microtask to avoid blocking UI
	queueMicrotask(() => {
		fetchProjects().catch(() => {
			// Silently fail for preload
		});
	});
}

// Clear cache on demand
export function invalidateCache() {
	cache.clear();
}
