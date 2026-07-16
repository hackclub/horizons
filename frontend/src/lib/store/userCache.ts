import { writable } from 'svelte/store';
import { api } from '$lib/api';

const STREAK_REFRESH_KEY = 'streak:last-refresh';
const STREAK_REFRESH_COOLDOWN_MS = 30 * 60 * 1000;

interface UserCache {
	userName: string;
	referralCode: string;
	roles: string[];
	currentStreak: number;
	longestStreak: number;
	loaded: boolean;
}

const store = writable<UserCache>({
	userName: '',
	referralCode: '',
	roles: [],
	currentStreak: 0,
	longestStreak: 0,
	loaded: false,
});

let fetchPromise: Promise<void> | null = null;

export const userStore = {
	subscribe: store.subscribe,
	async load() {
		// If already loaded, skip
		let current: UserCache | undefined;
		store.subscribe(v => current = v)();
		if (current?.loaded) return;

		// Deduplicate concurrent calls
		if (!fetchPromise) {
			fetchPromise = (async () => {
				const [userRes, referralRes] = await Promise.all([
					api.GET('/api/user/auth/me') as Promise<{ data?: Record<string, any> }>,
					api.GET('/api/user/auth/referral-code'),
				]);

				const slackDisplayName = userRes.data?.slackDisplayName as string | null | undefined;

				store.set({
					userName: slackDisplayName || 'you',
					referralCode: referralRes.data?.referralCode ?? '',
					roles: (userRes.data?.roles as string[]) ?? [],
					currentStreak: (userRes.data?.currentStreak as number) ?? 0,
					longestStreak: (userRes.data?.longestStreak as number) ?? 0,
					loaded: true,
				});
			})();
		}

		await fetchPromise;
	},
	// Triggers a server-side refresh against Hackatime for today's UTC bucket,
	// then patches the cached streak so the dashboard reflects in-progress
	// coding without a full page reload. Gated client-side to once per 30 min
	// so SPA re-mounts and multi-tab opens don't fan out into duplicate POSTs;
	// server-side also enforces a 30-min cooldown as defense in depth.
	async refreshStreak() {
		try {
			const last = Number(localStorage.getItem(STREAK_REFRESH_KEY)) || 0;
			if (Date.now() - last < STREAK_REFRESH_COOLDOWN_MS) return;
		} catch { /* localStorage unavailable — fall through to fetch */ }

		const res = await api.POST('/api/streaks/refresh', {});
		if (res.data) {
			try { localStorage.setItem(STREAK_REFRESH_KEY, String(Date.now())); } catch { /* ignore */ }
			store.update((s) => ({
				...s,
				currentStreak: res.data!.currentStreak,
				longestStreak: res.data!.longestStreak,
			}));
		}
	},
};
