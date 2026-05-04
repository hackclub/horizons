<script lang="ts">
	import { api } from '$lib/api';

	interface Props {
		title: string;
		targetType: 'project' | 'user';
		targetId: number;
		content: string;
	}

	let { title, targetType, targetId, content = $bindable('') }: Props = $props();

	let isOpen = $state(false);
	let saving = $state(false);
	let savedFlash = $state(false);
	let saveError = $state<string | null>(null);
	let hasAutoOpened = $state(false);

	let hasContent = $derived(content.trim().length > 0);

	$effect(() => {
		if (hasContent && !hasAutoOpened) {
			isOpen = true;
			hasAutoOpened = true;
		}
	});

	function toggle() {
		isOpen = !isOpen;
	}

	async function handleSave() {
		saving = true;
		saveError = null;
		try {
			const path = targetType === 'project'
				? '/api/reviewer/projects/{id}/notes' as const
				: '/api/reviewer/users/{id}/notes' as const;

			const { error } = await api.PUT(path, {
				params: { path: { id: targetId } },
				body: { content },
			});
			if (error) throw new Error(`Failed to save ${targetType} note`);
			savedFlash = true;
			setTimeout(() => (savedFlash = false), 2000);
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Save failed';
			saveError = message;
			setTimeout(() => (saveError = null), 5000);
			console.error(`Failed to save ${targetType} note:`, error);
		} finally {
			saving = false;
		}
	}
</script>

<div class={hasContent ? 'border-l-2 border-l-rv-accent bg-rv-accent/6' : ''}>
	<div class="flex items-center justify-between px-4 py-2.5">
		<div class="flex items-center gap-2">
			<span class="text-[11px] uppercase tracking-[0.8px] {hasContent ? 'text-rv-accent' : 'text-rv-dim'} font-semibold">{title}</span>
			{#if hasContent}
				<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide bg-rv-accent/15 text-rv-accent border border-rv-accent/40">
					Has note
				</span>
			{/if}
		</div>
		<div class="flex items-center gap-1.5">
			{#if saveError}
				<span class="text-[11px] text-rv-red max-w-[120px] overflow-hidden text-ellipsis whitespace-nowrap">{saveError}</span>
			{:else if savedFlash}
				<span class="text-[11px] text-rv-green">Saved</span>
			{/if}
			{#if isOpen}
				<button
					class="bg-rv-surface2 border border-rv-border text-rv-dim px-2.5 py-[3px] rounded text-[11px] font-inherit font-medium cursor-pointer transition-all duration-150 hover:text-rv-text hover:border-rv-accent"
					onclick={handleSave}
					disabled={saving}
				>
					{saving ? 'Saving...' : 'Save'}
				</button>
			{/if}
			<button
				class="bg-transparent border border-rv-border text-rv-dim w-[22px] h-[22px] rounded text-sm cursor-pointer flex items-center justify-center transition-all duration-150 leading-none hover:text-rv-accent hover:border-rv-accent"
				onclick={toggle}
			>
				{isOpen ? '−' : '+'}
			</button>
		</div>
	</div>

	{#if isOpen}
		<div class="px-4 pb-2.5">
			<textarea
				class="w-full bg-rv-bg border border-rv-border rounded-[6px] p-2.5 text-rv-text font-inherit text-[13px] leading-[1.6] resize-y min-h-[80px] focus:outline-none focus:border-rv-accent"
				bind:value={content}
				maxlength={1000}
				placeholder="Notes about this {targetType}..."
			></textarea>
		</div>
	{/if}
</div>
