<script lang="ts">
	import { saveNote } from '../api';

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

	let hasContent = $derived(content.trim().length > 0);

	function toggle() {
		isOpen = !isOpen;
	}

	async function handleSave() {
		saving = true;
		saveError = null;
		try {
			await saveNote(targetType, targetId, content);
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

<div class="notes-header" class:has-note={hasContent}>
	<div class="header-left">
		<span class="section-title">{title}</span>
		{#if hasContent}
			<span class="note-indicator"></span>
		{/if}
	</div>
	<div class="header-right">
		{#if saveError}
			<span class="notes-error">{saveError}</span>
		{:else if savedFlash}
			<span class="notes-saved">Saved</span>
		{/if}
		{#if isOpen}
			<button class="btn-save-notes" onclick={handleSave} disabled={saving}>
				{saving ? 'Saving...' : 'Save'}
			</button>
		{/if}
		<button class="notes-toggle" onclick={toggle}>
			{isOpen ? '−' : '+'}
		</button>
	</div>
</div>

{#if isOpen}
	<div class="notes-body">
		<textarea
			class="notes-area"
			bind:value={content}
			maxlength={1000}
			placeholder="Notes about this {targetType}..."
		></textarea>
	</div>
{/if}

<style>
	.notes-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 10px 16px;
	}

	.header-left {
		display: flex;
		align-items: center;
	}

	.section-title {
		font-size: 11px;
		text-transform: uppercase;
		letter-spacing: 0.8px;
		color: var(--text-dim);
		font-weight: 600;
	}

	.note-indicator {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--accent);
		margin-left: 6px;
	}

	.header-right {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.notes-saved {
		font-size: 11px;
		color: var(--green);
	}

	.notes-error {
		font-size: 11px;
		color: var(--red);
		max-width: 120px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.btn-save-notes {
		background: var(--surface2);
		border: 1px solid var(--border);
		color: var(--text-dim);
		padding: 3px 10px;
		border-radius: 4px;
		font-size: 11px;
		font-family: inherit;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.15s;
	}

	.btn-save-notes:hover {
		color: var(--text);
		border-color: var(--accent);
	}

	.notes-toggle {
		background: transparent;
		border: 1px solid var(--border);
		color: var(--text-dim);
		width: 22px;
		height: 22px;
		border-radius: 4px;
		font-size: 14px;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.15s;
		line-height: 1;
	}

	.notes-toggle:hover {
		color: var(--accent);
		border-color: var(--accent);
	}

	.notes-body {
		padding: 0 16px 10px;
	}

	.notes-area {
		width: 100%;
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: 6px;
		padding: 10px;
		color: var(--text);
		font-family: inherit;
		font-size: 13px;
		line-height: 1.6;
		resize: vertical;
		min-height: 80px;
	}

	.notes-area:focus {
		outline: none;
		border-color: var(--accent);
	}
</style>
