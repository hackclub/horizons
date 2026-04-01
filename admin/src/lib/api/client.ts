import createClient from 'openapi-fetch';
import type { paths } from './schema';
import { env } from '$env/dynamic/public';

const getBaseUrl = () => {
	return env.PUBLIC_API_URL || 'http://localhost:3002';
};

export const api = createClient<paths>({
	baseUrl: getBaseUrl(),
	credentials: 'include'
});
