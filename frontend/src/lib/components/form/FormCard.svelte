<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		title: string;
		subtitle?: string;
		width?: string;
		step?: number;
		totalSteps?: number;
		children: Snippet;
	}

	let {
		title,
		subtitle,
		width = 'w-[727px]',
		step,
		totalSteps = 3,
		children,
	}: Props = $props();
</script>

<div class="absolute left-1/2 top-9/16 -translate-x-[calc(50%+0.5px)] -translate-y-[calc(50%+0.5px)] {width} bg-[#f3e8d8] border-4 border-black rounded-[20px] p-[30px] shadow-[4px_4px_0px_0px_black] flex flex-col gap-4 overflow-clip z-[1]">
	<!-- Header -->
	<div class="flex flex-col gap-2 text-black">
		<div class="flex items-center justify-between">
			<h1 class="font-cook text-[36px] font-semibold m-0 leading-normal">{title}</h1>
			{#if step != null}
				<span class="font-cook text-[20px] font-semibold text-black/40 shrink-0">{step}/{totalSteps}</span>
			{/if}
		</div>
		{#if subtitle}
			<p class="font-bricolage text-[20px] leading-[1.5] tracking-[-0.22px] m-0">{subtitle}</p>
		{/if}
	</div>

	{@render children()}
</div>
