<script lang="ts">
	import type { HTMLInputAttributes } from 'svelte/elements';

	type Props = Omit<HTMLInputAttributes, 'class' | 'type'> & {
		checked?: boolean;
		class?: string;
	};

	let { checked = $bindable(false), class: className = '', ...rest }: Props = $props();
</script>

<input
	type="checkbox"
	bind:checked
	class="h-4 w-4 rounded border-ds-border bg-ds-surface-deselected accent-ds-accent cursor-pointer {className}"
	{...rest}
/>
