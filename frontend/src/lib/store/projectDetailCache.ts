import { writable, type Writable } from 'svelte/store';
import { api, type components } from '$lib/api';

type ProjectResponse = components['schemas']['ProjectResponse'];

interface HackatimeInfo {
	hackatimeProjects: string[];
	currentHackatimeHours: number;
	hackatimeProjectHours: Record<string, number>;
	lastSubmittedHours: number | null;
}

interface ProjectDetailCache {
	project: ProjectResponse | null;
	submission: any | null;
	hackatimeInfo: HackatimeInfo | null;
	timestamp: number;
}

const CACHE_DURATION = 3 * 60 * 1000; // 3 minutes

// In-memory cache for individual projects
let detailCache: Map<string, ProjectDetailCache> = new Map();

// Map of projectId -> approvalStatus for use in project list
export const submissionStatusMap: Writable<Record<string, string | null>> = writable({});

export const projectDetailStore: Writable<{
	project: ProjectResponse | null;
	submission: any | null;
	hackatimeInfo: HackatimeInfo | null;
	loading: boolean;
	error: string | null;
}> = writable({
	project: null,
	submission: null,
	hackatimeInfo: null,
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
			hackatimeInfo: cached.hackatimeInfo,
			loading: false,
			error: null,
		});
		return { project: cached.project, submission: cached.submission, hackatimeInfo: cached.hackatimeInfo };
	}

	try {
		projectDetailStore.update(s => ({ ...s, loading: true, error: null }));

		const [projectRes, submissionsRes, hackatimeRes] = await Promise.all([
			api.GET('/api/projects/auth/{id}', {
				params: { path: { id: Number(id) } }
			}),
			api.GET('/api/projects/auth/{id}/submissions', {
				params: { path: { id: Number(id) } }
			}),
			api.GET('/api/projects/auth/{id}/hackatime-projects', {
				params: { path: { id: Number(id) } }
			}),
		]);

		let project: ProjectResponse | null = null;
		let submission: any = null;
		let hackatimeInfo: HackatimeInfo | null = null;
		let error: string | null = null;

		if (projectRes.data) {
			project = projectRes.data as ProjectResponse;
		} else {
			error = 'Failed to load project';
		}

		if (submissionsRes.data) {
			const submissions = submissionsRes.data as any[];
			if (submissions.length > 0) {
				// Use the most recent submission
				submission = submissions.sort((a: any, b: any) =>
					new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
				)[0];
			}
		}

		const d = hackatimeRes.data as any;
		hackatimeInfo = {
			hackatimeProjects: d?.hackatimeProjects ?? [],
			currentHackatimeHours: d?.currentHackatimeHours ?? 0,
			hackatimeProjectHours: d?.hackatimeProjectHours ?? {},
			lastSubmittedHours: d?.lastSubmittedHours ?? null,
		};

		if (error) {
			throw new Error(error);
		}

		const cacheEntry: ProjectDetailCache = {
			project,
			submission,
			hackatimeInfo,
			timestamp: now,
		};
		detailCache.set(cacheKey, cacheEntry);

		projectDetailStore.set({
			project,
			submission,
			hackatimeInfo,
			loading: false,
			error: null,
		});

		// Update submission status map for project list pills
		submissionStatusMap.update(m => ({
			...m,
			[id]: submission?.approvalStatus ?? 'unsubmitted',
		}));

		return { project, submission, hackatimeInfo };
	} catch (err) {
		const errorMsg = err instanceof Error ? err.message : 'Failed to load project details';
		projectDetailStore.set({
			project: null,
			submission: null,
			hackatimeInfo: null,
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

		const numericId = Number(id);
		const [projectRes, linkedHackatimeRes, unlinkedHackatimeRes, projectHackatimeRes] = await Promise.all([
			api.GET('/api/projects/auth/{id}', { params: { path: { id: numericId } } }),
			api.GET('/api/hackatime/projects/linked/{id}', { params: { path: { id: numericId } } }),
			api.GET('/api/hackatime/projects/unlinked'),
			api.GET('/api/projects/auth/{id}/hackatime-projects', { params: { path: { id: numericId } } }),
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

		// Merge linked (for this project) + unlinked projects — linked shown first
		const extractProjects = (data: any): any[] => {
			if (Array.isArray(data)) return data;
			if (data?.projects && Array.isArray(data.projects)) return data.projects;
			return [];
		};
		const linked = extractProjects(linkedHackatimeRes.data);
		const unlinked = extractProjects(unlinkedHackatimeRes.data);
		const linkedNames = new Set(linked.map((p: any) => p.name));
		allHackatimeProjects = [...linked, ...unlinked.filter((p: any) => !linkedNames.has(p.name))];

		if (projectHackatimeRes.data) {
			linkedHackatimeProjects = (projectHackatimeRes.data as any).hackatimeProjects || [];
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
	submissionStatusMap.update(m => {
		const { [id]: _, ...rest } = m;
		return rest;
	});
}

// Invalidate all caches (call after significant changes)
export function invalidateAllProjectCaches() {
	detailCache.clear();
	editDataCache.clear();
	submissionStatusMap.set({});
}
