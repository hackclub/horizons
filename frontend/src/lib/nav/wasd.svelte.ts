export type NavDirection = 'up' | 'down' | 'left' | 'right';

/** Parse a keyboard event key into a navigation direction, or null. */
export function parseNavKey(key: string): NavDirection | null {
	switch (key) {
		case 'w': case 'W': case 'ArrowUp': return 'up';
		case 's': case 'S': case 'ArrowDown': return 'down';
		case 'a': case 'A': case 'ArrowLeft': return 'left';
		case 'd': case 'D': case 'ArrowRight': return 'right';
		default: return null;
	}
}

/** Check if a key is any navigation-related key (WASD, arrows, Enter, Escape, Tab). */
export function isNavKey(key: string): boolean {
	return parseNavKey(key) !== null || ['Enter', 'Escape', 'Tab'].includes(key);
}

/** Clamp an index within [0, max]. */
export function clampIndex(index: number, max: number): number {
	return Math.max(0, Math.min(max, index));
}

/** Shared nav mode state across all nav instances, backed by sessionStorage. */
const storedMode = typeof sessionStorage !== 'undefined'
	? (sessionStorage.getItem('nav-mode') as 'keyboard' | 'mouse' | null)
	: null;
let navMode = $state<'keyboard' | 'mouse'>(storedMode ?? 'mouse');
$effect.root(() => {
	$effect(() => {
		if (typeof sessionStorage !== 'undefined') {
			sessionStorage.setItem('nav-mode', navMode);
		}
	});
	$effect(() => {
		if (typeof document !== 'undefined') {
			document.body.style.cursor = navMode === 'keyboard' ? 'none' : '';
		}
	});
	if (typeof window !== 'undefined') {
		window.addEventListener('mousemove', () => {
			if (navMode === 'keyboard') {
				navMode = 'mouse';
			}
		});
	}
});

/** Reactive accessor for the shared nav mode. */
export const navState = {
	get usingKeyboard() { return navMode === 'keyboard'; },
	set usingKeyboard(v: boolean) { navMode = v ? 'keyboard' : 'mouse'; },
};

interface ListNavOptions {
	/** Total number of items (reactive getter). */
	count: () => number;
	/** Called when Enter is pressed on the selected item. */
	onSelect?: (index: number) => void;
	/** Called when Escape is pressed. */
	onEscape?: () => void;
	/** Called after the selected index changes from keyboard or wheel input. */
	onChange?: (index: number) => void;
	/** Enable wheel-to-scroll navigation. Pass a number to set the threshold (default 80). */
	wheel?: boolean | number;
	/** Starting index (default 0). */
	initial?: number;
	/** Use left/right (A/D) instead of up/down (W/S) and invert wheel axis. */
	horizontal?: boolean;
}

/**
 * Composable for 1D WASD list navigation.
 * Handles W/S + Arrow Up/Down, Enter, Escape, and optional wheel scroll.
 * Switches between keyboard and mouse modes instead of handling both simultaneously.
 */
export function createListNav(options: ListNavOptions) {
	let selectedIndex = $state(options.initial ?? 0);
	let wheelAccumulator = 0;
	const wheelThreshold = typeof options.wheel === 'number' ? options.wheel : 80;

	function move(delta: number) {
		selectedIndex = clampIndex(selectedIndex + delta, options.count() - 1);
		options.onChange?.(selectedIndex);
	}

	const prevDir = options.horizontal ? 'left' : 'up';
	const nextDir = options.horizontal ? 'right' : 'down';

	function handleKeydown(e: KeyboardEvent) {
		const dir = parseNavKey(e.key);

		if (isNavKey(e.key) && navMode === 'mouse') {
			navMode = 'keyboard';
		}

		if (dir === prevDir) {
			e.preventDefault();
			move(-1);
		} else if (dir === nextDir) {
			e.preventDefault();
			move(1);
		} else if (e.key === 'Enter') {
			options.onSelect?.(selectedIndex);
		} else if (e.key === 'Escape') {
			options.onEscape?.();
		}
	}

	function handleWheel(e: WheelEvent) {
		if (!options.wheel) return;
		e.preventDefault();
		const delta = options.horizontal ? (e.deltaX || -e.deltaY) : e.deltaY;
		wheelAccumulator += delta;

		if (wheelAccumulator > wheelThreshold) {
			wheelAccumulator = 0;
			move(1);
		} else if (wheelAccumulator < -wheelThreshold) {
			wheelAccumulator = 0;
			move(-1);
		}
	}

	/** Select an index via mouse (switches to mouse mode). */
	function select(index: number) {
		navMode = 'mouse';
		selectedIndex = index;
	}

	return {
		get selectedIndex() { return selectedIndex; },
		set selectedIndex(v: number) { selectedIndex = v; },
		get usingKeyboard() { return navMode === 'keyboard'; },
		set usingKeyboard(v: boolean) { navMode = v ? 'keyboard' : 'mouse'; },
		handleKeydown,
		handleWheel,
		select,
	};
}

interface GridNavOptions {
	/** Array of column sizes, e.g. [2, 3] for col 0 with 2 rows, col 1 with 3 rows. */
	columns: () => number[];
	/** Called when Enter is pressed. Receives (col, row). */
	onSelect?: (col: number, row: number) => void;
	/** Called when Escape is pressed. */
	onEscape?: () => void;
}

/**
 * Composable for 2D WASD grid navigation.
 * W/S moves within a column, A/D switches columns (clamping row to new column size).
 * Switches between keyboard and mouse modes instead of handling both simultaneously.
 */
export function createGridNav(options: GridNavOptions) {
	let col = $state(0);
	let row = $state(0);

	function handleKeydown(e: KeyboardEvent) {
		const dir = parseNavKey(e.key);
		const cols = options.columns();

		if (isNavKey(e.key) && navMode === 'mouse') {
			navMode = 'keyboard';
		}

		if (dir === 'up') {
			e.preventDefault();
			row = clampIndex(row - 1, cols[col] - 1);
		} else if (dir === 'down') {
			e.preventDefault();
			row = clampIndex(row + 1, cols[col] - 1);
		} else if (dir === 'left') {
			e.preventDefault();
			col = clampIndex(col - 1, cols.length - 1);
			row = clampIndex(row, cols[col] - 1);
		} else if (dir === 'right') {
			e.preventDefault();
			col = clampIndex(col + 1, cols.length - 1);
			row = clampIndex(row, cols[col] - 1);
		} else if (e.key === 'Enter') {
			options.onSelect?.(col, row);
		} else if (e.key === 'Escape') {
			options.onEscape?.();
		}
	}

	/** Select a cell via mouse (switches to mouse mode). */
	function select(c: number, r: number) {
		navMode = 'mouse';
		col = c;
		row = r;
	}

	function isSelected(c: number, r: number): boolean {
		return col === c && row === r;
	}

	return {
		get col() { return col; },
		set col(v: number) { col = v; },
		get row() { return row; },
		set row(v: number) { row = v; },
		get usingKeyboard() { return navMode === 'keyboard'; },
		set usingKeyboard(v: boolean) { navMode = v ? 'keyboard' : 'mouse'; },
		handleKeydown,
		select,
		isSelected,
	};
}
