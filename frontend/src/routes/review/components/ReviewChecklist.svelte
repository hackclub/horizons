<script lang="ts">
	import { api } from '$lib/api';

	interface Props {
		submissionId: number;
		checkedItems: number[];
	}

	let { submissionId, checkedItems = $bindable([]) }: Props = $props();

	const CHECKLIST_ITEMS = [
		'README exists and has setup instructions',
		'Demo link works and is accessible',
		'Code is original (not a tutorial clone)',
		'Hours claimed match Hackatime logs',
		'Commits show meaningful progress over time',
		'Project is publicly shipped / deployed',
		'No red flags in code or dependencies',
	];

	let checkedCount = $derived(checkedItems.length);
	let saveError = $state<string | null>(null);

	function toggleItem(index: number) {
		if (checkedItems.includes(index)) {
			checkedItems = checkedItems.filter((i) => i !== index);
		} else {
			checkedItems = [...checkedItems, index];
		}

		saveError = null;
		api.PUT('/api/reviewer/submissions/{id}/checklist', {
			params: { path: { id: submissionId } },
			body: { checkedItems },
		}).then(({ error }) => {
			if (error) {
				saveError = 'Failed to save';
				setTimeout(() => (saveError = null), 4000);
			}
		}).catch(() => {
			saveError = 'Failed to save';
			setTimeout(() => (saveError = null), 4000);
		});
	}
</script>

<div class="right-bottom">
	<div class="checklist-title">
		Review Checklist
		<span class="checklist-status">
			{#if saveError}
				<span class="checklist-error">{saveError}</span>
			{/if}
			<span class="checklist-progress">{checkedCount}/{CHECKLIST_ITEMS.length}</span>
		</span>
	</div>

	{#each CHECKLIST_ITEMS as item, index}
		<button
			class="checklist-item"
			class:checked={checkedItems.includes(index)}
			onclick={() => toggleItem(index)}
		>
			<input type="checkbox" checked={checkedItems.includes(index)} tabindex={-1} />
			<label>{item}</label>
		</button>
	{/each}
</div>

<style>
	.right-bottom {
		flex: 0 0 auto;
		border-top: 1px solid var(--border);
		padding: 14px 16px;
	}

	.checklist-title {
		font-size: 11px;
		text-transform: uppercase;
		letter-spacing: 0.8px;
		color: var(--text-dim);
		font-weight: 600;
		margin-bottom: 10px;
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.checklist-status {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.checklist-progress {
		font-size: 11px;
		font-weight: 400;
		color: var(--text-dim);
		font-family: 'Space Mono', monospace;
	}

	.checklist-error {
		font-size: 11px;
		color: var(--red);
	}

	.checklist-item {
		display: flex;
		align-items: flex-start;
		gap: 8px;
		padding: 5px 0;
		cursor: pointer;
		user-select: none;
		background: none;
		border: none;
		width: 100%;
		text-align: left;
		font-family: inherit;
	}

	.checklist-item:hover {
		opacity: 0.85;
	}

	.checklist-item input[type='checkbox'] {
		appearance: none;
		-webkit-appearance: none;
		width: 16px;
		height: 16px;
		border: 1.5px solid var(--border);
		border-radius: 3px;
		background: var(--bg);
		cursor: pointer;
		flex-shrink: 0;
		margin-top: 1px;
		position: relative;
		transition: all 0.15s;
		pointer-events: none;
	}

	.checklist-item input[type='checkbox']:checked {
		background: var(--green);
		border-color: var(--green);
	}

	.checklist-item input[type='checkbox']:checked::after {
		content: '✓';
		position: absolute;
		top: -1px;
		left: 2px;
		font-size: 11px;
		color: #fff;
		font-weight: 700;
	}

	.checklist-item label {
		font-size: 13px;
		color: var(--text);
		cursor: pointer;
		line-height: 1.4;
	}

	.checklist-item.checked label {
		color: var(--text-dim);
		text-decoration: line-through;
	}
</style>
