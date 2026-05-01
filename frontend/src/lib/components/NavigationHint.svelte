<script lang="ts">
	import InputPrompt from './InputPrompt.svelte';
	import type { InputPromptType } from '$lib/input';

	interface Props {
		segments: Array<{ type: 'input'; value: InputPromptType } | { type: 'text'; value: string }>;
		position?: 'bottom-center' | 'bottom-right';
	}

	let { segments, position = 'bottom-center' }: Props = $props();

	const positionClasses = {
		'bottom-center': 'bottom-8 left-1/2 -translate-x-1/2',
		'bottom-right': 'bottom-[35px] right-6'
	};
</script>

<div class="absolute {positionClasses[position]} z-20 hidden sm:block">
	<div class="flex items-center gap-5 px-7 py-5 bg-[#f3e8d8] border-4 border-black rounded-[20px] shadow-[4px_4px_0px_0px_black] overflow-hidden">
		{#each segments as segment, i (i)}
			{#if segment.type === 'text'}
			<p class="font-cook text-[24px] font-semibold text-black m-0 shrink-0 leading-none">{segment.value}</p>
			{:else}
				<InputPrompt type={segment.value} />
			{/if}
		{/each}
	</div>
</div>
