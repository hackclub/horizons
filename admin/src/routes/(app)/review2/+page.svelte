<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { api, type components } from '$lib/api';
	import { Button, FilterTag, TextField } from '$lib/components';

	type QueueItem = components['schemas']['QueueItemResponse'];

	// ── Queue state ──
	let queue = $state<QueueItem[]>([]);
	let queueLoading = $state(true);
	let queueError = $state<string | null>(null);

	// ── Gallery filter ──
	let searchQuery = $state('');

	const PROJECT_TYPES = [
		'windows_playable', 'mac_playable', 'linux_playable',
		'web_playable', 'cross_platform_playable', 'hardware',
	];
	let selectedTypes = $state<Set<string>>(new Set());

	let filteredItems = $derived(
		queue
			.map((item, index) => ({ item, index }))
			.filter(({ item }) => {
				const matchesType = selectedTypes.size === 0 || selectedTypes.has(item.project.projectType);
				const matchesSearch = searchQuery === '' ||
					item.project.projectTitle.toLowerCase().includes(searchQuery.toLowerCase()) ||
					`${item.project.user.firstName} ${item.project.user.lastName}`.toLowerCase().includes(searchQuery.toLowerCase());
				return matchesType && matchesSearch;
			}),
	);

	// ── Lifecycle ──
	onMount(() => {
		loadQueue();
	});

	// ── Data loading ──
	async function loadQueue() {
		queueLoading = true;
		queueError = null;
		try {
			const { data, error } = await api.GET('/api/reviewer/queue');
			if (error) throw new Error('Failed to fetch review queue');
			queue = data ?? [];
		} catch (error) {
			queueError = error instanceof Error ? error.message : 'Failed to load review queue';
		} finally {
			queueLoading = false;
		}
	}

	// ── Navigation ──
	function selectFromGallery(index: number) {
		if (index < 0 || index >= queue.length) return;
		goto(`${base}/review2/${queue[index].projectId}`);
	}

	function formatTypeName(type: string): string {
		return type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
	}
</script>

<svelte:head>
	<title>Horizons — Project Review</title>
</svelte:head>

{#if queueLoading}
	<div class="flex items-center justify-center h-full font-dm text-ds-text-placeholder">
		<p>Loading review queue...</p>
	</div>
{:else if queueError}
	<div class="flex flex-col items-center justify-center h-full gap-2 font-dm text-[#e90000]">
		<p>Failed to load review queue</p>
		<p class="text-xs text-ds-text-placeholder max-w-[400px] text-center">{queueError}</p>
		<Button class="mt-3 px-5 py-2 text-sm" onclick={() => loadQueue()}>Retry</Button>
	</div>
{:else if queue.length === 0}
	<div class="flex items-center justify-center h-full font-dm text-ds-text-placeholder">
		<p>No pending submissions to review.</p>
	</div>
{:else}
	<div class="flex flex-col h-full font-dm">
		<div class="flex items-center justify-between px-6 py-3 bg-ds-bg border-b border-ds-border-divider shrink-0">
			<h1 class="text-lg font-semibold text-ds-text m-0">Project Review</h1>
			<p class="text-xs text-ds-text-tertiary m-0">{filteredItems.length} of {queue.length} projects</p>
		</div>

		<div class="flex flex-col gap-3 px-6 py-4 bg-ds-bg-secondary border-b border-ds-border-divider shrink-0">
			<TextField
				type="text"
				placeholder="Search by project or author name..."
				bind:value={searchQuery}
			/>
			<div class="flex flex-wrap gap-2 items-center">
				{#each PROJECT_TYPES as type}
					<FilterTag
						active={selectedTypes.has(type)}
						onclick={() => {
							const next = new Set(selectedTypes);
							if (next.has(type)) next.delete(type); else next.add(type);
							selectedTypes = next;
						}}
					>
						{formatTypeName(type)}
					</FilterTag>
				{/each}
				{#if selectedTypes.size > 0}
					<FilterTag class="underline" onclick={() => (selectedTypes = new Set())}>Clear</FilterTag>
				{/if}
			</div>
		</div>

		<div class="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] content-start gap-4 p-6 overflow-y-auto flex-1">
			{#each filteredItems as { item, index } (item.submissionId)}
				<button class="flex flex-col gap-1.5 p-5 bg-ds-surface border border-ds-border rounded-lg cursor-pointer transition-all duration-150 text-left font-dm shadow-sm hover:border-ds-border-strong hover:shadow-md" onclick={() => selectFromGallery(index)}>
					<p class="text-[15px] font-medium text-ds-text m-0">{item.project.projectTitle}</p>
					<p class="text-[13px] text-ds-text-placeholder m-0">{item.project.user.firstName} {item.project.user.lastName}</p>
					<span class="inline-block mt-1 py-0.5 px-2.5 bg-ds-tag-active text-ds-text rounded-full text-xs font-medium self-start">{formatTypeName(item.project.projectType)}</span>
				</button>
			{:else}
				<p class="col-span-full text-center text-ds-text-placeholder py-10 text-sm">No projects match your filters.</p>
			{/each}
		</div>
	</div>
{/if}
