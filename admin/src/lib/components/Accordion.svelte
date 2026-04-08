<script lang="ts">
	import type { Snippet } from 'svelte';
	import { ChevronDown } from 'lucide-svelte';

	type Props = {
		title: string;
		children: Snippet;
		trailing?: Snippet;
		contentClass?: string;
		class?: string;
	};

	let { title, children, trailing, contentClass = '', class: className = '' }: Props = $props();
</script>

<details class="accordion bg-white border border-ds-border rounded-lg overflow-hidden {className}">
	<summary class="p-2 flex items-center gap-1 text-xs font-medium cursor-pointer hover:bg-black/5 list-none [&::-webkit-details-marker]:hidden">
		<ChevronDown size={12} class="text-ds-text-placeholder transition-transform accordion-chevron" />
		{title}
		{#if trailing}
			<span class="ml-auto">
				{@render trailing()}
			</span>
		{/if}
	</summary>
	<div class="border-t border-ds-border p-3 text-xs {contentClass}">
		{@render children()}
	</div>
</details>

<style>
	.accordion :global(.accordion-chevron) { transition: transform 0.2s ease; }
	.accordion[open] :global(.accordion-chevron) { transform: rotate(180deg); }
	.accordion[open] > :global(:not(summary)) {
		animation: accordion-open 0.2s ease;
	}
	@keyframes accordion-open {
		from { opacity: 0; transform: translateY(-4px); }
		to { opacity: 1; transform: translateY(0); }
	}
</style>
