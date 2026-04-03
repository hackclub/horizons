<script lang="ts">
	import Events from '$lib/components/Events.svelte';
	import BG from '$lib/components/BG.svelte';
	import BackButton from '$lib/components/BackButton.svelte';
	import CircleIn from '$lib/components/anim/CircleIn.svelte';
	import { goto } from '$app/navigation';
	import { api } from '$lib/api';
	import { EXIT_DURATION } from '$lib';
	import { onMount, tick } from 'svelte';
	import { page } from '$app/state';

	let markdown = $state('');
	let isAuthed = $state(false);
	let scrollContainer: HTMLDivElement;
	let disableAnimations = $state(false);
	let navigating = $state(false);

	let fromApp = $derived(page.url.searchParams.get('from') === 'app');

	let backPath = $derived(() => {
		const from = page.url.searchParams.get('from');
		if (from === 'app') return '/app?noanimate';
		if (from === 'home') return '/';
		return isAuthed ? '/app' : '/';
	});

	function scrollToHash(hash: string) {
		if (!hash || !scrollContainer) return;
		const id = hash.replace('#', '');
		const el = document.getElementById(id);
		if (!el) return;
		const containerRect = scrollContainer.getBoundingClientRect();
		const elRect = el.getBoundingClientRect();
		const offset = elRect.top - containerRect.top + scrollContainer.scrollTop;
		scrollContainer.scrollTo({ top: offset - 96, behavior: 'smooth' });
		document.querySelectorAll('.event-highlight').forEach(e => e.classList.remove('event-highlight'));
		el.classList.add('event-highlight');
	}

	function handleAnchorClick(ev: MouseEvent) {
		const anchor = (ev.target as HTMLElement).closest('a');
		if (!anchor) return;
		const href = anchor.getAttribute('href');
		if (!href?.startsWith('#')) return;
		ev.preventDefault();
		history.replaceState(null, '', href);
		scrollToHash(href);
	}

	onMount(async () => {
		const stored = localStorage.getItem('disableAnimations');
		if (stored !== null) {
			disableAnimations = stored === 'true';
		}

		const response = await fetch('/content/events.md');
		markdown = await response.text();

		await tick();
		if (window.location.hash) {
			scrollToHash(window.location.hash);
		}

		api.GET('/api/user/auth/me').then(response => {
			if (response.data && response.data.hcaId) {
				isAuthed = true;
			}
		});
	});

	async function goBack() {
		if (fromApp) {
			navigating = true;
			await new Promise(resolve => setTimeout(resolve, EXIT_DURATION + 350));
		}
		goto(backPath());
	}

	function handleKeydown(ev: KeyboardEvent) {
		if (ev.key === 'Escape' && !document.querySelector('[role="dialog"]')) {
			goBack();
		}
	}
</script>

<svelte:head>
	<title>Community Events</title>
</svelte:head>

<svelte:window onkeydown={handleKeydown} />

{#if !disableAnimations && page.url.searchParams.get('from') !== 'app'}
	<CircleIn />
{/if}

<BG class="flex flex-col">
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div class="flex-1 overflow-auto" bind:this={scrollContainer} onclick={handleAnchorClick}>
		<BackButton onclick={goBack} exiting={navigating} flyIn />
		<div class="pt-24 content-slide" class:from-app={fromApp} class:exiting={navigating}>
			<Events {markdown} />
		</div>
	</div>
</BG>

<style>
	@keyframes content-enter {
		from { transform: translateX(-120vw); }
		to   { transform: translateX(0); }
	}
	@keyframes content-exit {
		from { transform: translateX(0); }
		to   { transform: translateX(-120vw); }
	}

	.content-slide.from-app {
		animation: content-enter var(--enter-duration) var(--enter-easing) both;
	}
	.content-slide.from-app.exiting {
		animation: content-exit var(--exit-duration) var(--exit-easing) both;
	}
</style>
