<script lang="ts">
	import { page } from '$app/state';
    import BG from '$lib/components/BG.svelte';
	import SlideOut from '$lib/components/anim/SlideOut.svelte';
	import { beforeNavigate, goto } from '$app/navigation';
	import { preloadProjects } from '$lib/store/projectCache';
	import { requireAuth } from '$lib/auth';
	import { api } from '$lib/api';
	import { env } from '$env/dynamic/public';
	import { onMount } from 'svelte';

	let authed = $state(false);

	let windowWidth = $state(0);
	let isMobile = $derived(windowWidth > 0 && windowWidth < 768);

	let { children } = $props();

	let disableAnimations = false;

	// Preload critical data and assets on app load
	onMount(async () => {
		// Check auth — redirect to landing if not logged in
		const isAuthed = await requireAuth();
		if (!isAuthed) return;

		// If onboarding is disabled, redirect away from onboarding pages
		if (env.PUBLIC_ENABLE_ONBOARDING !== 'true' && page.url.pathname.startsWith('/app/onboarding')) {
			goto('/app');
			return;
		}

		// Redirect to onboarding if not completed (skip if already on onboarding page)
		if (env.PUBLIC_ENABLE_ONBOARDING === 'true' && !page.url.pathname.startsWith('/app/onboarding')) {
			const { data } = await api.GET('/api/user/auth/onboarding-status');
			if (data && !data.onboardComplete) {
				goto('/app/onboarding');
				return;
			}
		}

		authed = true;

		// Prefetch projects data in background
		preloadProjects();

		// Preload common assets in idle time
		if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
			requestIdleCallback(() => {
				// Prefetch images
				const images = [
					'./assets/projects/hero-placeholder.png',
					'./assets/home/tools.png',
					'./assets/home/explore.png'
				];
				images.forEach(src => {
					const img = new Image();
					img.src = src;
				});

				// Preload routes as JS chunks
				const routes = ['/app/projects/new'];
				routes.forEach(route => {
					const link = document.createElement('link');
					link.rel = 'prefetch';
					link.href = route;
					document.head.appendChild(link);
				});
			});
		}
	});
</script>

<svelte:window bind:innerWidth={windowWidth} />

{#if !authed}
	<!-- Waiting for auth check -->
{:else if isMobile}
	<div class="fixed inset-0 z-50 bg-[#271c0c] flex flex-col items-center justify-center gap-4 p-8 text-center">
		<p class="font-cook text-[32px] font-semibold text-[#f3e8d8] leading-tight">THIS SITE ISN'T READY FOR MOBILE YET.</p>
		<p class="font-bricolage text-[18px] font-semibold text-[#f3e8d8] tracking-wide">We recommend opening this on desktop.</p>
	</div>
{:else}
	<BG {disableAnimations}>
		{#key page.url.pathname}
			<div
				class="page-transition"
			>
				{@render children()}
			</div>
		{/key}
	</BG>
{/if}

<style>
	.page-transition {
		position: absolute;
		inset: 0;
	}
</style>
