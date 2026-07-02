import { writable } from 'svelte/store';

// True while the app home page is playing its card exit animation before a
// route change. The home page sets this on click (well before SvelteKit's
// `navigating` populates, since it waits out the exit anim before calling
// goto), so the floating announcement tag can fly out first, in step with the
// cards. Reset to false when the home page (re)mounts.
export const homeExiting = writable(false);
