import { writable } from 'svelte/store';
import { api } from '$lib/api';
import { m } from '$lib/paraglide/messages.js';

interface UserCache {
	userName: string;
	referralCode: string;
	role: string;
	loaded: boolean;
}

const store = writable<UserCache>({ userName: '', referralCode: '', role: '', loaded: false });

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
					userName: slackDisplayName || m.ts_user_default_name(),
					referralCode: referralRes.data?.referralCode ?? '',
					role: (userRes.data?.role as string) ?? '',
					loaded: true,
				});
			})();
		}

		await fetchPromise;
	},
};
