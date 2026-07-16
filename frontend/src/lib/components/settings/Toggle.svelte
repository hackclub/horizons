<script lang="ts">
	interface Props {
		checked?: boolean;
		label: string;
		disabled?: boolean;
		onchange?: (value: boolean) => void;
	}

	let { checked = $bindable(false), label, disabled = false, onchange }: Props = $props();

	function toggle() {
		if (disabled) return;
		checked = !checked;
		onchange?.(checked);
	}
</script>

<button
	type="button"
	role="switch"
	aria-checked={checked}
	{disabled}
	onclick={toggle}
	class="group flex items-center gap-2 outline-none {disabled
		? 'cursor-not-allowed opacity-50'
		: 'cursor-pointer'}"
>
	<span
		class="relative flex h-[18px] w-[32px] shrink-0 items-center rounded-full border-2 border-black transition-colors duration-150 {checked
			? 'bg-[#88de3c]'
			: 'bg-[#e7dac6]'}"
	>
		<span
			class="absolute size-[10px] rounded-full bg-black transition-all duration-150 {checked
				? 'left-[15px]'
				: 'left-[1px]'}"
		></span>
	</span>
	<span class="font-bricolage text-[16px] text-black">{label}</span>
</button>
