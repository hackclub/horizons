<script lang="ts">
	import type { components } from '$lib/api';
	type QueueItem = components['schemas']['QueueItemResponse'];

	interface Props {
		items: QueueItem[];
		onSelect: (index: number) => void;
		onRefresh: () => void;
		refreshing?: boolean;
	}

	let { items, onSelect, onRefresh, refreshing = false }: Props = $props();

	const PROJECT_TYPES = [
		'windows_playable',
		'mac_playable',
		'linux_playable',
		'web_playable',
		'cross_platform_playable',
		'hardware',
	];

	let selectedTypes = $state<Set<string>>(new Set());
	let searchQuery = $state('');

	let filteredItems = $derived(
		items
			.map((item, index) => ({ item, index }))
			.filter(({ item }) => {
				const matchesType =
					selectedTypes.size === 0 || selectedTypes.has(item.project.projectType);
				const matchesSearch =
					searchQuery === '' ||
					item.project.projectTitle.toLowerCase().includes(searchQuery.toLowerCase()) ||
					`${item.project.user.firstName} ${item.project.user.lastName}`
						.toLowerCase()
						.includes(searchQuery.toLowerCase());
				return matchesType && matchesSearch;
			}),
	);

	function toggleType(type: string) {
		const next = new Set(selectedTypes);
		if (next.has(type)) {
			next.delete(type);
		} else {
			next.add(type);
		}
		selectedTypes = next;
	}

	function formatTypeName(type: string): string {
		return type
			.replace(/_/g, ' ')
			.replace(/\b\w/g, (char) => char.toUpperCase());
	}
</script>

<div class="flex flex-col h-screen overflow-hidden">
	<div class="flex items-center justify-between px-6 py-4 bg-rv-surface border-b border-rv-border shrink-0">
		<div class="font-[Space_Mono,monospace] font-bold text-[18px] text-rv-accent">HORIZONS <span class="text-rv-text font-normal text-[13px] ml-2">Project Review</span></div>
		<div class="flex items-center gap-3">
			<p class="text-[13px] text-rv-dim m-0">{filteredItems.length} of {items.length} projects</p>
			<button
				class="py-1.5 px-3.5 rounded-md border border-rv-border bg-rv-surface2 text-rv-dim text-[12px] font-inherit cursor-pointer transition-all duration-150 hover:border-rv-accent hover:text-rv-text disabled:opacity-40 disabled:cursor-not-allowed"
				onclick={onRefresh}
				disabled={refreshing}
			>
				{refreshing ? 'Refreshing…' : 'Refresh Queue'}
			</button>
		</div>
	</div>

	<div class="flex flex-col gap-3 px-6 py-4 bg-rv-surface border-b border-rv-border shrink-0">
		<input
			type="text"
			class="w-full py-2.5 px-3.5 bg-rv-bg border border-rv-border rounded-lg text-rv-text text-sm font-inherit outline-none transition-all duration-150 placeholder:text-rv-dim focus:border-rv-accent"
			placeholder="Search by project or author name..."
			bind:value={searchQuery}
		/>

		<div class="flex flex-wrap gap-2 items-center">
			{#each PROJECT_TYPES as type}
				<button
					class="py-1.5 px-3.5 rounded-[20px] border border-rv-border bg-rv-surface2 text-rv-dim text-[12px] font-inherit cursor-pointer transition-all duration-150 hover:border-rv-accent hover:text-rv-text {selectedTypes.has(type) ? 'bg-rv-tag-bg border-rv-accent! text-rv-accent!' : ''}"
					onclick={() => toggleType(type)}
				>
					{formatTypeName(type)}
				</button>
			{/each}

			{#if selectedTypes.size > 0}
				<button class="py-1.5 px-3.5 rounded-[20px] border border-rv-border bg-transparent text-rv-dim text-[12px] font-inherit cursor-pointer underline hover:text-rv-text" onclick={() => (selectedTypes = new Set())}>
					Clear filters
				</button>
			{/if}
		</div>
	</div>

	<div class="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] content-start gap-4 p-6 overflow-y-auto flex-1">
		{#each filteredItems as { item, index } (item.submissionId)}
			<button class="flex flex-col gap-1.5 p-5 bg-rv-surface border border-rv-border rounded-[10px] cursor-pointer transition-all duration-150 text-left font-inherit color-inherit hover:border-rv-accent hover:bg-rv-surface2" onclick={() => onSelect(index)}>
				<p class="text-[15px] font-semibold text-rv-text m-0">{item.project.projectTitle}</p>
				<p class="text-[13px] text-rv-dim m-0">
					{item.project.user.firstName} {item.project.user.lastName}
				</p>
				<span class="inline-block mt-1 py-0.75 px-2.5 bg-rv-tag-bg text-rv-accent rounded-xl text-[11px] self-start">{formatTypeName(item.project.projectType)}</span>
			</button>
		{:else}
			<p class="col-span-full text-center text-rv-dim py-10 text-sm">No projects match your filters.</p>
		{/each}
	</div>
</div>
