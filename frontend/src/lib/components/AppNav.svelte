<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { api } from '$lib/api';
	import { userStore } from '$lib/store/userCache';
	import type { InputPromptType } from '$lib/input';

	type Segment = { type: 'input'; value: InputPromptType } | { type: 'text'; value: string };

	interface Props {
		/** Navigation-hint segments shown on the left. */
		segments: Segment[];
	}

	let { segments }: Props = $props();

	const userName = $derived($userStore.userName);
	const referralCode = $derived($userStore.referralCode);
	const currentStreak = $derived($userStore.currentStreak);

	// Hide the "Refer A Friend" button on the refer page itself.
	const onReferPage = $derived(page.url.pathname.replace(/\/+$/, '') === '/app/refer');

	// Eye icon toggles whether the username is visible.
	let nameHidden = $state(false);
	const displayName = $derived(nameHidden ? '' : userName);

	// --- Input-mode hint state ----------------------------------------------
	// Per input (keyboard vs mouse) three opacity states:
	//   inactive (25%) — not the active input mode
	//   active   (50%) — the last-used input mode, at rest
	//   used    (100%) — that input was just used; decays back to active.
	// The keyboard glyph is a WASD d-pad whose keys light individually on press.
	type Mode = 'keyboard' | 'mouse';
	type KeyId = 'W' | 'A' | 'S' | 'D';
	const KEYBOARD_GLYPHS = new Set<InputPromptType>(['WASD', 'WS', 'AD']);
	const isKeyboardGlyph = (t: InputPromptType) => KEYBOARD_GLYPHS.has(t);

	let lastMode = $state<Mode | null>(null);
	let mouseRecent = $state(false);
	let litKeys = $state<Record<KeyId, boolean>>({ W: false, A: false, S: false, D: false });

	let mouseTimer: ReturnType<typeof setTimeout> | null = null;
	const keyTimers: Record<KeyId, ReturnType<typeof setTimeout> | null> = { W: null, A: null, S: null, D: null };

	const KEY_MAP: Record<string, KeyId> = {
		w: 'W', a: 'A', s: 'S', d: 'D',
		ArrowUp: 'W', ArrowLeft: 'A', ArrowDown: 'S', ArrowRight: 'D'
	};

	function markMouse() {
		// On the keyboard→mouse transition, clear any lingering key highlights.
		if (lastMode !== 'mouse') litKeys = { W: false, A: false, S: false, D: false };
		lastMode = 'mouse';
		mouseRecent = true;
		if (mouseTimer) clearTimeout(mouseTimer);
		mouseTimer = setTimeout(() => (mouseRecent = false), 1200);
	}

	function handleKeydown(e: KeyboardEvent) {
		lastMode = 'keyboard';
		mouseRecent = false;
		const id = KEY_MAP[e.key.length === 1 ? e.key.toLowerCase() : e.key];
		if (!id) return;
		litKeys[id] = true;
		if (keyTimers[id]) clearTimeout(keyTimers[id]!);
		keyTimers[id] = setTimeout(() => (litKeys[id] = false), 220);
	}

	function opacityClass(op: number): string {
		if (op === 1) return 'opacity-100';
		if (op === 0.5) return 'opacity-50';
		if (op === 0.25) return 'opacity-25';
		return 'opacity-10';
	}
	// Keys not used by the current page are "disabled" (10%). Active keys follow
	// the mutually-exclusive mode states (25% inactive / 50% active / 100% pressed),
	// so the keyboard and mouse glyphs are never both lit at once.
	function keyOpacity(type: InputPromptType, id: KeyId): number {
		if (!isKeyEnabled(type, id)) return 0.1;
		if (lastMode !== 'keyboard') return 0.25;
		return litKeys[id] ? 1 : 0.5;
	}
	const cursorOpacity = $derived(lastMode !== 'mouse' ? 0.25 : mouseRecent ? 1 : 0.5);

	function isKeyEnabled(type: InputPromptType, id: KeyId): boolean {
		if (type === 'WASD') return true;
		if (type === 'WS') return id === 'W' || id === 'S';
		if (type === 'AD') return id === 'A' || id === 'D';
		return false;
	}

	onMount(() => {
		userStore.load();
		const onMove = () => markMouse();
		const onDown = () => markMouse();
		window.addEventListener('keydown', handleKeydown);
		window.addEventListener('mousemove', onMove);
		window.addEventListener('mousedown', onDown);
		return () => {
			window.removeEventListener('keydown', handleKeydown);
			window.removeEventListener('mousemove', onMove);
			window.removeEventListener('mousedown', onDown);
			if (mouseTimer) clearTimeout(mouseTimer);
			for (const id of Object.keys(keyTimers) as KeyId[]) {
				if (keyTimers[id]) clearTimeout(keyTimers[id]!);
			}
		};
	});

	function handleRefer() {
		goto('/app/refer?back');
	}

	async function logout() {
		await api.POST('/api/user/auth/logout');
		window.location.href = '/';
	}
</script>

{#snippet keyCap(type: InputPromptType, id: KeyId)}
	<div class="size-2 rounded-xs bg-white transition-opacity duration-150 {opacityClass(keyOpacity(type, id))}"></div>
{/snippet}

<div
	class="absolute bottom-0 left-0 right-0 z-50 hidden sm:flex items-center justify-between gap-4 bg-[#1a140c] px-4 h-12 pointer-events-auto"
>
	<!-- Nav hints -->
	<div class="flex items-center gap-1.5">
		{#each segments as segment, i (i)}
			{#if segment.type === 'text'}
				<span class="font-bricolage text-base font-semibold text-white whitespace-nowrap">
					{segment.value}
				</span>
			{:else if isKeyboardGlyph(segment.value)}
				<!-- WASD d-pad: W on top, A/S/D on the bottom row -->
				<div class="grid grid-cols-3 gap-0.5">
					<div class="size-2"></div>
					{@render keyCap(segment.value, 'W')}
					<div class="size-2"></div>
					{@render keyCap(segment.value, 'A')}
					{@render keyCap(segment.value, 'S')}
					{@render keyCap(segment.value, 'D')}
				</div>
			{:else}
				<!-- Mouse cursor -->
				<svg
					class="transition-opacity duration-150 {opacityClass(cursorOpacity)}"
					width="15"
					height="18.5"
					viewBox="0 0 15.0082 18.5031"
					fill="white"
					xmlns="http://www.w3.org/2000/svg"
					aria-hidden="true"
				>
					<path
						d="M0.00214257 0.997259C-0.0463785 0.157956 0.738408 -0.23104 1.42206 0.14179C2.06145 0.490507 2.67111 0.951931 3.28339 1.34882L6.96699 3.73163L12.1105 7.06659L13.4094 7.91132C14.0348 8.3109 14.8588 8.71817 14.9914 9.53242C15.0521 9.90587 14.9453 10.2621 14.7189 10.5617C14.5242 10.8154 14.2723 11.0208 13.9836 11.1603C13.5286 11.3833 12.8402 11.5049 12.3332 11.6252C11.7891 11.7543 11.2283 11.8828 10.6799 11.9865C10.8227 12.3067 11.0914 12.7165 11.2795 13.0256L12.176 14.5041C12.3717 14.8223 12.6725 15.2138 12.76 15.5734C12.9855 16.5022 12.467 16.836 11.7834 17.2766L11.7756 17.2824C11.1324 17.6969 10.5238 18.098 9.82148 18.4201C9.76858 18.4455 9.69232 18.4737 9.6457 18.5031H9.13203C8.94355 18.4064 8.69512 18.3164 8.54999 18.1633C8.22222 17.8168 7.99355 17.3297 7.73554 16.9279C7.26328 16.1929 6.79817 15.3606 6.3166 14.6369C6.03748 15.0444 5.66313 15.4196 5.34589 15.798C4.61877 16.6654 3.48829 18.1585 2.20429 17.3469C1.79708 17.0895 1.57295 16.4561 1.49042 15.9992C1.40667 15.369 1.37203 14.6815 1.3039 14.0344L0.771674 8.64765L0.269721 3.78242C0.170915 2.84949 0.0568592 1.93862 0.00214257 0.997259Z"
					/>
				</svg>
			{/if}
		{/each}
	</div>

	<!-- User info -->
	<div class="flex items-center gap-4">
		<div class="flex items-center gap-2">
			<div class="flex items-center gap-1">
				<span class="font-bricolage text-base font-semibold text-white whitespace-nowrap">{displayName}</span>
				<button
					class="flex items-center text-white cursor-pointer outline-none"
					onclick={() => (nameHidden = !nameHidden)}
					aria-label={nameHidden ? 'Show username' : 'Hide username'}
					aria-pressed={nameHidden}
				>
					{#if nameHidden}
						<svg
							class="size-4"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
							aria-hidden="true"
						>
							<path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
							<path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
							<path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
							<line x1="2" x2="22" y1="2" y2="22" />
						</svg>
					{:else}
						<svg
							class="size-4"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
							aria-hidden="true"
						>
							<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
							<circle cx="12" cy="12" r="3" />
						</svg>
					{/if}
				</button>
			</div>

			<div class="flex items-center justify-center rounded-sm border border-[#c1af96] px-2.5 py-1">
				<span class="font-bricolage text-sm font-semibold text-[#c1af96] whitespace-nowrap">
					{currentStreak} day streak
				</span>
			</div>

			{#if referralCode && !onReferPage}
				<button
					class="flex items-center justify-center rounded-sm border border-[#f3e8d8] px-2.5 py-1 font-bricolage text-sm font-bold text-black whitespace-nowrap cursor-pointer animate-refer-pulse transition-transform hover:scale-[1.04] outline-none"
					onclick={handleRefer}
				>
					Refer A Friend
				</button>
			{/if}
		</div>

		<button
			class="flex items-center text-white/80 transition-opacity hover:opacity-100 cursor-pointer outline-none"
			onclick={logout}
			aria-label="Logout"
		>
			<svg
				class="size-5"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
				aria-hidden="true"
			>
				<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
				<polyline points="16 17 21 12 16 7" />
				<line x1="21" x2="9" y1="12" y2="12" />
			</svg>
		</button>
	</div>
</div>
