const CACHE_KEY = 'pinnedEvent';

interface PinnedEventCache {
	slug: string;
	hourCost: number;
}

export function getCachedPinnedEvent(): PinnedEventCache | null {
	try {
		const raw = localStorage.getItem(CACHE_KEY);
		if (!raw) return null;
		return JSON.parse(raw);
	} catch {
		return null;
	}
}

export function setCachedPinnedEvent(slug: string, hourCost: number): void {
	localStorage.setItem(CACHE_KEY, JSON.stringify({ slug, hourCost }));
}

export function clearCachedPinnedEvent(): void {
	localStorage.removeItem(CACHE_KEY);
}
