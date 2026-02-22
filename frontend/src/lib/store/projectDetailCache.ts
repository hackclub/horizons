import { writable, type Writable } from 'svelte/store';
import { api, type components } from '$lib/api';

type ProjectResponse = components['schemas']['ProjectResponse'];

interface ProjectDetailCache {
	project: ProjectResponse | null;
	submission: any | null;
	timestamp: number;
}

const CACHE_DURATION = 3 * 60 * 1000; // 3 minutes

// In-memory cache for individual projects
let detailCache: Map<string, ProjectDetailCache> = new Map();

export const projectDetailStore: Writable<{
	project: ProjectResponse | null;
	submission: any | null;
	loading: boolean;
	error: string | null;
}> = writable({
	project: null,
	submission: null,
	loading: true,
	error: null,
});

export async function fetchProjectDetail(id: string, forceRefresh = false) {
	const cacheKey = `project-${id}`;
	const cached = detailCache.get(cacheKey);
	const now = Date.now();

	// Return cached data if still valid
	if (!forceRefresh && cached && now - cached.timestamp < CACHE_DURATION) {
		projectDetailStore.set({
			project: cached.project,
			submission: cached.submission,
			loading: false,
			error: null,
		});
		return { project: cached.project, submission: cached.submission };
	}

	try {
		projectDetailStore.update(s => ({ ...s, loading: true, error: null }));

		const [projectRes, submissionsRes] = await Promise.all([
			api.GET('/api/projects/auth/{id}', {
				params: { path: { id: Number(id) } }
			}),
			api.GET('/api/projects/auth/{id}/submissions', {
				params: { path: { id: Number(id) } }
			})
		]);

		let project: ProjectResponse | null = null;
		let submission: any = null;
		let error: string | null = null;

		if (projectRes.data) {
			project = projectRes.data as ProjectResponse;
		} else {
			error = 'Failed to load project';
		}

		if (submissionsRes.data) {
			const submissions = submissionsRes.data as any[];
			if (submissions.length > 0) {
				submission = submissions[0];
			}
		}

		if (error) {
			throw new Error(error);
		}

		const cacheEntry: ProjectDetailCache = {
			project,
			submission,
			timestamp: now,
		};
		detailCache.set(cacheKey, cacheEntry);

		projectDetailStore.set({
			project,
			submission,
			loading: false,
			error: null,
		});

		return { project, submission };
	} catch (err) {
		const errorMsg = err instanceof Error ? err.message : 'Failed to load project details';
		projectDetailStore.set({
			project: null,
			submission: null,
			loading: false,
			error: errorMsg,
		});
		throw err;
	}
}

// Preload project detail in background
export function preloadProjectDetail(id: string) {
	// Use requestIdleCallback to avoid blocking UI
	if ('requestIdleCallback' in window) {
		requestIdleCallback(() => {
			fetchProjectDetail(id).catch(() => {
				// Silently fail for preload
			});
		});
	}
}

// Clear specific project cache
export function invalidateProjectCache(id: string) {
	detailCache.delete(`project-${id}`);
}

// Clear all caches
export function invalidateAllCaches() {
	detailCache.clear();
}

// Cache for edit page data (project + hackatime data)
interface EditDataCache {
	project: ProjectResponse | null;
	allHackatimeProjects: any[];
	linkedHackatimeProjects: string[];
	timestamp: number;
}

const editDataCache: Map<string, EditDataCache> = new Map();

export const editDataStore: Writable<{
	project: ProjectResponse | null;
	allHackatimeProjects: any[];
	linkedHackatimeProjects: string[];
	loading: boolean;
	hackatimeLoading: boolean;
	error: string | null;
}> = writable({
	project: null,
	allHackatimeProjects: [],
	linkedHackatimeProjects: [],
	loading: true,
	hackatimeLoading: true,
	error: null,
});

export async function fetchEditData(id: string, forceRefresh = false) {
	const cacheKey = `edit-${id}`;
	const cached = editDataCache.get(cacheKey);
	const now = Date.now();

	// Return cached data if still valid
	if (!forceRefresh && cached && now - cached.timestamp < CACHE_DURATION) {
		editDataStore.set({
			project: cached.project,
			allHackatimeProjects: cached.allHackatimeProjects,
			linkedHackatimeProjects: cached.linkedHackatimeProjects,
			loading: false,
			hackatimeLoading: false,
			error: null,
		});
		return cached;
	}

	try {
		editDataStore.update(s => ({ ...s, loading: true, hackatimeLoading: true, error: null }));

		const [projectRes, allHackatimeRes, linkedHackatimeRes] = await Promise.all([
			api.GET('/api/projects/auth/{id}', { params: { path: { id: Number(id) } } }),
			api.GET('/api/hackatime/projects/all'),
			api.GET('/api/projects/auth/{id}/hackatime-projects', { params: { path: { id: Number(id) } } })
		]);

		let project: ProjectResponse | null = null;
		let allHackatimeProjects: any[] = [];
		let linkedHackatimeProjects: string[] = [];
		let error: string | null = null;

		if (projectRes.data) {
			project = projectRes.data as ProjectResponse;
		} else {
			error = 'Failed to load project';
		}

		if (allHackatimeRes.data) {
			allHackatimeProjects = allHackatimeRes.data.projects || [];
		}

		if (linkedHackatimeRes.data) {
			linkedHackatimeProjects = linkedHackatimeRes.data.hackatimeProjects || [];
		}

		if (error) {
			throw new Error(error);
		}

		const cacheEntry: EditDataCache = {
			project,
			allHackatimeProjects,
			linkedHackatimeProjects,
			timestamp: now,
		};
		editDataCache.set(cacheKey, cacheEntry);

		editDataStore.set({
			project,
			allHackatimeProjects,
			linkedHackatimeProjects,
			loading: false,
			hackatimeLoading: false,
			error: null,
		});

		return cacheEntry;
	} catch (err) {
		const errorMsg = err instanceof Error ? err.message : 'Failed to load edit data';
		editDataStore.set({
			project: null,
			allHackatimeProjects: [],
			linkedHackatimeProjects: [],
			loading: false,
			hackatimeLoading: false,
			error: errorMsg,
		});
		throw err;
	}
}

// Preload edit data in background
export function preloadEditData(id: string) {
	if ('requestIdleCallback' in window) {
		requestIdleCallback(() => {
			fetchEditData(id).catch(() => {
				// Silently fail for preload
			});
		});
	}
}

// Clear edit cache for specific project
export function invalidateEditCache(id: string) {
	editDataCache.delete(`edit-${id}`);
}

// Invalidate all caches for a project (call after edit/delete operations)
export function invalidateProjectCaches(id: string) {
	detailCache.delete(`project-${id}`);
	editDataCache.delete(`edit-${id}`);
}

// Invalidate all caches (call after significant changes)
export function invalidateAllProjectCaches() {
	detailCache.clear();
	editDataCache.clear();
}
