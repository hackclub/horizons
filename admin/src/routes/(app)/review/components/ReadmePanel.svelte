<script lang="ts">
	import { marked } from 'marked';
	import DOMPurify from 'dompurify';
	import { Skeleton } from '$lib/components';

	interface Props {
		markdown: string;
		loading?: boolean;
	}

	let { markdown, loading = false }: Props = $props();

	let sanitizedHtml = $derived(
		markdown ? DOMPurify.sanitize(marked.parse(markdown) as string) : '',
	);
</script>

<div class="readme-content h-full overflow-y-auto px-6 py-5 text-sm leading-[1.7] text-rv-text bg-rv-bg">
	{#if loading}
		<div class="flex flex-col gap-3">
			<Skeleton class="h-7 w-1/2 mb-2" />
			<Skeleton class="h-4 w-full" />
			<Skeleton class="h-4 w-11/12" />
			<Skeleton class="h-4 w-10/12" />
			<Skeleton class="h-4 w-full" />
			<Skeleton class="h-4 w-9/12" />
			<Skeleton class="h-32 w-full mt-3" />
			<Skeleton class="h-4 w-full" />
			<Skeleton class="h-4 w-10/12" />
			<Skeleton class="h-4 w-11/12" />
			<Skeleton class="h-4 w-2/3" />
		</div>
	{:else if sanitizedHtml}
		{@html sanitizedHtml}
	{:else}
		<p class="text-rv-dim italic">No README content available.</p>
	{/if}
</div>

<style>
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
