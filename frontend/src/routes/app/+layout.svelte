<script lang="ts">
	import { page } from '$app/state';
    import BG from '$lib/components/BG.svelte';
	import BobaText from '$lib/components/BobaText.svelte';
	import SlideOut from '$lib/components/anim/SlideOut.svelte';
	import { afterNavigate, beforeNavigate, goto } from '$app/navigation';
	import { fade } from 'svelte/transition';
	import { preloadProjects } from '$lib/store/projectCache';
	import { requireAuth } from '$lib/auth';
	import { api } from '$lib/api';
	import { env } from '$env/dynamic/public';
	import { onMount } from 'svelte';

	let authed = $state(false);
	let showNavLoading = $state(false);
	let navTimeout: ReturnType<typeof setTimeout> | null = null;

	const loadingMessages = [
		"It's okay, my hotspot sucks too.",
		"Your computer just needs time to cook",
		"The coolness is almost here",
		"How's your day going?",
	];
	let loadingMessage = $state('');

	beforeNavigate(() => {
		navTimeout = setTimeout(() => {
			loadingMessage = loadingMessages[Math.floor(Math.random() * loadingMessages.length)];
			showNavLoading = true;
		}, 1000);
	});

	afterNavigate(() => {
		if (navTimeout) clearTimeout(navTimeout);
		showNavLoading = false;
	});

	let windowWidth = $state(0);
	let isMobile = $derived(windowWidth > 0 && windowWidth < 480);

	let { children } = $props();

	let disableAnimations = false;

	// Preload critical data and assets on app load
	onMount(async () => {
		// Check auth and onboarding in parallel
		const [authResult, onboardingRes] = await Promise.all([
			requireAuth(),
			env.PUBLIC_ENABLE_ONBOARDING === 'true' && !page.url.pathname.startsWith('/app/onboarding')
				? api.GET('/api/user/auth/onboarding-status')
				: Promise.resolve(null),
		]);

		if (!authResult) return;

		// If onboarding is disabled, redirect away from onboarding pages
		if (env.PUBLIC_ENABLE_ONBOARDING !== 'true' && page.url.pathname.startsWith('/app/onboarding')) {
			goto('/app');
			return;
		}

		// Redirect to onboarding if not completed
		if (onboardingRes && onboardingRes.data && !onboardingRes.data.onboardComplete) {
			goto('/app/onboarding');
			return;
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
	<div class="fixed inset-0 bg-black z-50"></div>
{:else if isMobile}
	<div class="fixed inset-0 z-50 bg-[#271c0c] flex flex-col items-center justify-center gap-4 p-8 text-center">
		<p class="font-cook text-[32px] font-semibold text-[#f3e8d8] leading-tight">THIS SITE ISN'T READY FOR MOBILE YET.</p>
		<p class="font-bricolage text-[18px] font-semibold text-[#f3e8d8] tracking-wide">We recommend opening this on desktop.</p>
	</div>
{:else}
	<BG {disableAnimations}>
		{#key page.url.pathname}
			<div class="page-transition">
				{@render children()}
			</div>
		{/key}
		{#if showNavLoading}
			<div class="absolute bottom-8 right-10 z-50 flex flex-col items-end" transition:fade={{ duration: 300 }}>
				<BobaText text="LOADING..." fontSize={32} wave />
				<p class="font-bricolage text-[14px] text-black/50 mt-2">{loadingMessage}</p>
			</div>
		{/if}
	</BG>
{/if}

<style>
	.page-transition {
		position: absolute;
		inset: 0;
	}
</style>
