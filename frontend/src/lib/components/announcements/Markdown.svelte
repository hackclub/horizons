<script lang="ts">
	import { browser } from '$app/environment';
	import { marked } from 'marked';
	import DOMPurify from 'dompurify';

	let { source = '' }: { source?: string } = $props();

	// Sanitize only in the browser (DOMPurify needs a DOM). Announcement bodies
	// are fetched client-side anyway, so nothing renders during SSR.
	const html = $derived(
		browser && source
			? DOMPurify.sanitize(marked.parse(source, { breaks: true, gfm: true }) as string)
			: '',
	);
</script>

<div class="announcement-md font-bricolage text-[16px] leading-relaxed text-[#363636]">
	<!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitized above -->
	{@html html}
</div>

<style>
	.announcement-md :global(h1),
	.announcement-md :global(h2),
	.announcement-md :global(h3),
	.announcement-md :global(h4) {
		font-family: var(--font-cook);
		color: #000;
		margin: 0.75em 0 0.35em;
		line-height: 1.1;
	}
	.announcement-md :global(h1) {
		font-size: 24px;
	}
	.announcement-md :global(h2) {
		font-size: 20px;
	}
	.announcement-md :global(h3),
	.announcement-md :global(h4) {
		font-size: 18px;
	}
	.announcement-md :global(p) {
		margin: 0 0 0.75em;
	}
	.announcement-md :global(ul),
	.announcement-md :global(ol) {
		margin: 0 0 0.75em;
		padding-left: 1.25em;
	}
	.announcement-md :global(ul) {
		list-style: disc;
	}
	.announcement-md :global(ol) {
		list-style: decimal;
	}
	.announcement-md :global(li) {
		margin: 0.15em 0;
	}
	.announcement-md :global(a) {
		color: #000;
		text-decoration: underline;
	}
	.announcement-md :global(a:hover) {
		opacity: 0.7;
	}
	.announcement-md :global(strong) {
		font-weight: 700;
	}
	.announcement-md :global(em) {
		font-style: italic;
	}
	.announcement-md :global(code) {
		font-family: ui-monospace, monospace;
		background: rgba(0, 0, 0, 0.06);
		padding: 0.1em 0.35em;
		border-radius: 4px;
		font-size: 0.9em;
	}
	.announcement-md :global(pre) {
		background: rgba(0, 0, 0, 0.06);
		padding: 12px;
		border-radius: 8px;
		overflow-x: auto;
		margin: 0 0 0.75em;
	}
	.announcement-md :global(pre code) {
		background: none;
		padding: 0;
	}
	.announcement-md :global(blockquote) {
		border-left: 3px solid rgba(0, 0, 0, 0.2);
		padding-left: 0.75em;
		margin: 0 0 0.75em;
		color: rgba(0, 0, 0, 0.6);
	}
	.announcement-md :global(img) {
		max-width: 100%;
		border-radius: 8px;
	}
	.announcement-md :global(hr) {
		border: none;
		border-top: 2px solid rgba(0, 0, 0, 0.1);
		margin: 1em 0;
	}
	.announcement-md :global(> :first-child) {
		margin-top: 0;
	}
	.announcement-md :global(> :last-child) {
		margin-bottom: 0;
	}
</style>
