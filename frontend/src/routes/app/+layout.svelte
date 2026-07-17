<script lang="ts">
	import { page } from "$app/state";
	import BG from "$lib/components/BG.svelte";
	import AppNav from "$lib/components/AppNav.svelte";
	import Announcements from "$lib/components/announcements/Announcements.svelte";
	import Settings from "$lib/components/settings/Settings.svelte";
	import { highPerf, reduceAnimations, renderMode, ultraPerf } from "$lib/store/settingsCache";
	import MusicPlayer from "$lib/components/music/MusicPlayer.svelte";
	import type { InputPromptType } from "$lib/input";
	import BobaText from "$lib/components/BobaText.svelte";
	import SlideOut from "$lib/components/anim/SlideOut.svelte";
	import { afterNavigate, beforeNavigate, goto } from "$app/navigation";
	import { fade } from "svelte/transition";
	import { preloadProjects } from "$lib/store/projectCache";
	import { requireAuth } from "$lib/auth";
	import { api } from "$lib/api";
	import { env } from "$env/dynamic/public";
	import { onMount } from "svelte";

	let authed = $state(false);
	let showNavLoading = $state(false);
	let navTimeout: ReturnType<typeof setTimeout> | null = null;

	const loadingMessages = [
		"It's okay, my hotspot sucks too.",
		"Your computer just needs time to cook",
		"The coolness is almost here",
		"How's your day going?",
	];
	let loadingMessage = $state("");

	beforeNavigate(() => {
		navTimeout = setTimeout(() => {
			loadingMessage =
				loadingMessages[
					Math.floor(Math.random() * loadingMessages.length)
				];
			showNavLoading = true;
		}, 1000);
	});

	afterNavigate(() => {
		if (navTimeout) clearTimeout(navTimeout);
		showNavLoading = false;
	});

	let windowWidth = $state(0);
	let isMobile = $derived(windowWidth > 0 && windowWidth < 640);
	let isProjectsRoute = $derived(
		page.url.pathname.startsWith("/app/projects"),
	);
	let isCommunityRoute = $derived(
		page.url.pathname.startsWith("/app/community"),
	);

	let { children } = $props();

	// Nav hint segments per route — the persistent AppNav (rendered once below)
	// reads these so it never remounts/re-animates on navigation.
	type NavSegment = { type: "input"; value: InputPromptType } | { type: "text"; value: string };
	const HINT_WASD_MOUSE: NavSegment[] = [
		{ type: "text", value: "Use" },
		{ type: "input", value: "WASD" },
		{ type: "text", value: "or" },
		{ type: "input", value: "mouse" },
		{ type: "text", value: "to navigate" },
	];
	const HINT_WS_SCROLL: NavSegment[] = [
		{ type: "text", value: "Use" },
		{ type: "input", value: "WS" },
		{ type: "text", value: "or" },
		{ type: "input", value: "mouse-scroll" },
		{ type: "text", value: "to navigate" },
	];
	// Mouse-only, "traditional" pages (detail / form / checkout / ship flow).
	const HINT_MOUSE: NavSegment[] = [
		{ type: "text", value: "Use" },
		{ type: "input", value: "mouse" },
		{ type: "text", value: "to navigate" },
	];
	const HINT_CLICK: NavSegment[] = [
		{ type: "input", value: "click" },
		{ type: "text", value: "to fill fields" },
	];

	function hintsFor(pathname: string): NavSegment[] {
		const p = pathname.replace(/\/+$/, "") || "/app";
		// Project edit is a form.
		if (/^\/app\/projects\/[^/]+\/edit$/.test(p)) return HINT_CLICK;
		// Keyboard-navigable 2D grids.
		if (p === "/app" || p === "/app/shop" || p === "/app/events/shop") return HINT_WASD_MOUSE;
		// Keyboard-navigable vertical lists.
		if (
			p === "/app/projects" ||
			p === "/app/events" ||
			p === "/app/events/explore" ||
			p === "/app/community" ||
			p === "/app/refer"
		)
			return HINT_WS_SCROLL;
		// Everything else (project detail, new, ship flow, hackatime, item detail,
		// onboarding, …) is a traditional mouse-driven page.
		return HINT_MOUSE;
	}

	const navSegments = $derived(hintsFor(page.url.pathname));

	// Focused flows (onboarding, ship submission) hide the persistent nav.
	const showNav = $derived(
		!page.url.pathname.startsWith("/app/onboarding") &&
			!/^\/app\/projects\/[^/]+\/ship(\/|$)/.test(page.url.pathname),
	);

	// Mobile entry point: route bare /app to the mobile-ready /app/projects.
	$effect(() => {
		if (authed && isMobile && page.url.pathname === "/app") {
			goto("/app/projects");
		}
	});

	// The BG pattern scroll runs forever, so the performance modes stop it.
	// "Reduce Animations" slows it instead (html.reduce-anim rule in BG).
	const disableAnimations = $derived($highPerf);

	// Motion/performance root classes. `reduce-anim` slows every animation and
	// softens easings (shared vars in the root layout + per-component
	// slowdowns); `perf-high` (both tiers) lets components stop their own
	// infinite decorative loops via `:global(html.perf-high)` overrides;
	// `perf-ultra` zeroes every CSS animation/transition duration in layout.css
	// (see `html.perf-ultra`).
	// `render-gpu`/`render-cpu` bias animation work toward compositor layers
	// or away from them (will-change rules in layout.css); absent = browser
	// heuristics ("auto").
	$effect(() => {
		document.documentElement.classList.toggle("reduce-anim", $reduceAnimations);
		document.documentElement.classList.toggle("perf-high", $highPerf);
		document.documentElement.classList.toggle("perf-ultra", $ultraPerf);
		document.documentElement.classList.toggle("render-gpu", $renderMode === "gpu");
		document.documentElement.classList.toggle("render-cpu", $renderMode === "cpu");
		return () =>
			document.documentElement.classList.remove(
				"reduce-anim",
				"perf-high",
				"perf-ultra",
				"render-gpu",
				"render-cpu",
			);
	});

	// Preload critical data and assets on app load
	onMount(async () => {
		// Check auth and onboarding in parallel
		const [authResult, onboardingRes] = await Promise.all([
			requireAuth(),
			env.PUBLIC_ENABLE_ONBOARDING === "true" &&
			!page.url.pathname.startsWith("/app/onboarding")
				? api.GET("/api/user/auth/onboarding-status")
				: Promise.resolve(null),
		]);

		if (!authResult) return;

		// If onboarding is disabled, redirect away from onboarding pages
		if (
			env.PUBLIC_ENABLE_ONBOARDING !== "true" &&
			page.url.pathname.startsWith("/app/onboarding")
		) {
			goto("/app");
			return;
		}

		// Redirect to onboarding if not completed
		if (
			onboardingRes &&
			onboardingRes.data &&
			!onboardingRes.data.onboardComplete
		) {
			goto("/app/onboarding");
			return;
		}

		authed = true;

		// Prefetch projects data in background
		preloadProjects();

		// Preload common assets in idle time
		if (typeof window !== "undefined" && "requestIdleCallback" in window) {
			requestIdleCallback(() => {
				// Prefetch images
				const images = [
					"./assets/projects/hero-placeholder.png",
					"./assets/home/tools.png",
					"./assets/home/explore.png",
				];
				images.forEach((src) => {
					const img = new Image();
					img.src = src;
				});

				// Preload routes as JS chunks
				const routes = ["/app/projects/new"];
				routes.forEach((route) => {
					const link = document.createElement("link");
					link.rel = "prefetch";
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
{:else if isMobile && !isProjectsRoute && !isCommunityRoute}
	<div
		class="fixed inset-0 z-50 bg-[#271c0c] flex flex-col items-center justify-center gap-4 p-8 text-center"
	>
		<p
			class="font-cook text-[32px] font-semibold text-[#f3e8d8] leading-tight"
		>
			THIS SITE ISN'T READY FOR MOBILE YET.
		</p>
		<p
			class="font-bricolage text-[18px] font-semibold text-[#f3e8d8] tracking-wide"
		>
			We recommend opening this on desktop.
		</p>
	</div>
{:else}
	<BG {disableAnimations}>
		{#key page.url.pathname}
			<div class="page-transition" class:scrollable={isProjectsRoute} class:with-nav={showNav}>
				{@render children()}
			</div>
		{/key}
		{#if showNavLoading}
			<div
				class="absolute right-10 z-50 flex flex-col items-end {showNav ? 'bottom-8 sm:bottom-20' : 'bottom-8'}"
				transition:fade={{ duration: 300 }}
			>
				<BobaText text="LOADING..." fontSize={32} wave />
				<p class="font-bricolage text-[14px] text-black/50 mt-2">
					{loadingMessage}
				</p>
			</div>
		{/if}
		<!-- Persistent bottom nav — rendered once, outside the keyed page
		     transition, so it stays put (no fade/remount) across navigations.
		     Hidden on focused flows (onboarding, ship submission). -->
		{#if showNav}
			<AppNav segments={navSegments} />
			<Announcements />
			<Settings />
			<MusicPlayer />
		{/if}
	</BG>
{/if}

<style>
	.page-transition {
		position: absolute;
		inset: 0;
	}
	/* Reserve space for the persistent AppNav (h-12 = 3rem) so page content is
	   never hidden under it. Only when the nav is actually shown: ≥640px (the nav
	   is hidden below sm) and not on focused flows (which lack .with-nav). */
	@media (min-width: 640px) {
		.page-transition.with-nav {
			bottom: 3rem;
		}
	}
	@media (max-width: 639px) {
		.page-transition.scrollable {
			overflow-y: auto;
		}
	}
</style>
