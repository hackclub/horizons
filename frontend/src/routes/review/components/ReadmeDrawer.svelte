<script lang="ts">
	import { marked } from 'marked';
	import DOMPurify from 'dompurify';

	interface Props {
		markdown: string;
	}

	let { markdown }: Props = $props();

	// Persist open/closed state across session via sessionStorage
	let isOpen = $state(false);

	let sanitizedHtml = $derived(
		markdown ? DOMPurify.sanitize(marked.parse(markdown) as string) : '',
	);

	$effect(() => {
		const stored = sessionStorage.getItem('reviewer-readme-open');
		if (stored === 'true') isOpen = true;
	});

	function toggle() {
		isOpen = !isOpen;
		sessionStorage.setItem('reviewer-readme-open', String(isOpen));
	}
</script>

<div class="readme-drawer" class:open={isOpen}>
	<button class="readme-handle" onclick={toggle}>
		<span class="chevron">{isOpen ? '▼' : '▲'}</span>
		<span>README</span>
	</button>
	<div class="readme-content">
		{#if sanitizedHtml}
			{@html sanitizedHtml}
		{:else}
			<p class="no-readme">No README content available.</p>
		{/if}
	</div>
</div>

<style>
	.readme-drawer {
		position: relative;
		flex-shrink: 0;
		height: 28px;
		overflow: hidden;
		background: var(--bg);
		border-top: 1px solid var(--border);
		transition: height 0.2s ease;
	}

	.readme-drawer.open {
		height: 280px;
	}

	.readme-handle {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		height: 28px;
		background: var(--surface);
		border: none;
		border-bottom: 1px solid var(--border);
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		cursor: pointer;
		user-select: none;
		z-index: 1;
		transition: background 0.15s;
	}

	.readme-handle:hover {
		background: var(--surface2);
	}

	.readme-handle span {
		font-size: 11px;
		font-weight: 600;
		color: var(--text-dim);
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.chevron {
		font-size: 10px;
		transition: transform 0.2s;
	}

	.readme-content {
		position: absolute;
		top: 28px;
		left: 0;
		right: 0;
		bottom: 0;
		overflow-y: auto;
		padding: 16px 24px;
		font-size: 14px;
		line-height: 1.7;
		color: var(--text);
	}

	.readme-content :global(h1) {
		font-size: 22px;
		font-weight: 700;
		margin-bottom: 8px;
	}

	.readme-content :global(h2) {
		font-size: 16px;
		font-weight: 700;
		margin-top: 16px;
		margin-bottom: 6px;
	}

	.readme-content :global(p) {
		margin-bottom: 10px;
	}

	.readme-content :global(code) {
		background: var(--surface2);
		padding: 2px 6px;
		border-radius: 3px;
		font-family: 'Space Mono', monospace;
		font-size: 12px;
	}

	.readme-content :global(pre) {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 6px;
		padding: 12px;
		margin-bottom: 12px;
		overflow-x: auto;
	}

	.readme-content :global(pre code) {
		background: none;
		padding: 0;
	}

	.readme-content :global(ul) {
		padding-left: 20px;
		margin-bottom: 10px;
	}

	.readme-content :global(li) {
		margin-bottom: 4px;
	}

	.readme-content :global(a) {
		color: var(--blue);
	}

	.readme-content :global(img) {
		max-width: 100%;
	}

	.no-readme {
		color: var(--text-dim);
		font-style: italic;
	}
</style>
