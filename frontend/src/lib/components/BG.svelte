<script lang="ts">
	import type { Snippet } from 'svelte';
	import bgPattern from '$lib/assets/bg pattern.svg';

	interface Props {
		class?: string;
		children?: Snippet;
		disableAnimations?: boolean;
		backgroundImage?: string | null;
		backgroundPattern?: boolean;
		backgroundOpacity?: number;
	}

	let { class: className = '', children, disableAnimations = false, backgroundImage = null, backgroundPattern = true, backgroundOpacity = 0.5 }: Props = $props();

	const showPattern = $derived(!backgroundImage && backgroundPattern);
	const bgUrl = $derived(backgroundImage || bgPattern);
</script>

<div class="bg-content relative size-full overflow-hidden {className}" style="background-color: var(--bg-color, #f3e8d8)">
	{#if backgroundImage}
		<div class="absolute inset-0">
			<div
				class="w-full h-full pointer-events-none bg-cover bg-center"
				style="background-image: url({backgroundImage}); opacity: {backgroundOpacity};"
			></div>
		</div>
	{:else if showPattern}
		<div class="absolute -inset-[50%] flex items-center justify-center -rotate-[19.54deg]">
			<div
				class="w-[300%] h-[300%] pointer-events-none bg-repeat"
				class:pattern-slide={!disableAnimations}
				style="background-image: url({bgPattern}); background-size: 1600px; opacity: {backgroundOpacity};"
			></div>
		</div>
	{/if}
	<div class="relative z-10 size-full flex flex-col">
		{#if children}
			{@render children()}
		{/if}
	</div>
</div>

<style>
	.pattern-slide {
		animation: slide 40s linear infinite;
	}

	@keyframes slide {
		from {
			background-position: 0 0;
		}
		to {
			background-position: -1600px 1600px;
		}
	}
</style>
