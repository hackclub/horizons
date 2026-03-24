<script lang="ts">
	import type { QueueItem } from '../api';

	interface Props {
		items: QueueItem[];
		onSelect: (index: number) => void;
	}

	let { items, onSelect }: Props = $props();

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

<div class="gallery-root">
	<div class="gallery-header">
		<div class="gallery-logo">HORIZONS <span>Project Review</span></div>
		<p class="gallery-count">{filteredItems.length} of {items.length} projects</p>
	</div>

	<div class="gallery-filters">
		<input
			type="text"
			class="search-input"
			placeholder="Search by project or author name..."
			bind:value={searchQuery}
		/>

		<div class="type-filters">
			{#each PROJECT_TYPES as type}
				<button
					class="type-chip"
					class:active={selectedTypes.has(type)}
					onclick={() => toggleType(type)}
				>
					{formatTypeName(type)}
				</button>
			{/each}

			{#if selectedTypes.size > 0}
				<button class="clear-filters" onclick={() => (selectedTypes = new Set())}>
					Clear filters
				</button>
			{/if}
		</div>
	</div>

	<div class="gallery-grid">
		{#each filteredItems as { item, index } (item.submissionId)}
			<button class="project-card" onclick={() => onSelect(index)}>
				<p class="project-title">{item.project.projectTitle}</p>
				<p class="project-author">
					{item.project.user.firstName} {item.project.user.lastName}
				</p>
				<span class="project-type-badge">{formatTypeName(item.project.projectType)}</span>
			</button>
		{:else}
			<p class="no-results">No projects match your filters.</p>
		{/each}
	</div>
</div>

<style>
	.gallery-root {
		display: flex;
		flex-direction: column;
		height: 100vh;
		overflow: hidden;
	}

	.gallery-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 16px 24px;
		background: var(--surface);
		border-bottom: 1px solid var(--border);
		flex-shrink: 0;
	}

	.gallery-logo {
		font-family: 'Space Mono', monospace;
		font-weight: 700;
		font-size: 18px;
		color: var(--accent);
	}

	.gallery-logo span {
		color: var(--text);
		font-weight: 400;
		font-size: 13px;
		margin-left: 8px;
	}

	.gallery-count {
		font-size: 13px;
		color: var(--text-dim);
		margin: 0;
	}

	.gallery-filters {
		padding: 16px 24px;
		background: var(--surface);
		border-bottom: 1px solid var(--border);
		display: flex;
		flex-direction: column;
		gap: 12px;
		flex-shrink: 0;
	}

	.search-input {
		width: 100%;
		padding: 10px 14px;
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: 8px;
		color: var(--text);
		font-size: 14px;
		font-family: inherit;
		outline: none;
		transition: border-color 0.15s;
	}

	.search-input::placeholder {
		color: var(--text-dim);
	}

	.search-input:focus {
		border-color: var(--accent);
	}

	.type-filters {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		align-items: center;
	}

	.type-chip {
		padding: 6px 14px;
		border-radius: 20px;
		border: 1px solid var(--border);
		background: var(--surface2);
		color: var(--text-dim);
		font-size: 12px;
		font-family: inherit;
		cursor: pointer;
		transition: all 0.15s;
	}

	.type-chip:hover {
		border-color: var(--accent);
		color: var(--text);
	}

	.type-chip.active {
		background: var(--tag-bg);
		border-color: var(--accent);
		color: var(--accent);
	}

	.clear-filters {
		padding: 6px 14px;
		border-radius: 20px;
		border: 1px solid var(--border);
		background: transparent;
		color: var(--text-dim);
		font-size: 12px;
		font-family: inherit;
		cursor: pointer;
		text-decoration: underline;
	}

	.clear-filters:hover {
		color: var(--text);
	}

	.gallery-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
		align-content: start;
		gap: 16px;
		padding: 24px;
		overflow-y: auto;
		flex: 1;
	}

	.project-card {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 20px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 10px;
		cursor: pointer;
		transition: all 0.15s;
		text-align: left;
		font-family: inherit;
		color: inherit;
	}

	.project-card:hover {
		border-color: var(--accent);
		background: var(--surface2);
	}

	.project-title {
		font-size: 15px;
		font-weight: 600;
		color: var(--text);
		margin: 0;
	}

	.project-author {
		font-size: 13px;
		color: var(--text-dim);
		margin: 0;
	}

	.project-type-badge {
		display: inline-block;
		margin-top: 4px;
		padding: 3px 10px;
		background: var(--tag-bg);
		color: var(--accent);
		border-radius: 12px;
		font-size: 11px;
		align-self: flex-start;
	}

	.no-results {
		grid-column: 1 / -1;
		text-align: center;
		color: var(--text-dim);
		padding: 40px;
		font-size: 14px;
	}
</style>
