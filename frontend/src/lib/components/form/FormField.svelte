<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		label: string;
		id: string;
		value?: string;
		type?: string;
		placeholder?: string;
		prefilled?: boolean;
		maxlength?: number;
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
		maxlength,
		oninput,
		onblur,
		children,
	}: Props = $props();
</script>

<div class="flex flex-col gap-1 w-full">
	<div class="flex justify-between items-baseline">
		<label class="font-bricolage text-base font-semibold text-black leading-normal" for={id}>{label}</label>
		{#if maxlength}
			<span class="font-bricolage text-xs font-medium {value.length > maxlength ? 'text-red-600' : 'text-black/40'}">{value.length}/{maxlength}</span>
		{/if}
	</div>
	{#if children}
		{@render children()}
	{:else}
		<input
			{id}
			class="border-2 border-black rounded-lg px-4 py-2 shadow-[2px_2px_0px_0px_black] font-bricolage text-base font-semibold w-full outline-none appearance-none {prefilled ? 'text-black/50 prefilled-field cursor-default' : 'text-black bg-[#f3e8d8] placeholder:text-black/50'}"
			{type}
			{placeholder}
			{maxlength}
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
