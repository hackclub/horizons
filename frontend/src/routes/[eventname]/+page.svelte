<script lang="ts">
	import BG from '$lib/components/BG.svelte';
	import BobaText from '$lib/components/BobaText.svelte';
	import TextWave from '$lib/components/TextWave.svelte';
	import BobaButton from '$lib/components/BobaButton.svelte';
	import CircleIn from '$lib/components/anim/CircleIn.svelte';
	import CircleOut from '$lib/components/anim/CircleOut.svelte';
	import MenuItem from '$lib/components/MenuItem.svelte';
	import { onMount } from 'svelte';
	import { fade, fly } from 'svelte/transition';
	import { quintOut } from 'svelte/easing';
	import { api } from '$lib/api';
	import { goto } from '$app/navigation';
	import { createListNav, parseNavKey, isNavKey, clampIndex, navState } from '$lib/nav/wasd.svelte';

	import hIcon from '$lib/assets/icons/h.svg';
	import huhIcon from '$lib/assets/icons/huh.svg';
	import yayaIcon from '$lib/assets/icons/yaya.svg';
	import hackatimeIcon from '$lib/assets/icons/hackatime.svg';

	import type { EventConfig } from '$lib/events/types';

	let { data } = $props();
	const config: EventConfig = data.config;

	const iconMap: Record<string, string> = {
		h: hIcon,
		huh: huhIcon,
		yaya: yayaIcon,
		hackatime: hackatimeIcon
	};

	let activated = $state(false);
	let pressed = $state(false);
	let transitioning = $state(false);
	let isTransitioning = $state(false);
	let selectedElement = $state(-1);
	let cardRefs: HTMLElement[] = [];
	let isTyping = $state(false);
	let btnPressed = $state(false);
	let showSlideOut = $state(false);
	let disableAnimations = $state(false);
	let animationsReady = $state(false);
	let windowWidth = $state(0);
	let isMobile = $derived(windowWidth > 0 && windowWidth < 640);

	let isAuthed = $state(false);

	onMount(() => {
		const stored = localStorage.getItem('disableAnimations');
		if (stored !== null) {
			disableAnimations = stored === 'true';
		}
		animationsReady = true;

		api.GET('/api/user/auth/me').then(response => {
			if (response.data && response.data.hcaId) {
				window.location.href = '/app';
			}
		});
	});

	$effect(() => {
		localStorage.setItem('disableAnimations', String(disableAnimations));
	});

	let signupEmail = $state('');
	let signupEmailFocused = $state(false);

	async function activateJoinNow(email: string) {
		showSlideOut = true;

		if (isAuthed) {
			setTimeout(() => { goto('/app'); }, 1200);
			return;
		}

		const response = await api.GET('/api/user/auth/login', {
			params: { query: { email } }
		});
		const authURL = response.data?.url;

		if (!authURL) {
			showSlideOut = false;
			return;
		}

		setTimeout(() => {
			window.location = authURL as string & Location;
		}, 1200);
	}

	function handleMenuAction(item: typeof config.menu[number]) {
		if (item.action === 'signup') {
			if (isAuthed) {
				activateJoinNow('');
			}
		} else if (item.action === 'link' && item.href) {
			showSlideOut = true;
			setTimeout(() => { goto(item.href!); }, 500);
		}
	}

	let logoRect: DOMRect | null = $state(null);
	let stripesRect: DOMRect | null = $state(null);

	function captureLogoRect(node: HTMLElement) {
		logoRect = node.getBoundingClientRect();
		return { duration: 0 };
	}

	function captureStripesRect(node: HTMLElement) {
		stripesRect = node.getBoundingClientRect();
		return { duration: 0 };
	}

	function animateLogoIn(node: HTMLElement) {
		if (!logoRect || disableAnimations) return { duration: 0 };
		const to = node.getBoundingClientRect();
		const dx = logoRect.left - to.left;
		const dy = logoRect.top - to.top;
		const sx = logoRect.width / to.width;
		const sy = logoRect.height / to.height;
		return {
			duration: 600,
			easing: quintOut,
			css: (t: number) => {
				const u = 1 - t;
				return `transform: translate(${u * dx}px, ${u * dy}px) scale(${1 + u * (sx - 1)}, ${1 + u * (sy - 1)}); transform-origin: top left;`;
			}
		};
	}

	function animateStripesIn(node: HTMLElement) {
		if (!stripesRect || disableAnimations) return { duration: 0 };
		const to = node.getBoundingClientRect();
		const dx = stripesRect.left - to.left;
		const dy = stripesRect.top - to.top;
		const sx = stripesRect.width / to.width;
		const sy = stripesRect.height / to.height;
		return {
			duration: 600,
			easing: quintOut,
			css: (t: number) => {
				const u = 1 - t;
				return `transform: translate(${u * dx}px, ${u * dy}px) scale(${1 + u * (sx - 1)}, ${1 + u * (sy - 1)}); transform-origin: top left;`;
			}
		};
	}

	const transitionDuration = $derived(disableAnimations ? 0 : undefined);

	const nav = createListNav({
		count: () => config.menu.length,
		onSelect: (index) => {
			const item = config.menu[index];
			if (item.action === 'signup' && isAuthed) {
				activateJoinNow('');
			} else if (item.action === 'link' && item.href) {
				showSlideOut = true;
				setTimeout(() => { goto(item.href!); }, 500);
			} else {
				const elements = getFocusableElements(index);
				if (elements.length > 0) {
					selectedElement = 0;
					focusSelectedElement();
				}
			}
		},
	});

	function handlePageKeydown(ev: KeyboardEvent) {
		if (!activated) {
			if (isNavKey(ev.key)) {
				navState.usingKeyboard = true;
			}
			if (ev.key === 'Enter' && !isTransitioning) {
				pressed = true;
				setTimeout(() => {
					isTransitioning = true;
					setTimeout(showDetail, 400);
				}, 150);
			}
			return;
		}

		if (isTyping) return;
		if (selectedElement >= 0) return;

		nav.handleKeydown(ev);
	}

	function showDetail() {
		transitioning = true;
		activated = true;
		pressed = false;
		setTimeout(() => { transitioning = false; }, 600);
	}

	function getFocusableElements(cardIndex: number): HTMLElement[] {
		const card = cardRefs[cardIndex];
		if (!card) return [];
		return Array.from(card.querySelectorAll('input, button, [tabindex]:not([tabindex="-1"])'));
	}

	function focusSelectedElement() {
		const elements = getFocusableElements(nav.selectedIndex);
		if (selectedElement >= 0 && selectedElement < elements.length) {
			elements[selectedElement]?.focus();
		} else {
			(document.activeElement as HTMLElement)?.blur();
		}
	}

	function handleElementKeydown(ev: KeyboardEvent) {
		const elements = getFocusableElements(nav.selectedIndex);
		const isInput = (ev.target as HTMLElement).tagName === 'INPUT';

		if (isInput && ev.key !== 'Enter' && ev.key !== 'Tab' && ev.key !== 'Escape') {
			return;
		}

		if (ev.key === 'Enter') {
			if (isInput && selectedElement < elements.length - 1) {
				ev.preventDefault();
				selectedElement++;
				focusSelectedElement();
			} else if (!isInput) {
				btnPressed = true;
				setTimeout(() => { btnPressed = false; }, 150);
			}
			return;
		}

		if (ev.key === 'Tab') {
			if (selectedElement < elements.length - 1) {
				ev.preventDefault();
				selectedElement++;
				focusSelectedElement();
			} else if (!ev.shiftKey) {
				ev.preventDefault();
				selectedElement = -1;
				nav.selectedIndex = clampIndex(nav.selectedIndex + 1, config.menu.length - 1);
				(document.activeElement as HTMLElement)?.blur();
			}
			return;
		}

		if ((ev.key === 'Tab' && ev.shiftKey) || ev.key === 'Escape') {
			ev.preventDefault();
			if (selectedElement > 0) {
				selectedElement--;
				focusSelectedElement();
			} else {
				selectedElement = -1;
				(document.activeElement as HTMLElement)?.blur();
			}
			return;
		}

		const dir = parseNavKey(ev.key);
		if (!dir) return;
		ev.preventDefault();

		if (dir === 'up') {
			if (selectedElement > 0) {
				selectedElement--;
				focusSelectedElement();
			} else {
				selectedElement = -1;
				(document.activeElement as HTMLElement)?.blur();
			}
		} else if (dir === 'down') {
			if (selectedElement < elements.length - 1) {
				selectedElement++;
				focusSelectedElement();
			}
		} else if (dir === 'left') {
			selectedElement = -1;
			nav.selectedIndex = clampIndex(nav.selectedIndex - 1, config.menu.length - 1);
			(document.activeElement as HTMLElement)?.blur();
		} else if (dir === 'right') {
			selectedElement = -1;
			nav.selectedIndex = clampIndex(nav.selectedIndex + 1, config.menu.length - 1);
			(document.activeElement as HTMLElement)?.blur();
		}
	}
</script>

<svelte:head>
	<title>{config.name} | Hack Club</title>
	{@html `<style>:root { --layout-bg: ${config.colors.background}; --layout-dark: ${config.colors.dark}; --selected-color: ${config.colors.primary}; }</style>`}
</svelte:head>

<svelte:window onkeydown={handlePageKeydown} bind:innerWidth={windowWidth} />

{#if !animationsReady}
	<div class="fixed inset-0 z-[9999]" style="background-color: {config.colors.text}"></div>
{:else if !disableAnimations}
	<CircleIn />
	{#if showSlideOut}
		<CircleOut />
	{/if}
{/if}

<BG class="flex flex-col overflow-hidden" {disableAnimations} --bg-color={config.colors.background} backgroundImage={config.background?.image} backgroundPattern={config.background?.pattern ?? true} backgroundOpacity={config.background?.opacity ?? 0.5}>
	{#if !activated}
		<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
		<div class="flex-1 flex flex-col justify-center absolute inset-0 cursor-pointer" onclick={() => {
			if (!isTransitioning) {
				navState.usingKeyboard = false;
				pressed = true;
				setTimeout(() => {
					isTransitioning = true;
					setTimeout(() => { showDetail(); }, 400);
				}, 150);
			}
		}}>
			<div class="flex flex-col items-center justify-center px-4 sm:px-16 pb-4 w-full">
				<div out:captureLogoRect style="max-width: {config.logoMaxWidth ?? '80rem'}; width: 100%;">
					<img src={config.logo} alt={config.name} class="w-full h-auto" />
				</div>
			</div>
			{#if !isTransitioning}
				<p class="text-center font-cook text-xl sm:text-4xl tracking-wide sm:tracking-widest mt-2 mb-6" style="color: {config.colors.text}" out:fade={{ duration: disableAnimations ? 0 : 300, delay: disableAnimations ? 0 : 100 }}>
					<TextWave text={config.headline} duration={2} disabled={disableAnimations} />
				</p>
			{/if}

			<div out:captureStripesRect>
				<div class="stripes flex flex-col w-full" class:no-anim={disableAnimations} style="gap: 10px">
					{#each config.stripes as color, i}
						<div class="stripe" class:outro={isTransitioning} style="height: 33px; animation-delay: {isTransitioning ? `${i * 50}ms` : `${200 + i * 100}ms`}; background-color: {color}"></div>
					{/each}
				</div>
			</div>

			{#if !isTransitioning}
				<div class="flex flex-col items-center justify-center px-4 sm:px-16 mt-8" out:fade={{ duration: disableAnimations ? 0 : 300, delay: disableAnimations ? 0 : 100 }}>
					<BobaButton text={isMobile ? config.buttonTextMobile : config.buttonText} fontSize={isMobile ? 22 : 32} fallbackWidth={isMobile ? 186 : 360} {pressed} className="select-none" wave {disableAnimations} />
				</div>
			{/if}
		</div>

		<label class="disable-anim-checkbox">
			<input type="checkbox" bind:checked={disableAnimations} />
			Disable animations
		</label>
	{/if}

	{#if activated}
		<div class="flex flex-col h-full items-center gap-4 sm:gap-8 pb-8">
			<div class="flex flex-col w-full">
				<div class="flex gap-2 sm:gap-4 items-center sm:items-end px-4 sm:px-10 pt-6 sm:pt-10 pb-3 min-w-0">
					<div class="shrink-0" in:animateLogoIn>
						<img src={config.logo} alt={config.name} class="h-14 sm:h-24 w-auto max-w-none object-contain"/>
					</div>
					<p in:fade={{ duration: disableAnimations ? 0 : 300, delay: disableAnimations ? 0 : 200 }} class="tagline hidden sm:block min-w-0 flex-1" style="color: {config.colors.text}">
						<TextWave text={config.tagline} disabled={disableAnimations} />
					</p>
				</div>
				<div in:animateStripesIn>
					<div class="stripes flex flex-col w-full" class:no-anim={disableAnimations} style="gap: 5px">
						{#each config.stripes as color}
							<div class="stripe" style="height: 17px; animation-delay: 200ms; background-color: {color}"></div>
						{/each}
					</div>
				</div>
			</div>

			<div class="flex flex-col items-center gap-4 sm:gap-7 w-full px-4 sm:px-10"
				style="--selected-color: {config.colors.primary}; --card-bg: {config.colors.cardBg}; --text-color: {config.colors.text}; --border-color: {config.colors.text}"
			>
				<div class="w-full flex justify-center" in:fly={{ x: disableAnimations ? 0 : 50, duration: disableAnimations ? 0 : 400, delay: disableAnimations ? 0 : 500 }} bind:this={cardRefs[0]} onmouseenter={() => { if (!signupEmailFocused) nav.select(0); }}>
					{#if isAuthed}
						<MenuItem
							title="SIGN BACK IN"
							subtitle="GET BACK TO WORKING ON YOUR PROJECTS!"
							chevron
							selected={nav.selectedIndex === 0}
							preserveIcon
							{disableAnimations}
							onclick={() => activateJoinNow('')}
						>
							{#snippet icon()}
								{#if config.menu[0] && iconMap[config.menu[0].icon]}
									<img src={iconMap[config.menu[0].icon]} alt={config.menu[0].title} />
								{/if}
							{/snippet}
						</MenuItem>
					{:else}
						<MenuItem
							title={config.menu[0]?.title ?? 'JOIN NOW'}
							subtitle={config.menu[0]?.subtitle ?? 'START WORKING ON YOUR PROJECTS!'}
							chevron
							selected={nav.selectedIndex === 0}
							preserveIcon
							{disableAnimations}
							showSignup={!isMobile}
							bind:email={signupEmail}
							bind:emailFocused={signupEmailFocused}
							onSignup={activateJoinNow}
							signupHint={navState.usingKeyboard ? "Press enter to enter your email" : "Click to enter your email"}
							onclick={isMobile ? () => activateJoinNow('') : undefined}
						>
							{#snippet icon()}
								{#if config.menu[0] && iconMap[config.menu[0].icon]}
									<img src={iconMap[config.menu[0].icon]} alt={config.menu[0].title} />
								{/if}
							{/snippet}
						</MenuItem>
					{/if}
				</div>
				<div class="w-full flex justify-center" in:fly={{ x: disableAnimations ? 0 : 50, duration: disableAnimations ? 0 : 400, delay: disableAnimations ? 0 : 600 }} bind:this={cardRefs[1]} onmouseenter={() => { if (!signupEmailFocused) nav.select(1); }}>
					<MenuItem
						title={config.menu[1]?.title ?? "WHAT'S THIS?"}
						subtitle={config.menu[1]?.subtitle ?? 'LEARN MORE ABOUT THE EVENT!'}
						selected={nav.selectedIndex === 1}
						preserveIcon
						{disableAnimations}
						onclick={() => handleMenuAction(config.menu[1])}
					>
						{#snippet icon()}
							{#if config.menu[1] && iconMap[config.menu[1].icon]}
								<img src={iconMap[config.menu[1].icon]} alt={config.menu[1].title} />
							{/if}
						{/snippet}
					</MenuItem>
				</div>
			</div>

			<div in:fly={{ y: disableAnimations ? 0 : 20, duration: disableAnimations ? 0 : 300, delay: disableAnimations ? 0 : 800 }} class="hidden sm:flex justify-center absolute bottom-4 left-0 right-0">
				<BobaText text={config.footerHint} fontSize={30} wave {disableAnimations} />
			</div>

			<button
				in:fly={{ y: disableAnimations ? 0 : 20, duration: disableAnimations ? 0 : 300, delay: disableAnimations ? 0 : 900 }}
				class="absolute bottom-0 left-4 bg-transparent border-none cursor-pointer opacity-60 hover:opacity-100 transition-opacity duration-200"
				onclick={() => { activated = false; isTransitioning = false; }}
			>
				<BobaText text="< BACK" fontSize={24} {disableAnimations} />
			</button>
		</div>
	{/if}
</BG>

<style>
	.disable-anim-checkbox {
		position: fixed;
		bottom: 16px;
		right: 16px;
		font-family: 'Bricolage Grotesque', sans-serif;
		font-size: 14px;
		color: black;
		display: flex;
		align-items: center;
		gap: 8px;
		cursor: pointer;
		opacity: 0.6;
		transition: opacity 0.2s ease;
	}

	.disable-anim-checkbox:hover {
		opacity: 1;
	}

	.tagline {
		font-family: var(--font-cook);
		font-size: clamp(16px, 2.5vw, 32px);
		font-weight: 600;
		margin: 0;
	}

	.stripe {
		width: 0;
		animation: expandWidth 0.5s ease-out forwards;
	}

	.stripe.outro {
		width: 100%;
		margin-left: auto;
		animation: collapseWidth 0.3s ease-in forwards;
	}

	@keyframes expandWidth {
		from { width: 0; }
		to { width: 100%; }
	}

	@keyframes collapseWidth {
		from { width: 100%; }
		to { width: 0; }
	}

	.no-anim .stripe {
		animation: none;
		width: 100%;
	}
</style>
