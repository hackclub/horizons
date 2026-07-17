<script lang="ts">
	import type { Snippet } from 'svelte';
	import bgPattern from '$lib/assets/bg pattern.svg';
	import { onlyBorder } from '$lib/store/settingsCache';

	interface Props {
		class?: string;
		children?: Snippet;
		disableAnimations?: boolean;
		backgroundImage?: string | null;
		backgroundPattern?: boolean;
		backgroundOpacity?: number;
		patternBlend?: string;
	}

	let { class: className = '', children, disableAnimations = false, backgroundImage = null, backgroundPattern = true, backgroundOpacity = 0.5, patternBlend = undefined }: Props = $props();

	const showPattern = $derived(!!backgroundPattern);
</script>

<div class="bg-content relative size-full overflow-hidden {className}" style="isolation: isolate;">
	<!-- Decorative fill (beige + optional image + pattern) on its own layer so it
	     can be clipped independently of the content. "I only want border" clips it
	     inward to a point, so the brown border texture behind reveals from the
	     edges in — the frame appears to close in. -->
	<div
		class="decor absolute inset-0 overflow-hidden"
		style="background-color: var(--bg-color, #f3e8d8); clip-path: inset({$onlyBorder ? '50%' : '0%'}); transition: clip-path 0.55s cubic-bezier(0.76, 0, 0.24, 1);"
	>
		{#if backgroundImage}
			<div class="absolute inset-0">
				<div
					class="w-full h-full pointer-events-none bg-cover bg-center"
					style="background-image: url({backgroundImage}); opacity: {backgroundOpacity};"
				></div>
			</div>
		{/if}
		{#if showPattern}
			<div class="absolute -inset-[50%] -rotate-[19.54deg]" style={patternBlend ? `mix-blend-mode: ${patternBlend};` : ''}>
				<!-- Oversized by one tile period (1600px) on every side so the
				     transform-based scroll below never exposes an edge. -->
				<div
					class="absolute -inset-[1600px] pointer-events-none bg-repeat"
					class:pattern-slide={!disableAnimations}
					style="background-image: url({bgPattern}); background-size: 1600px; opacity: {backgroundOpacity};"
				></div>
			</div>
		{/if}
	</div>
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

	/* Reduce Animations: keep the texture drifting, but ~3× slower. */
	:global(html.reduce-anim) .pattern-slide {
		animation-duration: 120s;
	}

	/* Scroll via transform, not background-position: transforms interpolate on
	   the compositor (GPU), while background-position repaints this huge layer
	   on the main thread every frame. One full 1600px tile period keeps the
	   loop seamless. */
	@keyframes slide {
		from {
			transform: translate(0, 0);
		}
		to {
			transform: translate(-1600px, 1600px);
		}
	}
</style>
