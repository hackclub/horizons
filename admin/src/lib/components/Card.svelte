<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = {
		children: Snippet;
		class?: string;
	};

	let { children, class: className = '' }: Props = $props();
</script>

<div class="bg-ds-surface border border-ds-border rounded-lg shadow-sm {className}">
	{@render children()}
</div>
