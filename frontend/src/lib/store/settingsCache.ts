import { writable, derived } from 'svelte/store';

export type SettingsTab = 'preferences' | 'hackatime';

/**
 * Resource-saving tiers. 'high' throttles pollers and stops always-running
 * decorative motion; 'ultra' additionally minimizes one-shot animations, idle
 * slideshows, countdown tick rate, and music autoplay. See `$lib/perf`.
 */
export type PerfMode = 'off' | 'high' | 'ultra';

interface SettingsState {
	/** Whether the settings modal is open. */
	open: boolean;
	/** Active sidebar tab. */
	tab: SettingsTab;
	/** Utility — suppress non-essential motion across the site. */
	reduceAnimations: boolean;
	/** Utility — trade visual flourish for CPU/RAM savings. */
	perfMode: PerfMode;
	/** Utility — hide the decorative frame that wraps the app. */
	hideBorders: boolean;
	/**
	 * For-fun toggles (the border gags that build on "Hide borders").
	 * Persisted so they survive reopening, keyed by toggle id.
	 */
	fun: Record<string, boolean>;
}

// "Reduce Animations" reuses the pre-existing `disableAnimations` flag that the
// FAQ / event pages already read from localStorage, so the preference is shared
// across the whole site.
const REDUCE_ANIM_KEY = 'disableAnimations';
const PERF_MODE_KEY = 'settings:perfMode';
const HIDE_BORDERS_KEY = 'settings:hideBorders';
const FUN_KEY = 'settings:fun';

function loadBool(key: string): boolean {
	if (typeof window === 'undefined') return false;
	try {
		return localStorage.getItem(key) === 'true';
	} catch {
		return false;
	}
}

function loadPerfMode(): PerfMode {
	if (typeof window === 'undefined') return 'off';
	try {
		const raw = localStorage.getItem(PERF_MODE_KEY);
		if (raw === 'high' || raw === 'ultra') return raw;
		if (raw === 'off') return 'off';
		// Migrate the old cosmetic `fun.highPerf` gag: users who flipped it on
		// asked for this mode before it did anything, so honor it now.
		const fun = localStorage.getItem(FUN_KEY);
		if (fun && (JSON.parse(fun) as Record<string, boolean>).highPerf) return 'high';
		return 'off';
	} catch {
		return 'off';
	}
}

function loadFun(): Record<string, boolean> {
	if (typeof window === 'undefined') return {};
	try {
		const raw = localStorage.getItem(FUN_KEY);
		return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
	} catch {
		return {};
	}
}

function persist(key: string, value: string) {
	try {
		localStorage.setItem(key, value);
	} catch {
		/* localStorage unavailable — preference just won't persist */
	}
}

const store = writable<SettingsState>({
	open: false,
	tab: 'preferences',
	reduceAnimations: loadBool(REDUCE_ANIM_KEY),
	perfMode: loadPerfMode(),
	hideBorders: loadBool(HIDE_BORDERS_KEY),
	fun: loadFun(),
});

export const settings = {
	subscribe: store.subscribe,
	open() {
		store.update((s) => ({ ...s, open: true }));
	},
	close() {
		store.update((s) => ({ ...s, open: false }));
	},
	toggle() {
		store.update((s) => ({ ...s, open: !s.open }));
	},
	setTab(tab: SettingsTab) {
		store.update((s) => ({ ...s, tab }));
	},
	setReduceAnimations(value: boolean) {
		persist(REDUCE_ANIM_KEY, String(value));
		store.update((s) => ({ ...s, reduceAnimations: value }));
	},
	setPerfMode(mode: PerfMode) {
		persist(PERF_MODE_KEY, mode);
		store.update((s) => ({ ...s, perfMode: mode }));
	},
	setHideBorders(value: boolean) {
		persist(HIDE_BORDERS_KEY, String(value));
		store.update((s) => {
			// Turning borders back on resets the dependent gags, so the chain
			// always starts fresh rather than snapping back to a stale state.
			const fun = value ? s.fun : { ...s.fun, bringBackBorders: false, onlyBorder: false };
			if (!value) persist(FUN_KEY, JSON.stringify(fun));
			return { ...s, hideBorders: value, fun };
		});
	},
	setFun(key: string, value: boolean) {
		store.update((s) => {
			const fun = { ...s.fun, [key]: value };
			persist(FUN_KEY, JSON.stringify(fun));
			return { ...s, fun };
		});
	},
};

export const settingsOpen = derived(store, (s) => s.open);
export const reduceAnimations = derived(store, (s) => s.reduceAnimations);

export const perfMode = derived(store, (s) => s.perfMode);
/** High or Ultra Performance Mode is on. */
export const highPerf = derived(store, (s) => s.perfMode !== 'off');
/** Ultra Performance Mode is on. */
export const ultraPerf = derived(store, (s) => s.perfMode === 'ultra');
/**
 * Continuous decorative motion (background scroll, text waves, pulses) should
 * be suppressed — these animate forever, so they dominate long-tab CPU/GPU use.
 * One-shot transitions are governed separately (Ultra kills them via CSS).
 */
export const suppressAmbientMotion = derived(
	store,
	(s) => s.reduceAnimations || s.perfMode !== 'off',
);

// The decorative frame is collapsed only while "Hide borders" is on and the
// "bring the border back" gag hasn't overridden it.
export const bordersHidden = derived(
	store,
	(s) => s.hideBorders && !(s.fun.bringBackBorders ?? false),
);

// "I only want border" — the frame is back but the beige panel is stripped, so
// content sits directly on the brown border texture. Only reachable through the
// full Hide → bring-back → only-border chain.
export const onlyBorder = derived(
	store,
	(s) => s.hideBorders && (s.fun.bringBackBorders ?? false) && (s.fun.onlyBorder ?? false),
);
