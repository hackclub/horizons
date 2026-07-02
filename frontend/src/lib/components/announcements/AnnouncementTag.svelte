<script lang="ts">
	import { fly } from 'svelte/transition';
	import { backOut } from 'svelte/easing';
	import PulseDot from './PulseDot.svelte';
	import type { UserAnnouncement } from '$lib/store/announcementsCache';

	let {
		announcement,
		onReadMore,
		onDismiss,
	}: {
		announcement: UserAnnouncement;
		onReadMore: () => void;
		onDismiss: () => void;
	} = $props();
</script>

<div
	class="pointer-events-auto absolute right-6 top-11 z-40 hidden max-w-[min(384px,calc(100vw-32px))] sm:block"
	transition:fly={{ x: 48, duration: 320, easing: backOut }}
>
	<div class="relative flex items-center gap-2.5 rounded-lg bg-[#1a140c] p-2">
		<p class="m-0 text-right font-bricolage text-[16px] font-semibold text-white">
			{announcement.previewText}
			<button type="button" class="cursor-pointer underline outline-none" onclick={onReadMore}>
				Read more.
			</button>
		</p>
		<button
			type="button"
			class="flex cursor-pointer items-center text-white outline-none"
			aria-label="Dismiss announcement"
			onclick={onDismiss}
		>
			<svg
				class="size-3"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2.5"
				stroke-linecap="round"
				stroke-linejoin="round"
				aria-hidden="true"
			>
				<path d="M18 6 6 18" />
				<path d="m6 6 12 12" />
			</svg>
		</button>
		{#if !announcement.isRead}
			<PulseDot size={14} class="absolute -right-1.5 -top-1.5" />
		{/if}
	</div>
</div>
