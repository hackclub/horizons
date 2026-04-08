<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = {
		active?: boolean;
		onclick?: () => void;
		children: Snippet;
		class?: string;
	};

	let { active = false, onclick, children, class: className = '' }: Props = $props();
</script>

<button
	class="py-1.5 px-3.5 rounded-full border text-xs font-dm cursor-pointer
		{active
		? 'bg-ds-tag-active border-ds-tag-active-border text-black'
		: 'bg-white border-ds-border text-ds-text-placeholder hover:border-ds-border-strong'}
		{className}"
	{onclick}
>
	{@render children()}
</button>
