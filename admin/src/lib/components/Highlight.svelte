<script lang="ts">
	import { highlightSegments } from '$lib/search';

	let {
		text,
		query,
		markClass = 'rounded-xs bg-yellow-400/40 text-inherit',
	}: { text: string; query: string; markClass?: string } = $props();
</script>

{#each highlightSegments(text, query) as segment}{#if segment.hit}<mark class={markClass}>{segment.text}</mark>{:else}{segment.text}{/if}{/each}
