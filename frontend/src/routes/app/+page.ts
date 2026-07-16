import type { PageLoad } from './$types';
import { api } from '$lib/api';

// Fetch community events up-front so the page can decide at mount whether to
// render the community-events column at all — it's hidden when there are none.
// On failure we return `null` (rather than an empty list) so the column stays
// shown and the card falls back to fetching for itself.
export const load: PageLoad = async ({ fetch }) => {
	try {
		const { data } = await api.GET('/api/community-events', { fetch });
		return { communityEvents: data ?? null };
	} catch {
		return { communityEvents: null };
	}
};
