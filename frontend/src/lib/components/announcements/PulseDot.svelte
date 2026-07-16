<script lang="ts">
	// A red unread indicator that pulses (ping ring behind a solid dot).
	// Position comes from the passed `class` (e.g. absolute -top-1 -right-1); the
	// inner span keeps `relative` so the ping ring anchors to the dot.
	let {
		size = 8,
		class: className = '',
		animate = true,
	}: { size?: number; class?: string; animate?: boolean } = $props();
</script>

<span class="inline-flex shrink-0 {className}" style="width: {size}px; height: {size}px;">
	<span class="relative inline-flex h-full w-full">
		{#if animate}
			<span class="absolute inline-flex h-full w-full animate-slow-ping rounded-full bg-red-500 opacity-75"></span>
		{/if}
		<span class="relative inline-flex h-full w-full rounded-full bg-red-500"></span>
	</span>
</span>
