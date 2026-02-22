<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		label: string;
		id: string;
		value?: string;
		type?: string;
		placeholder?: string;
		prefilled?: boolean;
		oninput?: (e: Event) => void;
		onblur?: (e: Event) => void;
		children?: Snippet;
	}

	let {
		label,
		id,
		value = $bindable(''),
		type = 'text',
		placeholder = '',
		prefilled = false,
		oninput,
		onblur,
		children,
	}: Props = $props();
</script>

<div class="flex flex-col gap-1 w-full">
	<label class="font-bricolage text-base font-semibold text-black leading-normal" for={id}>{label}</label>
	{#if children}
		{@render children()}
	{:else}
		<input
			{id}
			class="border-2 border-black rounded-lg px-4 py-2 shadow-[2px_2px_0px_0px_black] font-bricolage text-base font-semibold w-full outline-none appearance-none {prefilled ? 'text-black/50 prefilled-field cursor-default' : 'text-black bg-[#f3e8d8] placeholder:text-black/50'}"
			{type}
			{placeholder}
			readonly={prefilled}
			bind:value
			{oninput}
			{onblur}
		/>
	{/if}
</div>

<style>
	.prefilled-field {
		background: linear-gradient(90deg, rgba(204, 204, 204, 0.5), rgba(204, 204, 204, 0.5)),
			linear-gradient(90deg, #f3e8d8, #f3e8d8);
	}
</style>
