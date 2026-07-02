<script lang="ts">
	import { onMount } from 'svelte';
	import { get } from 'svelte/store';
	import { fade } from 'svelte/transition';
	import { page } from '$app/state';
	import {
		announcements,
		currentDetail,
		inboxOpen,
		tagAnnouncement,
	} from '$lib/store/announcementsCache';
	import AnnouncementsModal from './AnnouncementsModal.svelte';
	import AnnouncementTag from './AnnouncementTag.svelte';

	// The floating tag only appears on the app home page.
	const onHome = $derived(page.url.pathname.replace(/\/+$/, '') === '/app');

	function modalOpen() {
		return get(inboxOpen) || !!get(currentDetail);
	}

	function closeCurrent() {
		if (get(currentDetail)) announcements.closeDetail();
		else if (get(inboxOpen)) announcements.closeInbox();
	}

	// Block the page's keyboard navigation while an announcement modal is open.
	// A capture-phase window listener runs before the pages' bubble-phase
	// handlers, so this works regardless of listener registration order.
	function onKeydownCapture(e: KeyboardEvent) {
		if (!modalOpen()) return;
		if (e.key === 'Escape') closeCurrent();
		e.stopImmediatePropagation();
		if (
			[' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End'].includes(
				e.key,
			)
		) {
			e.preventDefault();
		}
	}

	// Lock background scrolling while a modal is open, but still allow scrolling
	// inside the modal card (tagged with data-announcement-modal).
	function onScrollCapture(e: Event) {
		if (!modalOpen()) return;
		const target = e.target as Element | null;
		if (!target?.closest?.('[data-announcement-modal]')) e.preventDefault();
	}

	onMount(() => {
		window.addEventListener('keydown', onKeydownCapture, true);
		window.addEventListener('wheel', onScrollCapture, { capture: true, passive: false });
		window.addEventListener('touchmove', onScrollCapture, { capture: true, passive: false });
		return () => {
			window.removeEventListener('keydown', onKeydownCapture, true);
			window.removeEventListener('wheel', onScrollCapture, { capture: true });
			window.removeEventListener('touchmove', onScrollCapture, { capture: true });
		};
	});

	onMount(async () => {
		await announcements.load();
		announcements.maybeAutoOpen();
	});
</script>

<!-- Floating tag: home page only, and only when nothing else is open. -->
{#if onHome && $tagAnnouncement && !$currentDetail && !$inboxOpen}
	{@const tag = $tagAnnouncement}
	<AnnouncementTag
		announcement={tag}
		onReadMore={() => announcements.openDetail(tag.announcementId)}
		onDismiss={() => announcements.dismissTag(tag.announcementId)}
	/>
{/if}

<!-- Single shared overlay — stays mounted across inbox↔detail so its opacity
     never dips during the switch; only the cards transition. -->
{#if $inboxOpen || $currentDetail}
	<button
		type="button"
		class="fixed inset-0 z-70 cursor-default bg-black/40"
		aria-label="Close"
		onclick={closeCurrent}
		transition:fade={{ duration: 200 }}
	></button>
	<AnnouncementsModal
		items={$announcements.items}
		detail={$currentDetail}
		onSelect={(id) => announcements.openDetail(id)}
		onBack={() => announcements.closeDetail({ toInbox: true })}
		onClose={closeCurrent}
	/>
{/if}
