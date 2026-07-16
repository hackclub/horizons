import { writable, get } from 'svelte/store';
import { browser } from '$app/environment';
import { api } from '$lib/api';

// The /me endpoint has no response DTO in the OpenAPI schema, so pages have
// historically cast its payload. Keep the shape here minimal (the fields the
// admin app actually reads) while preserving access to the rest.
export interface CurrentUser {
	email: string;
	roles: string[];
	name?: string;
	[key: string]: unknown;
}

// Client-only store: never populated during SSR. A module-level store on the
// server would be shared across concurrent requests and could leak one
// user's data into another's render. All admin pages fetch client-side, and
// the (app) layout awaits ensureUser() before rendering children — so pages
// and components under (app) can read $currentUser synchronously.
export const currentUser = writable<CurrentUser | null>(null);

let inflight: Promise<CurrentUser | null> | null = null;

/**
 * Resolve the current user, fetching /api/user/auth/me at most once.
 * Concurrent callers share the same request. Auth is still enforced
 * server-side on every API call — this only exists for UI decisions.
 */
export function ensureUser(options: { force?: boolean } = {}): Promise<CurrentUser | null> {
	if (!browser) return Promise.resolve(null);
	const existing = get(currentUser);
	if (existing && !options.force) return Promise.resolve(existing);
	if (inflight && !options.force) return inflight;
	inflight = api
		.GET('/api/user/auth/me')
		.then(({ data, error }) => {
			if (error || !data) {
				currentUser.set(null);
				return null;
			}
			const user = data as unknown as CurrentUser;
			currentUser.set(user);
			return user;
		})
		.catch(() => {
			currentUser.set(null);
			return null;
		})
		.finally(() => {
			inflight = null;
		});
	return inflight;
}

export function clearUser() {
	currentUser.set(null);
}
