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

<div
	class="readme-content relative shrink-0 overflow-hidden bg-rv-bg border-t border-rv-border transition-[height] duration-200 ease-in-out"
	class:h-[280px]={isOpen}
	class:h-7={!isOpen}
>
	<button
		class="absolute top-0 left-0 right-0 h-7 bg-rv-surface border-none border-b border-rv-border flex items-center justify-center gap-2 cursor-pointer select-none z-1 transition-all duration-150 hover:bg-rv-surface2"
		onclick={toggle}
	>
		<span class="text-[10px] font-semibold text-rv-dim uppercase tracking-[0.5px] transition-transform duration-200">{isOpen ? '▼' : '▲'}</span>
		<span class="text-[11px] font-semibold text-rv-dim uppercase tracking-[0.5px]">README</span>
	</button>
	<div class="absolute top-7 left-0 right-0 bottom-0 overflow-y-auto px-6 py-4 text-sm leading-[1.7] text-rv-text">
		{#if sanitizedHtml}
			{@html sanitizedHtml}
		{:else}
			<p class="text-rv-dim italic">No README content available.</p>
		{/if}
	</div>
</div>

<style>
	/* Global styles for rendered markdown content — can't be done with Tailwind utilities */
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
		background: var(--rv-surface2);
		padding: 2px 6px;
		border-radius: 3px;
		font-family: 'Space Mono', monospace;
		font-size: 12px;
	}

	.readme-content :global(pre) {
		background: var(--rv-surface);
		border: 1px solid var(--rv-border);
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
		color: var(--rv-blue);
	}

	.readme-content :global(img) {
		max-width: 100%;
	}
</style>
