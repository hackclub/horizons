<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLSelectAttributes } from 'svelte/elements';

	type Props = Omit<HTMLSelectAttributes, 'class'> & {
		value?: string | number | null;
		children: Snippet;
		class?: string;
	};

	let { value = $bindable(), children, class: className = '', ...rest }: Props = $props();
</script>

<select
	bind:value
	class="rounded-lg border border-ds-border bg-ds-surface-deselected px-3 py-2 font-dm text-sm text-ds-text outline-none focus:border-ds-border-strong {className}"
	{...rest}
>
	{@render children()}
</select>
