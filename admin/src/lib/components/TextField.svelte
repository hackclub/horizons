<script lang="ts">
	import type { HTMLInputAttributes, HTMLTextareaAttributes } from 'svelte/elements';

	type Props = Omit<HTMLInputAttributes & HTMLTextareaAttributes, 'class'> & {
		value?: string | number;
		multiline?: boolean;
		class?: string;
	};

	let { value = $bindable(''), multiline = false, class: className = '', ...rest }: Props = $props();

	let focused = $state(false);
</script>

{#if multiline}
	<textarea
		bind:value
		onfocus={() => (focused = true)}
		onblur={() => (focused = false)}
		class="w-full rounded-lg border border-ds-border py-2 px-3 font-dm text-sm text-ds-text outline-none placeholder:text-ds-text-placeholder focus:border-ds-border-strong {focused || value
			? 'bg-ds-surface'
			: 'bg-ds-surface-deselected'} {className}"
		{...rest}
	></textarea>
{:else}
	<input
		bind:value
		onfocus={() => (focused = true)}
		onblur={() => (focused = false)}
		class="w-full rounded-lg border border-ds-border py-2 px-3 font-dm text-sm text-ds-text outline-none placeholder:text-ds-text-placeholder focus:border-ds-border-strong {focused || value
			? 'bg-ds-surface'
			: 'bg-ds-surface-deselected'} {className}"
		{...rest}
	/>
{/if}
