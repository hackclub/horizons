<script lang="ts">
	import { api } from '$lib/api';

	interface Props {
		submissionId: number;
		checkedItems: number[];
	}

	let { submissionId, checkedItems = $bindable([]) }: Props = $props();

	const CHECKLIST_ITEMS = [
		'README exists with setup/run instructions',
		'Playable URL works without building from source',
		'Code repo is public and accessible',
		'Code is original (not AI slop, tutorial clone, or plagiarism)',
		'Commits show incremental progress matching claimed hours',
		'Hours are proportional to project scope and complexity',
		'Screenshot accurately represents the project',
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

<div class="shrink-0 grow-0 basis-auto border-t border-rv-border px-4 py-3.5">
	<div class="flex items-center justify-between text-[11px] uppercase tracking-[0.8px] text-rv-dim font-semibold mb-2.5">
		Review Checklist
		<span class="flex items-center gap-2">
			{#if saveError}
				<span class="text-[11px] text-rv-red">{saveError}</span>
			{/if}
			<span class="text-[11px] font-normal text-rv-dim font-mono">{checkedCount}/{CHECKLIST_ITEMS.length}</span>
		</span>
	</div>

	{#each CHECKLIST_ITEMS as item, index}
		<button
			class="flex items-start gap-2 py-1.25 cursor-pointer select-none bg-transparent border-none w-full text-left font-[inherit] hover:opacity-85"
			onclick={() => toggleItem(index)}
		>
			<input
				type="checkbox"
				checked={checkedItems.includes(index)}
				tabindex={-1}
				class="appearance-none w-4 h-4 border-[1.5px] border-rv-border rounded-[3px] bg-rv-bg cursor-pointer shrink-0 mt-px relative transition-all duration-150 pointer-events-none checked:bg-rv-green checked:border-rv-green checked:after:content-['✓'] checked:after:absolute checked:after:-top-px checked:after:left-0.5 checked:after:text-[11px] checked:after:text-white checked:after:font-bold"
			/>
			<label class="text-[13px] cursor-pointer leading-[1.4] {checkedItems.includes(index) ? 'text-rv-dim line-through' : 'text-rv-text'}">{item}</label>
		</button>
	{/each}
</div>
