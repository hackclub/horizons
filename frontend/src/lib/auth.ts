import { api } from '$lib/api';
import { goto } from '$app/navigation';

export async function requireAuth() {
	const response = await api.GET('/api/user/auth/me');
	if (!response.data || !response.data.hcaId) {
		goto('/');
		return false;
	}
	return true;
}
