<script lang="ts">
	import { scale } from 'svelte/transition';
	import { backOut } from 'svelte/easing';
	import { api } from '$lib/api';
	import { settings, type PerfMode, type SettingsTab } from '$lib/store/settingsCache';
	import { invalidateAllProjectCaches } from '$lib/store/projectDetailCache';
	import HackatimeLinkButton from '$lib/components/HackatimeLinkButton.svelte';
	import Toggle from './Toggle.svelte';

	interface Props {
		tab: SettingsTab;
		reduceAnimations: boolean;
		perfMode: PerfMode;
		hideBorders: boolean;
		/** For-fun toggle state, keyed by toggle id. */
		fun: Record<string, boolean>;
		onClose: () => void;
	}

	let { tab, reduceAnimations, perfMode, hideBorders, fun, onClose }: Props = $props();

	const tabs: { id: SettingsTab; label: string }[] = [
		{ id: 'preferences', label: 'Preferences' },
		{ id: 'hackatime', label: 'Hackatime' },
	];

	let hackatimeLinked = $state(false);
	// Bumped after an unlink to remount HackatimeLinkButton, which only checks
	// account status on mount.
	let hackatimeKey = $state(0);
	let unlinkArmed = $state(false);
	let unlinking = $state(false);
	let unlinkError = $state('');
	let disarmTimer: ReturnType<typeof setTimeout> | null = null;

	async function handleUnlink() {
		if (unlinking) return;
		if (!unlinkArmed) {
			unlinkArmed = true;
			unlinkError = '';
			if (disarmTimer) clearTimeout(disarmTimer);
			disarmTimer = setTimeout(() => (unlinkArmed = false), 4000);
			return;
		}
		if (disarmTimer) clearTimeout(disarmTimer);
		unlinking = true;
		unlinkError = '';
		const { error } = await api.POST('/api/hackatime/unlink');
		unlinking = false;
		unlinkArmed = false;
		if (error) {
			unlinkError = 'Failed to unlink. Please try again.';
			return;
		}
		// Cached project/edit data may reference the old account's Hackatime
		// projects — same invalidation the link flow does on the linking edge.
		invalidateAllProjectCaches();
		hackatimeLinked = false;
		hackatimeKey += 1;
	}
</script>

<div
	class="pointer-events-none fixed inset-0 z-71 flex items-center justify-center p-6"
	role="dialog"
	aria-modal="true"
	aria-label="Settings"
>
	<div
		class="pointer-events-auto relative flex h-[640px] max-h-[85vh] w-[800px] max-w-[92vw] overflow-hidden rounded-[20px] border-4 border-black bg-[#f3e8d8] p-3 shadow-[4px_4px_0px_0px_black]"
		transition:scale={{ start: 0.9, opacity: 0, duration: 260, easing: backOut }}
		data-settings-modal
	>
		<!-- Close -->
		<button
			type="button"
			class="absolute right-4 top-4 z-10 flex cursor-pointer items-center text-black outline-none"
			aria-label="Close"
			onclick={onClose}
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
				<path d="M18 6 6 18" />
				<path d="m6 6 12 12" />
			</svg>
		</button>

		<!-- Sidebar -->
		<aside class="flex h-full w-[240px] shrink-0 flex-col gap-4 rounded-lg bg-[#1a140c] p-4">
			<p class="m-0 font-cook text-[24px] text-[#f3e8d8]">Settings</p>
			<nav class="flex flex-col gap-2">
				{#each tabs as t (t.id)}
					<button
						type="button"
						class="cursor-pointer rounded-[4px] p-2 text-left font-bricolage text-[16px] outline-none transition-colors {tab ===
						t.id
							? 'bg-[#f3e8d8] text-[#1a140c]'
							: 'text-[#f3e8d8] hover:bg-[#3e3221]'}"
						onclick={() => settings.setTab(t.id)}
					>
						{t.label}
					</button>
				{/each}
			</nav>
		</aside>

		<!-- Content -->
		<section class="flex h-full min-w-0 flex-1 flex-col gap-8 overflow-y-auto p-7 pr-8">
			{#if tab === 'preferences'}
				<div class="flex flex-col gap-2">
					<h2 class="m-0 font-bricolage text-[16px] font-bold text-black">Performance Settings</h2>
					<div class="flex flex-col gap-2">
						<Toggle
							label="Reduce Animations"
							checked={reduceAnimations}
							onchange={(v) => settings.setReduceAnimations(v)}
						/>
						<Toggle
							label="Enable High Performance Mode"
							checked={perfMode !== 'off'}
							onchange={(v) => settings.setPerfMode(v ? 'high' : 'off')}
						/>
						{#if perfMode !== 'off'}
							<Toggle
								label="Enable Ultra Performance Mode"
								checked={perfMode === 'ultra'}
								onchange={(v) => settings.setPerfMode(v ? 'ultra' : 'high')}
							/>
						{/if}
						<p class="m-0 font-bricolage text-[14px] text-black/50">
							{#if perfMode === 'ultra'}
								Ultra: minimal animations, slowest background refresh, no music autoplay.
							{:else if perfMode === 'high'}
								High: pauses decorative motion and halves background refresh rates.
							{:else}
								Performance modes cut CPU and memory use for long sessions or slower devices.
							{/if}
						</p>
					</div>
				</div>
				<div class="flex flex-col gap-2">
					<h2 class="m-0 font-bricolage text-[16px] font-bold text-black">Borders</h2>
					<div class="flex flex-col gap-2">
						<!-- Utility: actually hides the decorative frame around the app. -->
						<Toggle
							label="Hide borders"
							checked={hideBorders}
							onchange={(v) => settings.setHideBorders(v)}
						/>
						<!-- Escalating gags — each only appears once the previous one is on. -->
						{#if hideBorders}
							<Toggle
								label="Actually, bring the border back"
								checked={fun.bringBackBorders ?? false}
								onchange={(v) => settings.setFun('bringBackBorders', v)}
							/>
						{/if}
						{#if hideBorders && (fun.bringBackBorders ?? false)}
							<Toggle
								label="I only want border"
								checked={fun.onlyBorder ?? false}
								onchange={(v) => settings.setFun('onlyBorder', v)}
							/>
						{/if}
					</div>
				</div>
			{:else if tab === 'hackatime'}
				<div class="flex flex-col gap-2">
					<h2 class="m-0 font-bricolage text-[16px] font-bold text-black">Account</h2>
					{#key hackatimeKey}
						<HackatimeLinkButton bind:linked={hackatimeLinked} />
					{/key}
				</div>
				{#if hackatimeLinked}
					<div class="flex flex-col gap-2">
						<h2 class="m-0 font-bricolage text-[16px] font-bold text-black">Unlink</h2>
						<p class="m-0 font-bricolage text-[14px] text-black/50">
							Disconnects your Hackatime account from Horizons. Your projects and approved
							hours are kept — you can relink at any time.
						</p>
						<button
							type="button"
							class="self-start cursor-pointer rounded-lg border-2 border-black px-4 py-2 font-bricolage text-[16px] font-bold text-black transition-colors {unlinkArmed
								? 'bg-[#fc5b3c]'
								: 'bg-white hover:bg-[#fc5b3c]/20'}"
							disabled={unlinking}
							onclick={handleUnlink}
						>
							{#if unlinking}
								Unlinking...
							{:else if unlinkArmed}
								Click again to confirm
							{:else}
								Unlink from Hackatime
							{/if}
						</button>
						{#if unlinkError}
							<p class="m-0 font-bricolage text-[14px] text-[#fc5b3c]">{unlinkError}</p>
						{/if}
					</div>
				{/if}
			{/if}
		</section>
	</div>
</div>
