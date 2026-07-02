<script lang="ts">
	// A red unread indicator that pulses (ping ring behind a solid dot).
	let { size = 8, class: className = '' }: { size?: number; class?: string } = $props();
</script>

<span class="relative inline-flex shrink-0 {className}" style="width: {size}px; height: {size}px;">
	<span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75"></span>
	<span class="relative inline-flex h-full w-full rounded-full bg-red-500"></span>
</span>
