<script lang="ts">
	import FAQ from '$lib/components/FAQ.svelte';
	import BG from '$lib/components/BG.svelte';
	import BackButton from '$lib/components/BackButton.svelte';
	import CircleIn from '$lib/components/anim/CircleIn.svelte';
	import { goto } from '$app/navigation';
	import { api } from '$lib/api';
	import { onMount, tick } from 'svelte';
	import { page } from '$app/state';
	import { m } from '$lib/paraglide/messages.js';

	let markdown = $state('');
	let isAuthed = $state(false);
	let scrollContainer: HTMLDivElement;
	let disableAnimations = $state(false);

	let backPath = $derived(() => {
		const from = page.url.searchParams.get('from');
		if (from === 'app') return '/app';
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
		document.querySelectorAll('.faq-highlight').forEach(e => e.classList.remove('faq-highlight'));
		el.classList.add('faq-highlight');
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

		const response = await fetch('/content/faq.md');
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

	function goBack() {
		goto(backPath());
	}

	function handleKeydown(ev: KeyboardEvent) {
		if (ev.key === 'Escape') {
			goBack();
		}
	}
</script>

<svelte:head>
	<title>{m.faq_page_title()}</title>
</svelte:head>

<svelte:window onkeydown={handleKeydown} />

{#if !disableAnimations && page.url.searchParams.get('from') !== 'app'}
	<CircleIn />
{/if}

<BG class="flex flex-col">
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div class="flex-1 overflow-auto" bind:this={scrollContainer} onclick={handleAnchorClick}>
		<BackButton onclick={goBack} flyIn />
		<div class="pt-24">
			<FAQ {markdown} />
		</div>
	</div>
</BG>
