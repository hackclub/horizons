import { writable, derived, get } from 'svelte/store';
import { api } from '$lib/api';

export interface AnnouncementEventTag {
	slug: string;
	title: string;
}

export interface UserAnnouncement {
	announcementId: number;
	title: string;
	previewText: string;
	body: string;
	showOnOpen: boolean;
	showAsTag: boolean;
	createdAt: string;
	events: AnnouncementEventTag[];
	isRead: boolean;
}

interface AnnouncementsState {
	loaded: boolean;
	items: UserAnnouncement[];
	inboxOpen: boolean;
	detailId: number | null;
	// Tags the user dismissed this session (kept UNREAD — dismissal only hides
	// the floating tag; opening the announcement is what marks it read).
	dismissedTags: Set<number>;
}

const DISMISSED_KEY = 'announcements:dismissed-tags';

function loadDismissed(): Set<number> {
	try {
		const raw = sessionStorage.getItem(DISMISSED_KEY);
		return new Set<number>(raw ? JSON.parse(raw) : []);
	} catch {
		return new Set<number>();
	}
}

function saveDismissed(set: Set<number>) {
	try {
		sessionStorage.setItem(DISMISSED_KEY, JSON.stringify([...set]));
	} catch {
		/* sessionStorage unavailable — dismissal just won't persist */
	}
}

const store = writable<AnnouncementsState>({
	loaded: false,
	items: [],
	inboxOpen: false,
	detailId: null,
	dismissedTags: typeof window !== 'undefined' ? loadDismissed() : new Set<number>(),
});

let loadPromise: Promise<void> | null = null;
let autoOpenDone = false;

export const announcements = {
	subscribe: store.subscribe,

	async load() {
		if (!loadPromise) {
			loadPromise = (async () => {
				const res = await api.GET('/api/announcements/auth' as any, {}).catch(() => null);
				const items = ((res as any)?.data as UserAnnouncement[] | undefined) ?? [];
				store.update((s) => ({ ...s, loaded: true, items }));
			})();
		}
		await loadPromise;
	},

	openInbox() {
		store.update((s) => ({ ...s, inboxOpen: true }));
	},

	closeInbox() {
		store.update((s) => ({ ...s, inboxOpen: false }));
	},

	openDetail(id: number) {
		store.update((s) => ({ ...s, detailId: id, inboxOpen: false }));
	},

	/** Closing an announcement marks it read. `toInbox` returns to the list. */
	closeDetail(opts: { toInbox?: boolean } = {}) {
		const id = get(store).detailId;
		store.update((s) => ({ ...s, detailId: null, inboxOpen: !!opts.toInbox }));
		if (id != null) this.markRead(id);
	},

	async markRead(id: number) {
		store.update((s) => ({
			...s,
			items: s.items.map((a) => (a.announcementId === id ? { ...a, isRead: true } : a)),
		}));
		await api
			.POST('/api/announcements/auth/{id}/read' as any, { params: { path: { id } } })
			.catch(() => {});
	},

	/** Hide the floating tag for this session without marking it read. */
	dismissTag(id: number) {
		store.update((s) => {
			const dismissedTags = new Set(s.dismissedTags);
			dismissedTags.add(id);
			saveDismissed(dismissedTags);
			return { ...s, dismissedTags };
		});
	},

	/** Auto-open the most recent unread "show on open" announcement, once per load. */
	maybeAutoOpen() {
		if (autoOpenDone) return;
		autoOpenDone = true;
		const s = get(store);
		const target = s.items.find((a) => a.showOnOpen && !a.isRead);
		if (target) store.update((st) => ({ ...st, detailId: target.announcementId }));
	},
};

// Items arrive newest-first from the API.
export const unreadCount = derived(store, (s) => s.items.filter((a) => !a.isRead).length);

export const tagAnnouncement = derived(
	store,
	(s) => s.items.find((a) => a.showAsTag && !a.isRead && !s.dismissedTags.has(a.announcementId)) ?? null,
);

export const currentDetail = derived(store, (s) =>
	s.detailId != null ? (s.items.find((a) => a.announcementId === s.detailId) ?? null) : null,
);

export const inboxOpen = derived(store, (s) => s.inboxOpen);
