<script lang="ts">
	import { onMount } from 'svelte';
	import { api } from '$lib/api';

	interface Props {
		element?: HTMLElement | null;
		selected?: boolean;
		onmouseenter?: () => void;
	}

	interface Entry {
		rank: number;
		displayName: string;
		currentStreak: number;
	}

	let {
		element = $bindable(null),
		selected = false,
		onmouseenter,
	}: Props = $props();

	let entries = $state<Entry[]>([]);
	let loaded = $state(false);

	const PLACE_BG = ['#ffa936', '#f86d95', '#7d7de9'];

	onMount(() => {
		api.GET('/api/streaks/leaderboard', { params: { query: { limit: 7 } } })
			.then(({ data }) => {
				if (Array.isArray(data)) entries = data as Entry[];
			})
			.catch(() => {})
			.finally(() => { loaded = true; });
	});
</script>

<div
	bind:this={element}
	class="card streaks-card"
	class:selected
	{onmouseenter}
>
	<p class="font-cook text-[16px] text-black m-0 leading-none">STREAKS LEADERBOARD</p>
	<div class="lb-list">
		{#if !loaded}
			<p class="font-bricolage text-[16px] text-black/50 m-0 px-2">Loading…</p>
		{:else if entries.length === 0}
			<p class="font-bricolage text-[16px] text-black/50 m-0 px-2">No streaks yet — be the first.</p>
		{:else}
			{#each entries as entry (entry.rank)}
				{@const podium = entry.rank <= 3}
				<div
					class="lb-row"
					class:podium
					style:background-color={podium ? PLACE_BG[entry.rank - 1] : 'transparent'}
				>
					{#if podium}
						<p class="lb-rank-podium font-cook text-[32px] text-black text-center m-0 leading-none">
							{entry.rank}
						</p>
						<div class="lb-name-row text-[20px]">
							<p class="font-bricolage font-bold text-black m-0">{entry.displayName}</p>
							<p class="font-bricolage text-black m-0">{entry.currentStreak}d streak</p>
						</div>
					{:else}
						<p class="lb-rank-flat font-cook text-[16px] text-black text-center m-0 leading-none">
							{entry.rank}
						</p>
						<div class="lb-name-row text-[16px]">
							<p class="font-bricolage font-bold text-black m-0">{entry.displayName}</p>
							<p class="font-bricolage text-black m-0">{entry.currentStreak}d streak</p>
						</div>
					{/if}
				</div>
			{/each}
		{/if}
	</div>
</div>

<style>
	.card {
		border: 4px solid black;
		border-radius: 20px;
		box-shadow: 4px 4px 0px 0px black;
		overflow: hidden;
		color: black;
	}

	.streaks-card {
		width: 471px;
		height: 100%;
		background-color: #f3e8d8;
		display: flex;
		flex-direction: column;
		gap: 16px;
		padding: 16px;
		transition: transform var(--juice-duration) var(--juice-easing);
	}

	.streaks-card.selected {
		transform: scale(var(--juice-scale));
		z-index: 10;
	}

	.lb-list {
		display: flex;
		flex-direction: column;
		gap: 8px;
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		overscroll-behavior: contain;
		padding-right: 4px;
	}

	.lb-list::-webkit-scrollbar {
		width: 6px;
	}
	.lb-list::-webkit-scrollbar-track {
		background: transparent;
	}
	.lb-list::-webkit-scrollbar-thumb {
		background: rgba(0, 0, 0, 0.15);
		border-radius: 3px;
	}
	.lb-list::-webkit-scrollbar-thumb:hover {
		background: rgba(0, 0, 0, 0.3);
	}

	.lb-row {
		display: flex;
		align-items: center;
		gap: 16px;
		padding: 8px 16px;
		border: 2px solid black;
		border-radius: 8px;
		flex-shrink: 0;
	}

	.lb-row.podium {
		filter: drop-shadow(2px 2px 0 black);
	}

	.lb-rank-podium {
		width: 32px;
		flex-shrink: 0;
	}

	.lb-rank-flat {
		width: 16px;
		flex-shrink: 0;
	}

	.lb-name-row {
		display: flex;
		gap: 16px;
		align-items: center;
		min-width: 0;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
</style>
