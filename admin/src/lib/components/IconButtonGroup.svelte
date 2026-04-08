<script lang="ts">
	import type { Snippet } from 'svelte';

	type ButtonItem = {
		icon: Snippet;
		onclick?: () => void;
		title?: string;
		disabled?: boolean;
	};

	type Props = {
		buttons: ButtonItem[];
		class?: string;
	};

	let { buttons, class: className = '' }: Props = $props();
</script>

<div class="flex self-stretch shrink-0 shadow-[var(--color-ds-shadow)] rounded-lg {className}">
	{#each buttons as button, i}
		<button
			class="bg-white border border-ds-border px-2 flex items-center justify-center cursor-pointer hover:bg-ds-bg-secondary disabled:opacity-50 disabled:cursor-not-allowed
				{i === 0 ? 'rounded-l-lg' : '-ml-px'}
				{i === buttons.length - 1 ? 'rounded-r-lg' : ''}"
			onclick={button.onclick}
			title={button.title}
			disabled={button.disabled}
		>
			<span class="flex size-3 items-center justify-center">
				{@render button.icon()}
			</span>
		</button>
	{/each}
</div>
