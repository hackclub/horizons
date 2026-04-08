import { writable } from 'svelte/store';
import { api } from '$lib/api';

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

				store.set({
					userName: userRes.data?.firstName ? (userRes.data.firstName as string).toLowerCase() : '',
					referralCode: referralRes.data?.referralCode ?? '',
					role: (userRes.data?.role as string) ?? '',
					loaded: true,
				});
			})();
		}

		await fetchPromise;
	},
};
