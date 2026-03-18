import { api } from '$lib/api';

export async function requireAuth() {
	const response = await api.GET('/api/user/auth/me');
	if (!response.data || !response.data.hcaId) {
		window.location.href = '/';
		return false;
	}
	return true;
}
