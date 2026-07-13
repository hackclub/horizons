import createClient, { type Middleware } from 'openapi-fetch';
import type { paths } from './schema';
import { env } from '$env/dynamic/public';
import { browser } from '$app/environment';

const getBaseUrl = () => {
	return env.PUBLIC_API_URL || 'http://localhost:3002';
};

export const api = createClient<paths>({
	baseUrl: getBaseUrl(),
	credentials: 'include'
});

// A 401 anywhere means the session is gone (expired or revoked). Bounce to
// the login page once instead of letting every panel surface its own error.
// 403s are left to callers — they mean "authenticated but not allowed" and
// several pages probe admin-only endpoints as reviewers on purpose.
let redirecting = false;
const authRedirect: Middleware = {
	onResponse({ response }) {
		if (browser && response.status === 401 && !redirecting) {
			redirecting = true;
			window.location.href = '/';
		}
		return response;
	}
};
api.use(authRedirect);
