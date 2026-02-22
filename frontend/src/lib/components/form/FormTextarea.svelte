<script lang="ts">
	interface Props {
		label: string;
		id: string;
		value?: string;
		placeholder?: string;
		rows?: number;
		oninput?: (e: Event) => void;
		onblur?: (e: Event) => void;
	}

	let {
		label,
		id,
		value = $bindable(''),
		placeholder = '',
		rows = 4,
		oninput,
		onblur,
	}: Props = $props();
</script>

<div class="flex flex-col gap-1 w-full">
	<label class="font-bricolage text-base font-semibold text-black leading-normal" for={id}>{label}</label>
	<textarea
		{id}
		class="bg-[#f3e8d8] border-2 border-black rounded-lg px-4 py-2 shadow-[2px_2px_0px_0px_black] font-bricolage text-base font-semibold text-black w-full outline-none resize-none placeholder:text-black/50"
		{placeholder}
		{rows}
		bind:value
		{oninput}
		{onblur}
	></textarea>
</div>
