// Tiny stale-while-revalidate cache for GET endpoints shared across pages
// (e.g. the review queue loaded by both the gallery and the per-project
// review page). Values live in module memory only — a full page load starts
// empty, and mutations must invalidate() the keys they affect.

type Entry = { data: unknown; fetchedAt: number };

const cache = new Map<string, Entry>();
const inflight = new Map<string, Promise<unknown>>();

/**
 * Return the cached value for `key` if younger than `maxAgeMs`, otherwise
 * fetch it, deduping concurrent callers. A stale value is returned
 * immediately while a background refresh updates the cache for the next
 * reader.
 */
export async function cachedGet<T>(
	key: string,
	fetcher: () => Promise<T>,
	{ maxAgeMs = 60_000 }: { maxAgeMs?: number } = {},
): Promise<T> {
	const entry = cache.get(key);
	if (entry && Date.now() - entry.fetchedAt < maxAgeMs) return entry.data as T;

	const load = (): Promise<T> => {
		const existing = inflight.get(key);
		if (existing) return existing as Promise<T>;
		const p = fetcher()
			.then((data) => {
				cache.set(key, { data, fetchedAt: Date.now() });
				return data;
			})
			.finally(() => {
				inflight.delete(key);
			});
		inflight.set(key, p);
		return p;
	};

	if (entry) {
		void load().catch(() => {});
		return entry.data as T;
	}
	return load();
}

export function invalidate(key: string) {
	cache.delete(key);
}

/** Synchronously read whatever is cached, regardless of age. */
export function peek<T>(key: string): T | undefined {
	return cache.get(key)?.data as T | undefined;
}
