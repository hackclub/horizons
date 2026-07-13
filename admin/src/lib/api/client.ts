import createClient, { type Middleware } from 'openapi-fetch';
import type { paths } from './schema';
import { env } from '$env/dynamic/public';
import { browser } from '$app/environment';
import { base } from '$app/paths';

const getBaseUrl = () => {
	return env.PUBLIC_API_URL || 'http://localhost:3002';
};

export const api = createClient<paths>({
	baseUrl: getBaseUrl(),
	credentials: 'include'
});

// A 401 anywhere means the session is gone (expired or revoked). Bounce to
// the admin login once instead of letting every panel surface its own error.
// 403s are left to callers — they mean "authenticated but not allowed" and
// several pages probe admin-only endpoints as reviewers on purpose.
let redirecting = false;
const authRedirect: Middleware = {
	onResponse({ response }) {
		if (browser && response.status === 401 && !redirecting) {
			const loginPath = `${base}/login`;
			// The login page itself probes /me while signed out — never bounce it.
			if (!window.location.pathname.startsWith(loginPath)) {
				redirecting = true;
				const next = encodeURIComponent(
					window.location.pathname + window.location.search
				);
				window.location.href = `${loginPath}?next=${next}`;
			}
		}
		return response;
	}
};
api.use(authRedirect);
