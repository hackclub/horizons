<script lang="ts">
	interface Project {
		name: string;
		total_seconds?: number;
	}

	interface Props {
		projects: Project[];
		selectedNames: Set<string>;
		onToggle: (name: string) => void;
		loading?: boolean;
	}

	import { slide } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { m } from '$lib/paraglide/messages.js';

	let { projects, selectedNames, onToggle, loading = false }: Props = $props();

	let open = $state(false);
	let containerEl = $state<HTMLDivElement | undefined>(undefined);

	function formatHours(seconds?: number): string {
		if (!seconds) return '0.0h';
		const hours = Math.round((seconds / 3600) * 10) / 10;
		return `${hours}h`;
	}

	function handleClickOutside(e: MouseEvent) {
		if (containerEl && !containerEl.contains(e.target as Node)) {
			open = false;
		}
	}
</script>

<svelte:window onclick={handleClickOutside} />

<div class="flex flex-col gap-1 w-full" bind:this={containerEl}>
	<span class="font-bricolage text-base font-semibold text-black leading-normal">{m.comp_hackatime_select_label()}</span>

	<div class="relative w-full">
		<!-- Trigger -->
		<button
			type="button"
			class="hackatime-trigger bg-[#f3e8d8] border-2 border-black rounded-lg px-4 py-2 shadow-[2px_2px_0px_0px_black] w-full flex items-center justify-between gap-2 cursor-pointer outline-none"
			onclick={() => (open = !open)}
			disabled={loading}
		>
			<div class="flex flex-wrap gap-1 flex-1 min-w-0">
				{#if selectedNames.size === 0}
					<span class="font-bricolage text-base font-semibold text-black/40">{m.comp_hackatime_select_none()}</span>
				{:else}
					{#each [...selectedNames] as name (name)}
						<span class="bg-black text-[#f3e8d8] font-bricolage text-sm font-semibold px-2 py-0.5 rounded-sm whitespace-nowrap">
							{name}
						</span>
					{/each}
				{/if}
			</div>
			<svg
				class="shrink-0 transition-transform duration-180 {open ? 'rotate-180' : ''}"
				width="12"
				height="8"
				viewBox="0 0 12 8"
				fill="none"
			>
				<path d="M1 1.5L6 6.5L11 1.5" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
			</svg>
		</button>

		<!-- Dropdown -->
		{#if open}
			<div
				transition:slide={{ duration: 180, easing: cubicOut }}
				class="absolute top-full left-0 right-0 mt-1 bg-[#f3e8d8] border-2 border-black rounded-lg z-20 shadow-[2px_2px_0px_0px_black] max-h-60 overflow-y-auto dropdown-list"
			>
				{#if loading}
					<div class="px-4 py-3 font-bricolage text-sm text-black/50 text-center">{m.comp_hackatime_select_loading()}</div>
				{:else if projects.length === 0}
					<div class="px-4 py-3 font-bricolage text-sm text-black/50 text-center">
						{m.comp_hackatime_select_empty()}
					</div>
				{:else}
					{#each projects as project (project.name)}
						{@const selected = selectedNames.has(project.name)}
						<button
							type="button"
							class="dropdown-item w-full flex items-center justify-between px-4 py-2 cursor-pointer outline-none text-left {selected ? 'selected bg-[#ffa936]' : ''}"
							onclick={() => onToggle(project.name)}
						>
							<div class="flex flex-col items-start flex-1 min-w-0">
								<span class="font-bricolage text-sm font-normal text-black leading-normal tracking-[-0.154px] truncate w-full">
									{project.name}
								</span>
								<span class="font-bricolage text-xs text-black/50 leading-normal">
									{formatHours(project.total_seconds)}
								</span>
							</div>
							<div class="shrink-0 size-4 border border-black rounded-sm flex items-center justify-center ml-3 {selected ? 'bg-black' : 'bg-transparent'}">
								{#if selected}
									<svg width="10" height="8" viewBox="0 0 10 8" fill="none">
										<path d="M1 4L3.5 6.5L9 1" stroke="#f3e8d8" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
									</svg>
								{/if}
							</div>
						</button>
					{/each}
				{/if}
			</div>
		{/if}
	</div>
</div>

<style>
	.hackatime-trigger {
		transition: transform var(--juice-duration) var(--juice-easing);
	}
	.hackatime-trigger:hover {
		transform: scale(var(--juice-scale));
	}
	.dropdown-item {
		transition: background-color var(--selected-duration) ease;
	}
	.dropdown-item:not(.selected):hover {
		background-color: rgba(0, 0, 0, 0.07);
	}
	.dropdown-list::-webkit-scrollbar {
		width: 8px;
	}
	.dropdown-list::-webkit-scrollbar-track {
		background: transparent;
	}
	.dropdown-list::-webkit-scrollbar-thumb {
		background: black;
		border-radius: 8px;
	}
</style>
