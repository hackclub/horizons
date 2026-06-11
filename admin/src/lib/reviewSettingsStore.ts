import { writable } from 'svelte/store';
import { browser } from '$app/environment';

// What the focused review view does right after a reviewer submits an
// approve/reject verdict:
//  - 'gallery': return to the project gallery (default)
//  - 'stay':    stay on the current project and show its card
export type AfterVerdict = 'stay' | 'gallery';

const STORAGE_KEY = 'horizons-review-after-verdict';

function getInitial(): AfterVerdict {
	if (browser) {
		const saved = localStorage.getItem(STORAGE_KEY);
		if (saved === 'stay' || saved === 'gallery') return saved;
	}
	return 'gallery';
}

export const afterVerdict = writable<AfterVerdict>(getInitial());

if (browser) {
	afterVerdict.subscribe((value) => {
		localStorage.setItem(STORAGE_KEY, value);
	});
}
