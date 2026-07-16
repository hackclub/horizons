import { get } from 'svelte/store';
import { perfMode, type PerfMode } from '$lib/store/settingsCache';

/**
 * Polling-interval multiplier per performance mode. High/Ultra stretch every
 * poller so a long-lived tab wakes the CPU (and hits the API) less often.
 */
const POLL_SCALE: Record<PerfMode, number> = { off: 1, high: 2, ultra: 4 };

interface PollOptions {
	/** Multiply the interval by the performance-mode scale (default true). */
	scaled?: boolean;
	/** Run `fn` immediately when the tab becomes visible again (default true). */
	catchUp?: boolean;
}

/**
 * A setInterval that stays quiet when it can: the timer is stopped entirely
 * while the tab is hidden (with a catch-up call when it returns, so stale UI
 * corrects instantly) and its period is stretched by High/Ultra Performance
 * Mode. Client-side only. Returns a dispose function, usable directly as an
 * onMount / $effect cleanup.
 */
export function pollWhileVisible(
	fn: () => void,
	baseMs: number,
	opts: PollOptions = {},
): () => void {
	const { scaled = true, catchUp = true } = opts;
	let id: ReturnType<typeof setInterval> | null = null;

	function stop() {
		if (id !== null) {
			clearInterval(id);
			id = null;
		}
	}

	function start() {
		stop();
		if (document.hidden) return;
		id = setInterval(fn, scaled ? baseMs * POLL_SCALE[get(perfMode)] : baseMs);
	}

	function onVisibility() {
		if (document.hidden) {
			stop();
		} else {
			if (catchUp) fn();
			start();
		}
	}

	// Re-arm with the new period when the performance mode changes. The
	// subscribe callback fires once immediately, which is the initial start().
	const unsubscribe = perfMode.subscribe(() => start());
	document.addEventListener('visibilitychange', onVisibility);

	return () => {
		unsubscribe();
		document.removeEventListener('visibilitychange', onVisibility);
		stop();
	};
}
