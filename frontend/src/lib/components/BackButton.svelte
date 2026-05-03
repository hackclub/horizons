<script lang="ts">
	import { onMount } from 'svelte';
	import InputPrompt from './InputPrompt.svelte';
	import { m } from '$lib/paraglide/messages.js';

	interface Props {
		onclick: () => void;
		exiting?: boolean;
		flyIn?: boolean;
	}

	let { onclick, exiting = false, flyIn = false }: Props = $props();

	let entered = $state(!flyIn);

	onMount(() => {
		if (!entered) {
			requestAnimationFrame(() => requestAnimationFrame(() => { entered = true; }));
		}
	});
</script>

<div class="fly-left left-4 top-4 sm:left-8 sm:top-13 z-5" class:entered class:exiting>
	<button
		class="flex items-center gap-2.5 p-3 sm:p-5 bg-[#f3e8d8] border-4 border-black rounded-[14px] sm:rounded-[20px] shadow-[4px_4px_0px_0px_black] cursor-pointer overflow-hidden hover:bg-[#ffa936]"
		{onclick}
		aria-label={m.comp_backbtn_back()}
		style="transition: background-color var(--selected-duration) ease, transform var(--juice-duration) var(--juice-easing);"
		onmouseenter={(e) => (e.currentTarget as HTMLElement).style.transform = 'scale(var(--juice-scale))'}
		onmouseleave={(e) => (e.currentTarget as HTMLElement).style.transform = 'scale(1)'}
	>
		<svg class="block sm:hidden" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
			<path d="M15 18l-6-6 6-6"/>
		</svg>
		<span class="hidden sm:contents">
			<InputPrompt type="ESC" />
			<span class="font-cook text-2xl font-semibold text-black">{m.comp_backbtn_label()}</span>
		</span>
	</button>
</div>

<style>
	.fly-left {
		position: fixed;
		transform: translateX(-120vw);
	}
	@media (min-width: 640px) {
		.fly-left {
			position: absolute;
		}
	}
	.fly-left.entered {
		transform: translateX(0);
		transition: transform var(--enter-duration) var(--enter-easing);
	}
	.fly-left.exiting {
		transform: translateX(-120vw);
		transition: transform var(--exit-duration) var(--exit-easing);
	}
</style>
