<script lang="ts">
	import type { HTMLInputAttributes } from 'svelte/elements';

	type Props = Omit<HTMLInputAttributes, 'class'> & {
		value?: string;
		class?: string;
	};

	let { value = $bindable(''), class: className = '', ...rest }: Props = $props();

	let focused = $state(false);
</script>

<input
	bind:value
	onfocus={() => (focused = true)}
	onblur={() => (focused = false)}
	class="w-full rounded-lg border border-ds-border py-2 px-3 font-dm text-sm text-black outline-none placeholder:text-ds-text-placeholder focus:border-ds-border-strong {focused || value
		? 'bg-white'
		: 'bg-ds-surface-inactive'} {className}"
	{...rest}
/>
