<script lang="ts">
	import { onMount } from 'svelte';
	import { get } from 'svelte/store';
	import { fade } from 'svelte/transition';
	import {
		settings,
		settingsOpen,
		reduceAnimations,
		perfMode,
		renderMode,
	} from '$lib/store/settingsCache';
	import SettingsModal from './SettingsModal.svelte';

	// Block the page's keyboard navigation while the modal is open. A capture-phase
	// window listener runs before the pages' bubble-phase handlers.
	function onKeydownCapture(e: KeyboardEvent) {
		if (!get(settingsOpen)) return;
		if (e.key === 'Escape') settings.close();
		e.stopImmediatePropagation();
		if (
			[' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End'].includes(
				e.key,
			)
		) {
			e.preventDefault();
		}
	}

	// Lock background scrolling while open, but still allow scrolling inside the card.
	function onScrollCapture(e: Event) {
		if (!get(settingsOpen)) return;
		const target = e.target as Element | null;
		if (!target?.closest?.('[data-settings-modal]')) e.preventDefault();
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
</script>

{#if $settingsOpen}
	<button
		type="button"
		class="fixed inset-0 z-70 cursor-default bg-black/40"
		aria-label="Close"
		onclick={() => settings.close()}
		transition:fade={{ duration: 200 }}
	></button>
	<SettingsModal
		tab={$settings.tab}
		reduceAnimations={$reduceAnimations}
		perfMode={$perfMode}
		renderMode={$renderMode}
		hideBorders={$settings.hideBorders}
		fun={$settings.fun}
		onClose={() => settings.close()}
	/>
{/if}
