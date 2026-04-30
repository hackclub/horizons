<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';

	type Props = HTMLButtonAttributes & {
		variant?: 'default' | 'approve' | 'reject' | 'ghost';
		children: Snippet;
	};

	let { variant = 'default', children, class: className = '', ...rest }: Props = $props();

	const base = 'inline-flex items-center justify-center gap-1 rounded-lg text-xs font-medium cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed';

	const variants = {
		default:
			'bg-ds-surface border border-ds-border px-2 py-2 text-ds-text shadow-[var(--color-ds-shadow)] hover:bg-ds-bg-secondary',
		approve:
			'border-none px-4 py-2 font-bold bg-ds-green text-white hover:opacity-90',
		reject:
			'border-none px-4 py-2 font-bold bg-ds-red text-white hover:opacity-90',
		ghost:
			'bg-transparent border border-ds-border px-3.5 py-1.5 text-ds-text-placeholder hover:border-ds-border-strong'
	};
</script>

<button class="{base} {variants[variant]} {className}" {...rest}>
	{@render children()}
</button>
