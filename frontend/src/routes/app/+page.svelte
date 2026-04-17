<script lang="ts">
	import CircleIn from '$lib/components/anim/CircleIn.svelte';
	import TextWave from '$lib/components/TextWave.svelte';
	import logoSvg from '$lib/assets/Logo.svg';
	import communitySvg from '$lib/assets/home/community.svg';

	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import InputPrompt from '$lib/components/InputPrompt.svelte';
	import { createGridNav } from '$lib/nav/wasd.svelte';
	import { EXIT_DURATION } from '$lib';
	import { api } from '$lib/api';
	import { userStore } from '$lib/store/userCache';
	import { getCachedPinnedEvent, setCachedPinnedEvent } from '$lib/store/pinnedEventCache';
	import { onMount } from 'svelte';
	import yaml from 'js-yaml';
	import type { EventConfig } from '$lib/events/types';
	import eventsRaw from '$lib/events/events.yaml?raw';

	const phrases = [
		"OH YEAH. IT'S ALL COMING TOGETHER.",
		"IT'S! TIME! TO! COOK!",
		"HACKCLUB HORIZONS 4EVER",
		"IN EVERY CONTINENT (DON'T TELL ANTARCTICA)",
	];
	const headerText = phrases[Math.floor(Math.random() * phrases.length)];

	let disableAnimations = false;
	let hideCirc = $state(page.url.searchParams.has('noanimate') || disableAnimations);

	// Post-onboarding popovers
	let postOnboarding = $state(page.url.searchParams.has('post-onboarding'));

	const cardDescriptions: Record<string, string> = {
		'0-0': 'Create projects, track your progress, and submit them for review!',
		'0-1': 'Check out upcoming Horizons events!',
		'1-0': 'Spend your approved hours on rewards!',
		'2-0': 'Check out online events we\'re running for the community!',
		'3-0': 'Got questions? Find answers here.',
	};

	let userName = $derived($userStore.userName);
	let referralCode = $derived($userStore.referralCode);
	let isAdmin = $derived($userStore.role === 'admin' || $userStore.role === 'superadmin');
	const eventsMap = yaml.load(eventsRaw) as Record<string, EventConfig>;
	let pinnedEventConfig = $state<EventConfig>(eventsMap['nexus']);
	let pinnedEventSlug = $state<string>('nexus');

	let approvedHours = $state(0);
	let completedHours = $state(0);
	let targetHours = $state(30);

	let remainingHours = $derived(Math.round(Math.max(0, targetHours - completedHours) * 10) / 10);
	let approvedPct = $derived(targetHours > 0 ? Math.min(100, (approvedHours / targetHours) * 100) : 0);
	let completedPct = $derived(targetHours > 0 ? Math.min(100, ((completedHours - approvedHours) / targetHours) * 100) : 0);

	// Load cached pinned event instantly
	const cached = getCachedPinnedEvent();
	if (cached && eventsMap[cached.slug]) {
		pinnedEventSlug = cached.slug;
		pinnedEventConfig = eventsMap[cached.slug];
		targetHours = cached.hourCost;
	}

	async function fetchHours() {
		const [totalRes, approvedRes] = await Promise.all([
			api.GET('/api/hackatime/hours/total'),
			api.GET('/api/hackatime/hours/approved'),
		]);
		if (totalRes.data) {
			completedHours = Math.round(((totalRes.data as any).totalNowHackatimeHours ?? 0) * 10) / 10;
		}
		if (approvedRes.data) {
			approvedHours = Math.round(((approvedRes.data as any).totalApprovedHours ?? 0) * 10) / 10;
		}
	}

	onMount(async () => {
		await Promise.all([userStore.load(), fetchHours()]);

		// Refresh from API and update cache
		const pinnedRes = await api.GET('/api/events/auth/pinned-event' as any, {}).catch(() => null);
		if (pinnedRes?.data) {
			const event = (pinnedRes.data as any).event;
			const slug = event?.slug;
			if (slug && eventsMap[slug]) {
				pinnedEventSlug = slug;
				pinnedEventConfig = eventsMap[slug];
				const hourCost = event?.hourCost ?? 30;
				targetHours = hourCost;
				setCachedPinnedEvent(slug, hourCost);
			}
		}

	});

	const hrefs = [
		['/app/projects?back', '/app/events'],
		['/app/shop?back'],
		['/app/community'],
		['/faq?from=app'],
		['/admin'],
	];

	// Projects (0,0), Events (0,1), Shop (1,0), Community (2,0), FAQ (3,0) are enabled
	function isDisabled(col: number, row: number) {
		return false;
	}

	let shakingKey = $state<string | null>(null);

	function triggerShake(col: number, row: number) {
		const key = `${col}-${row}`;
		if (shakingKey === key) {
			shakingKey = null;
			requestAnimationFrame(() => { shakingKey = key; });
		} else {
			shakingKey = key;
		}
	}

	function isShaking(col: number, row: number) {
		return shakingKey === `${col}-${row}`;
	}

	let navigating = $state(false);
	let exitRight = $state(false);
	let hasInteracted = $state(false);

	async function navigateTo(href: string, opts: { exitRight?: boolean } = {}) {
		navigating = true;
		if (opts.exitRight) exitRight = true;
		await new Promise(resolve => setTimeout(resolve, EXIT_DURATION + 350));
		goto(href);
	}

	const nav = createGridNav({
		columns: () => isAdmin ? [2, 1, 1, 1, 1] : [2, 1, 1, 1],
		onSelect: (col, row) => {
			if (isDisabled(col, row)) {
				triggerShake(col, row);
			} else {
				navigateTo(hrefs[col][row]);
			}
		},
	});

	// Refs for scroll targets
	let scrollContainer = $state<HTMLElement | null>(null);
	let cardsRow = $state<HTMLElement | null>(null);
	let cardRefs = $state<(HTMLElement | null)[]>([null, null, null, null, null]);
	// cardRefs: [0]=projects, [1]=events, [2]=shop, [3]=community, [4]=faq

	// Slide cards row so selected card is visible with a peek of the next card.
	// Use offsetLeft (layout position, unaffected by transform) to avoid mid-transition jitter.
	$effect(() => {
		const el = cardRefs[nav.col];
		if (el && scrollContainer && cardsRow) {
			const containerWidth = scrollContainer.clientWidth;

			// Walk up offsetParents to get position relative to cardsRow
			let elLeft = 0;
			let node: HTMLElement | null = el;
			while (node && node !== cardsRow) {
				elLeft += node.offsetLeft;
				node = node.offsetParent as HTMLElement | null;
			}

			const elWidth = el.offsetWidth;
			const totalWidth = cardsRow.scrollWidth;
			const maxShift = totalWidth - containerWidth;

			// If everything fits, no shift needed
			if (maxShift <= 0) {
				cardsRow.style.transform = `translateX(0px)`;
				return;
			}

			// Show a peek of the next card (60px) by offsetting center to the left,
			// and a peek of the previous card by offsetting to the right.
			const peekAmount = 60;
			const isFirst = nav.col === 0;
			const colCount = isAdmin ? 5 : 4;
			const isLast = nav.col === colCount - 1;

			let target;
			if (isFirst) {
				// First card: align to left edge
				target = 0;
			} else if (isLast) {
				// Last card: align to right edge
				target = maxShift;
			} else {
				// Middle cards: center but offset left to peek the next card
				target = elLeft - (containerWidth - elWidth) / 2 + peekAmount;
			}

			const clamped = Math.max(0, Math.min(target, maxShift));
			cardsRow.style.transform = `translateX(${-clamped}px)`;
		}
	});
</script>

<svelte:window onkeydown={(e) => { nav.handleKeydown(e); hasInteracted = true; }} onmousemove={() => { hasInteracted = true; }} />

{#if !hideCirc}
	<CircleIn />
{/if}

<div class="page-wrap">
	<div class="page-content">
		<!-- Header -->
		<div class="flex items-end gap-2 w-full shrink-0 exit-up enter-up" class:exiting={navigating} class:exit-right={exitRight} style:--exit-right-delay="0ms">
			<div class="w-[347.58px] h-[75.13px] shrink-0">
				<img src={logoSvg} alt="Horizon" class="w-full h-full block" />
			</div>
			<p class="font-cook text-[18px] font-semibold text-black m-0 whitespace-nowrap">
				<TextWave text={headerText} disabled={disableAnimations} />
			</p>
			<a href="https://hackclub.enterprise.slack.com/archives/C0AGKQ6K476" target="_blank" rel="noopener noreferrer" class="card slack-card ml-auto">
				<div class="flex flex-col">
					<p class="font-cook text-[20px] font-semibold text-black m-0 whitespace-nowrap leading-tight">Join 700+ teenagers at #horizons</p>
					<p class="font-bricolage text-[14px] font-semibold text-black/50 m-0 leading-tight">Open the Hack Club Slack</p>
				</div>
				<svg class="shrink-0" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
					<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>
				</svg>
			</a>
		</div>

		<!-- Scrollable Content -->
		<div class="scroll-wrapper" bind:this={scrollContainer}>
			<div class="cards-row" bind:this={cardsRow}>
				<!-- Left Column: Projects (top) + Events (bottom) -->
				<div class="left-col shrink-0" bind:this={cardRefs[0]}>
					<!-- Projects -->
					<div class="enter-up flex-1 min-h-0" class:exiting={navigating} class:exit-right={exitRight} style:--exit-delay="0ms" style:--enter-delay="50ms" style:--exit-right-delay="150ms">
						<a href="/app/projects" class="card nav-card projects-card"
							class:selected={nav.isSelected(0, 0)}
							onmouseenter={() => { if (!nav.usingKeyboard) nav.select(0, 0); }}
							onclick={(e) => { e.preventDefault(); navigateTo('/app/projects?back'); }}>
							<!-- Hammer/wrench icon background -->
							<div class="absolute -bottom-16 -right-16 text-white opacity-20" style="width: 120%; height: 120%;">
								<svg class="absolute bottom-0 right-0 w-full h-full" preserveAspectRatio="xMaxYMax meet" viewBox="0 0 565 535" fill="none" xmlns="http://www.w3.org/2000/svg">
									<path d="M450.306 58.616C453.771 58.0034 460.307 58.3883 463.913 58.6369C470.142 59.0663 473.643 66.5579 469.292 71.4413C465.802 75.3602 461.761 79.095 457.992 82.8662L435.298 105.557C432.024 108.822 425.157 114.82 422.707 118.95C422.495 119.311 422.02 122.007 422.111 122.377C423.212 126.895 428.321 131.018 431.596 134.294L445.186 147.888C450.32 153.039 455.752 158.885 461.157 163.726C463.168 165.53 465.938 165 468.456 164.659C472.09 162.044 478.62 155.218 482.162 151.71L505.239 128.796C508.856 125.168 514.994 118.216 519.342 116.251C530.052 116.886 529.304 123.579 529.117 132.104C528.581 150.861 520.713 168.66 507.198 181.674C494.852 193.374 478.658 200.803 461.548 201.549C455.316 201.972 449.194 201.071 442.99 200.734C432.774 200.18 428.829 204.945 422.327 211.476L411.024 222.778L379.091 254.287C371.245 262.101 363.231 270.337 355.26 277.991L466.445 384.009L498.003 414.078C503.661 419.431 509.397 424.811 514.97 430.255C516.032 431.527 517.85 433.177 518.062 434.824C518.553 438.626 517.466 440.596 514.801 443.303C511.764 446.393 508.503 449.533 505.35 452.648L488.662 469.256L476.592 481.272C472.159 485.681 470.716 488.283 464.597 490.231C462.795 489.662 461.143 489.273 459.741 487.985C456.152 484.682 452.748 481.137 449.319 477.668L433.698 462.002C415.998 444.376 398.389 426.66 380.873 408.847L328.216 356.053C319.942 347.778 310.334 338.612 302.468 330.131C298.156 335.235 288.012 344.76 282.914 349.845L245.753 387.071C240.568 392.275 235.126 397.515 230.154 402.84C224.261 409.153 226.543 420.198 226.751 428.175C226.995 437.489 226.096 444.534 223.247 453.429C211.782 484.845 183.873 504.46 149.78 502.357C143.539 501.971 138.776 496.557 142.174 490.639C144.244 487.033 149.366 482.704 152.491 479.589L175.165 456.947C179.459 452.698 183.938 448.449 188.06 444.029C189.029 442.875 190.029 441.689 190.204 440.147C190.821 434.711 184.498 429.905 180.903 426.307L169.011 414.368L158.045 403.345C155.32 400.616 151.359 395.755 147.33 395.299C145.682 395.233 142.98 396.574 141.837 397.678C127.542 411.493 113.684 425.793 99.4912 439.727C95.6673 443.482 90.5014 446.868 85.9814 441.852C82.6976 438.207 83.1575 431.662 83.3931 427.068C84.519 407.818 93.2315 389.8 107.62 376.962C120.643 365.291 137.616 359.298 155.01 359.008C161.342 358.9 175.147 361.789 180.528 357.8C186.243 353.564 192.926 346.126 198.234 340.897L238.244 301.32C244.046 295.589 250.318 288.97 256.237 283.529L183.959 211.042C172.476 199.429 159.842 187.254 148.716 175.479C164.367 159.134 181.662 143.232 197.073 126.951C199.833 129.199 201.977 131.799 204.54 134.163C207.789 137.162 210.936 140.214 214.142 143.248L258.132 185.227L294.057 219.48C296.429 221.766 305.773 230.258 307.489 232.54L358.662 181.383C363.526 176.518 382.344 158.818 384.54 154.441C387.273 148.99 386.222 142.163 386.018 136.294C385.866 131.907 385.662 127.355 386.04 122.977C387.24 109.093 393.139 94.7807 402.201 84.1266C414.219 69.995 431.618 60.0761 450.306 58.616Z" fill="currentColor"/>
									<path d="M202.615 32.3956L241.036 32.4489C247.182 32.4475 253.442 32.1796 259.571 32.4966C261.045 32.5727 262.9 32.7457 264.257 33.3414C268.672 35.2789 273.279 40.7917 276.916 44.0925C280.403 47.2556 284.02 50.3235 287.408 53.5867C289.303 55.4111 290.743 57.6005 290.735 60.316C290.721 63.7104 288.514 66.1919 285.402 67.3091C281.266 68.7952 256.227 67.9801 250.249 67.9702C247.255 67.9652 243.411 67.5988 240.551 68.4953C238.986 68.9856 237.62 70.1596 236.452 71.2779C228.434 78.9527 220.716 87.0216 212.818 94.8289L144.722 162.649L126.846 180.493C122.669 184.64 118.368 188.982 114.281 193.168C109.124 198.451 114.571 217.538 110.857 222.556C107.327 227.325 97.9797 234.672 93.1444 239.195C88.8313 243.14 83.7959 248.594 78.352 250.133C73.7984 249.01 73.6814 248.435 70.3408 245.224C64.0118 239.141 58.1276 232.649 52.0315 226.39L32.3125 206.335C29.1247 203.058 25.9162 199.803 22.6871 196.567C17.1282 190.953 12.3718 186.053 20.2987 179.36C23.6639 176.519 41.7277 157.977 44.7795 157.699C51.9383 157.046 64.2593 157.469 71.6366 157.519C74.7193 155.847 88.8564 141.316 92.5774 137.711L171.205 60.2992C176.674 54.9434 182.107 49.5518 187.504 44.1245C191.325 40.3182 197.361 33.1207 202.615 32.3956Z" fill="currentColor"/>
									<path d="M127.149 64.6041C127.372 64.5862 127.596 64.5729 127.82 64.5647C133.057 64.387 137.36 70.003 140.9 73.3669C136.473 78.2101 130.69 83.7063 125.978 88.3513C115.997 98.0139 106.1 107.763 96.2878 117.597L93.5025 120.281C90.4049 116.827 82.9349 111.17 85.1679 106.032C86.5266 102.906 92.8282 97.1025 95.4678 94.504C104.615 85.4992 113.471 76.3087 122.739 67.4494C124.146 66.104 125.387 65.3728 127.149 64.6041Z" fill="currentColor"/>
								</svg>
							</div>
							<div class="card-text z-10">
								<p class="font-cook text-[40px] font-semibold text-black m-0">PROJECTS</p>
								<p class="font-bricolage text-[24px] font-semibold text-black m-0 tracking-[0.24px]">
									CREATE AND SHIP YOUR PROJECTS
								</p>
							</div>
							{#if postOnboarding && nav.isSelected(0, 0)}
								<div class="card-popover">
									<p class="font-bricolage text-[16px] font-semibold text-black/70 m-0">{cardDescriptions['0-0']}</p>
								</div>
							{/if}
						</a>
					</div>

					<!-- Events -->
					<div class="enter-down flex-1 min-h-0" class:exiting={navigating} class:exit-right={exitRight} style:--exit-delay="30ms" style:--enter-delay="100ms" style:--exit-right-delay="150ms">
						<a href="/app/events" class="card nav-card events-half-card"
							class:selected={nav.isSelected(0, 1)}
							class:disabled={isDisabled(0, 1)}
							class:shaking={isShaking(0, 1)}
							onmouseenter={() => { if (!nav.usingKeyboard) nav.select(0, 1); }}
							onclick={(e) => { e.preventDefault(); if (isDisabled(0, 1)) triggerShake(0, 1); else navigateTo('/app/events'); }}
							onanimationend={() => { shakingKey = null; }}>
							<!-- Starburst background -->
							<div class="card-bg-icon" style="right: -60px; top: 50%; transform: translateY(-50%) rotate(130deg); height: 140%;">
								<svg class="w-full h-full" viewBox="0 0 462.191 348.83" fill="none" xmlns="http://www.w3.org/2000/svg">
									<path d="M462.191 174.415L368.982 196.212L415.83 279.962L329.164 236.143L327.669 333.165L265.904 257.94L231.095 348.83L196.287 257.94L134.522 333.165L133.027 236.143L46.3612 279.962L93.2084 196.212L0 174.415L93.2084 152.618L46.3612 68.8687L133.027 112.688L134.522 15.6656L196.287 90.8903L231.095 0L265.904 90.8903L327.669 15.6656L329.164 112.688L415.83 68.8687L368.982 152.618L462.191 174.415Z" fill="currentColor"/>
								</svg>
							</div>
							<div class="card-text z-10">
								<p class="font-cook text-[40px] font-semibold text-black m-0">EVENTS</p>
								<p class="font-bricolage text-[24px] font-semibold text-black m-0 tracking-[0.24px]">
									CHECK OUT HORIZONS EVENTS!
								</p>
							</div>
							{#if postOnboarding && nav.isSelected(0, 1)}
								<div class="card-popover">
									<p class="font-bricolage text-[16px] font-semibold text-black/70 m-0">{cardDescriptions['0-1']}</p>
								</div>
							{/if}
						</a>
					</div>
				</div>

				<!-- Middle Column -->
				<div class="middle-col shrink-0">
					<!-- Event / Nexus Card (informational, not navigable) -->
					<div class="event-card-wrapper enter-up flex-1" class:exiting={navigating} class:exit-right={exitRight} style:--exit-delay="30ms" style:--enter-delay="100ms" style:--exit-right-delay="150ms">
						<div class="card event-card relative" style="background-color: {pinnedEventConfig?.eventCard?.bgColor ?? '#fac393'}; {pinnedEventConfig?.eventCard?.bgImage ? `background-image: url(${pinnedEventConfig.eventCard.bgImage}); background-size: cover; background-position: center;` : ''}">
							{#if pinnedEventConfig?.eventCard?.gradient}
								<div class="event-card-gradient full-gradient" style="background: {pinnedEventConfig.eventCard.gradient};"></div>
							{/if}
							{#if pinnedEventConfig?.eventCard?.compactGradient}
								<div class="event-card-gradient compact-gradient" style="background: {pinnedEventConfig.eventCard.compactGradient};"></div>
							{/if}
							<!-- Full progress view -->
							<div class="full-progress">
								<p class="absolute top-4 right-5 font-cook text-[24px] font-semibold text-black m-0 z-10">PROGRESS</p>
								<div class="flex flex-col gap-3 w-full relative flex-1 min-h-0">
									<div class="flex-1 min-h-0 w-full">
										<img src={pinnedEventConfig?.logo ?? '/logos/nexus.webp'} alt={pinnedEventConfig?.name ?? 'Horizons'} class="h-full w-full object-contain object-left" />
									</div>
									<div class="card progress-card shrink-0">
										<div class="progress-bar">
											{#if approvedPct > 0}
												<div class="progress-segment" style="width: {approvedPct}%; background-color: {pinnedEventConfig?.progressBar?.approved ?? '#ffa936'};">
													<span class="progress-label">{approvedHours} HOURS APPROVED</span>
												</div>
											{/if}
											{#if completedPct > 0}
												<div class="progress-segment" style="width: {completedPct}%; background-color: {pinnedEventConfig?.progressBar?.completed ?? '#f86d95'};">
													<span class="progress-label">{completedHours - approvedHours} HOURS COMPLETED</span>
												</div>
											{/if}
											<div class="flex-1" style="background-color: {pinnedEventConfig?.progressBar?.remaining ?? '#46467c'};"></div>
										</div>
										<p class="font-bricolage text-[16px] font-semibold text-black m-0 text-left">
											{#if remainingHours > 0}
												{postOnboarding ? `WORK ${remainingHours} HOURS TO GET YOUR TICKET TO THE EVENT!` : `${remainingHours} HOURS TO GO (${targetHours} needed)`}
											{:else}
												GOAL REACHED!
											{/if}
										</p>
									</div>
								</div>
							</div>
							<!-- Compact progress view -->
							<div class="compact-progress">
								<img src={pinnedEventConfig?.logo ?? '/logos/nexus.webp'} alt={pinnedEventConfig?.name ?? 'Horizons'} class="compact-logo object-contain object-left shrink-0 relative" />
								<div class="text-right text-[24px] text-white tracking-[0.24px] relative">
									<p class="font-cook m-0">PROGRESS</p>
									<p class="font-bricolage font-semibold m-0">
										{#if remainingHours > 0}
											{remainingHours} hours to go!
										{:else}
											Goal reached!
										{/if}
									</p>
								</div>
							</div>
						</div>
					</div>

					<!-- Shop + Events Row -->
					<div class="bottom-row">
						<!-- Shop -->
						<div class="enter-down flex-1" class:exiting={navigating} class:exit-right={exitRight} style:--exit-delay="60ms" style:--enter-delay="150ms" style:--exit-right-delay="150ms">
							<a bind:this={cardRefs[2]} href="/app/shop" class="card nav-card shop-card"
								class:selected={nav.isSelected(1, 0)}
								onmouseenter={() => { if (!nav.usingKeyboard) nav.select(1, 0); }}
								onclick={(e) => { e.preventDefault(); navigateTo('/app/shop?back'); }}>
								<!-- Shop bag icon -->
								<div class="card-bg-icon" style="right: -10px; top: 50%; transform: translateY(-50%); width: 200px; height: 200px;">
									<svg class="w-full h-full" viewBox="0 0 300 300" fill="none" xmlns="http://www.w3.org/2000/svg">
										<path d="M150 0C199.706 0 240 40.2944 240 90H300V300H0V90H60C60 40.2944 100.294 0 150 0ZM150 36C120.177 36 96 60.1766 96 90H204C204 60.1766 179.823 36 150 36Z" fill="currentColor"/>
									</svg>
								</div>
								<div class="card-text z-10">
									<p class="font-cook text-[40px] font-semibold text-black m-0">SHOP</p>
									<p class="font-bricolage text-[24px] font-semibold text-black m-0 tracking-[0.24px]">
										BUY STUFF FOR YOURSELF!
									</p>
								</div>
								{#if postOnboarding && nav.isSelected(1, 0)}
									<div class="card-popover">
										<p class="font-bricolage text-[16px] font-semibold text-black/70 m-0">{cardDescriptions['1-0']}</p>
									</div>
								{/if}
							</a>
						</div>

						<!-- Community -->
						<div class="enter-down flex-1" class:exiting={navigating} class:exit-right={exitRight} style:--exit-delay="90ms" style:--enter-delay="200ms" style:--exit-right-delay="150ms">
							<a bind:this={cardRefs[3]} href="/app/community" class="card nav-card community-card"
								class:selected={nav.isSelected(2, 0)}
								onmouseenter={() => { if (!nav.usingKeyboard) nav.select(2, 0); }}
								onclick={(e) => { e.preventDefault(); navigateTo('/app/community'); }}>
								<div class="card-bg-icon" style="right: -20px; top: 50%; transform: translateY(-50%); width: 200px; height: 200px;">
									<img src={communitySvg} alt="" class="w-full h-full" />
								</div>
								<div class="card-text z-10">
									<p class="font-cook text-[40px] font-semibold text-black m-0">COMMUNITY</p>
									<p class="font-bricolage text-[24px] font-semibold text-black m-0 tracking-[0.24px]">
										SEE WHAT'S HAPPENING!
									</p>
								</div>
								{#if postOnboarding && nav.isSelected(2, 0)}
									<div class="card-popover">
										<p class="font-bricolage text-[16px] font-semibold text-black/70 m-0">{cardDescriptions['2-0']}</p>
									</div>
								{/if}
							</a>
						</div>
					</div>
				</div>

				<!-- FAQ (tall right card) -->
				<div class="enter-up shrink-0" class:exiting={navigating} class:exit-right={exitRight} style:--exit-delay="120ms" style:--enter-delay="250ms" style:--exit-right-delay="150ms">
					<a bind:this={cardRefs[4]} href="/faq?from=app" class="card nav-card faq-card"
						class:selected={nav.isSelected(3, 0)}
						class:shaking={isShaking(3, 0)}
						onmouseenter={() => { if (!nav.usingKeyboard) nav.select(3, 0); }}
						onanimationend={() => { shakingKey = null; }}>
						<!-- HUH icon -->
						<div class="card-bg-icon" style="right: 20px; top: 50%; transform: translateY(-50%); width: 145px; height: 145px;">
							<svg class="w-full h-full" viewBox="0 0 145 145" fill="none" xmlns="http://www.w3.org/2000/svg">
								<path fill-rule="evenodd" clip-rule="evenodd" d="M126.875 0C136.885 0 145 8.11484 145 18.125V126.875C145 136.885 136.885 145 126.875 145H18.125C8.11484 145 0 136.885 0 126.875V18.125C0 8.11484 8.11484 0 18.125 0H126.875ZM60.2625 94.1584V111.016H80.9253V94.1584H60.2625ZM73.531 33.8029C63.381 33.8029 55.0794 35.9418 48.6269 40.2193C42.1745 44.4968 39.167 51.4206 39.602 60.9904H58.1982C57.8358 57.6555 59.0679 55.0094 61.8954 53.0519C64.7953 51.0946 68.6738 50.1159 73.531 50.1159C77.736 50.1159 80.9993 50.659 83.3192 51.7465C85.7111 52.7614 86.9076 54.2478 86.908 56.2048C86.908 57.4368 86.6899 58.3799 86.2553 59.0324C85.8203 59.6849 84.9854 60.3739 83.7529 61.0989C82.593 61.7513 80.5274 62.7302 77.5556 64.0349C72.6985 66.1372 69.1095 68.2045 66.7895 70.2344C64.4695 72.1919 62.9815 74.2589 62.329 76.4339C61.6767 78.6088 61.3511 81.4731 61.3511 85.0251H79.9474C79.9474 83.7202 80.6366 82.4879 82.0139 81.328C83.3913 80.0955 86.0736 78.4638 90.0608 76.4339C93.8305 74.4765 96.7664 72.6629 98.8689 70.9955C101.044 69.2555 102.675 67.1885 103.763 64.796C104.85 62.4037 105.396 59.3956 105.396 55.7711C105.396 50.2612 103.728 45.8735 100.393 42.611C97.0586 39.3488 92.9979 37.0661 88.2133 35.761C83.4284 34.456 78.5335 33.803 73.531 33.8029Z" fill="currentColor"/>
							</svg>
						</div>
						<div class="card-text z-10">
							<p class="font-cook text-[40px] font-semibold text-black m-0">FAQ</p>
							<p class="font-bricolage text-[24px] font-semibold text-black m-0 tracking-[0.24px]">
								NEED HELP?
							</p>
						</div>
						{#if postOnboarding && nav.isSelected(3, 0)}
							<div class="card-popover">
								<p class="font-bricolage text-[16px] font-semibold text-black/70 m-0">{cardDescriptions['3-0']}</p>
							</div>
						{/if}
					</a>
				</div>

				<!-- Admin (only visible for admins) -->
				{#if isAdmin}
					<div class="enter-up shrink-0" class:exiting={navigating} class:exit-right={exitRight} style:--exit-delay="150ms" style:--enter-delay="300ms" style:--exit-right-delay="150ms">
						<a href="/admin" class="card nav-card admin-card"
							class:selected={nav.isSelected(4, 0)}
							onmouseenter={() => { if (!nav.usingKeyboard) nav.select(4, 0); }}
							onclick={(e) => { e.preventDefault(); window.location.href = '/admin'; }}>
							<!-- Shield icon -->
							<div class="card-bg-icon" style="right: 20px; top: 50%; transform: translateY(-50%); width: 145px; height: 145px;">
								<svg class="w-full h-full" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
									<path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 2.18l7 3.12v4.7c0 4.83-3.13 9.37-7 10.5-3.87-1.13-7-5.67-7-10.5V6.3l7-3.12zM10 12l-2-2-1.41 1.41L10 14.83l7-7L15.59 6.4 10 12z"/>
								</svg>
							</div>
							<div class="card-text z-10">
								<p class="font-cook text-[40px] font-semibold text-black m-0">ADMIN</p>
								<p class="font-bricolage text-[24px] font-semibold text-black m-0 tracking-[0.24px]">
									MANAGE HORIZONS
								</p>
							</div>
						</a>
					</div>
				{/if}
				</div>
		</div>

		<!-- Bottom Info Row -->
		<div class="info-row enter-down" class:exiting={navigating && !exitRight} style:--exit-delay="0ms" style:--enter-delay="300ms">
			<div class="card nav-hint-card" class:nav-hint-hidden={hasInteracted}>
				<div class="flex items-center gap-5">
					<p class="font-cook text-[24px] font-semibold text-black m-0 shrink-0 leading-none">USE</p>
					<InputPrompt type="WASD" />
					<p class="font-cook text-[24px] font-semibold text-black m-0 shrink-0 leading-none">OR</p>
					<InputPrompt type="mouse" />
					<p class="font-cook text-[24px] font-semibold text-black m-0 shrink-0 leading-none">TO NAVIGATE</p>
				</div>
			</div>

			{#if userName}
				<div class="card user-card">
					<p class="font-cook text-[24px] font-semibold text-black m-0">{userName}</p>
					{#if referralCode}
						<button
							class="refer-btn py-2 px-4 border-2 border-black rounded-lg bg-[#ffa936] font-bricolage text-base font-semibold text-black cursor-pointer"
							onclick={() => navigateTo('/app/refer?back', { exitRight: true })}
						>
							Refer a Friend
						</button>
					{/if}
					<button class="logout-btn" onclick={async () => { await api.POST('/api/user/auth/logout'); window.location.href = '/'; }} aria-label="Logout">
						<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
							<path d="M9 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V5C3 4.46957 3.21071 3.96086 3.58579 3.58579C3.96086 3.21071 4.46957 3 5 3H9" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
							<path d="M16 17L21 12L16 7" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
							<path d="M21 12H9" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
						</svg>
					</button>
				</div>
			{/if}
		</div>
	</div>
</div>

<style>
	/* Page layout — fill the absolute-positioned container exactly */
	.page-wrap {
		position: absolute;
		inset: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		overflow: hidden;
	}

	.page-content {
		display: flex;
		flex-direction: column;
		gap: 32px;
		width: 100%;
		height: 100%;
		max-height: 100%;
		padding: 32px 40px;
	}

	/* Scrollable cards area — only horizontal scroll, fills remaining vertical space */
	.scroll-wrapper {
		flex: 1;
		min-height: 0;
		width: 100%;
		overflow: visible;
	}

	.cards-row {
		display: flex;
		gap: 24px;
		align-items: stretch;
		height: 100%;
		width: max-content;
		min-width: 100%;
		transition: transform 0.4s cubic-bezier(0.25, 1, 0.5, 1);
	}

	/* Middle column layout */
	.middle-col {
		display: flex;
		flex-direction: column;
		gap: 24px;
		width: 812px;
		height: 100%;
	}

	.bottom-row {
		display: flex;
		gap: 24px;
		flex: 1;
		min-height: 0;
	}

	/* Info row */
	.info-row {
		display: flex;
		align-items: stretch;
		justify-content: space-between;
		width: 100%;
		flex-shrink: 0;
	}

	@media (max-height: 700px) {
		.page-content {
			padding-bottom: 32px;
		}
		.info-row {
			position: absolute;
			bottom: 32px;
			left: 40px;
			right: 40px;
			width: auto;
			z-index: 20;
		}
		.nav-hint-card.nav-hint-hidden {
			opacity: 0;
			transition: opacity 0.3s ease;
		}
	}

	/* Base card */
	.card {
		border: 4px solid black;
		border-radius: 20px;
		box-shadow: 4px 4px 0px 0px black;
		overflow: hidden;
		text-decoration: none;
		color: black;
	}

	/* Navigable cards get scale transition */
	.nav-card {
		display: block;
		position: relative;
		transition: transform var(--juice-duration) var(--juice-easing);
	}

	.nav-card.selected {
		transform: scale(var(--juice-scale));
		z-index: 10;
	}

	.card.disabled {
		cursor: not-allowed;
	}

	/* Card background icons */
	.card-bg-icon {
		position: absolute;
		color: white;
		opacity: 0.2;
		pointer-events: none;
	}

	/* Card text block — vertically centered */
	.card-text {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 20px;
		justify-content: center;
		height: 100%;
	}

	/* Card-specific styles */
	/* Left stacked column */
	.left-col {
		display: flex;
		flex-direction: column;
		gap: 24px;
		width: 471px;
		height: 100%;
	}

	.projects-card {
		position: relative;
		display: block;
		width: 100%;
		height: 100%;
		overflow: hidden;
		background-color: #ffa936;
	}

	.events-half-card {
		position: relative;
		display: block;
		width: 100%;
		height: 100%;
		overflow: hidden;
		background-color: #f86d95;
	}

	.event-card-wrapper {
		container-type: size;
	}

	.event-card {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		justify-content: flex-end;
		padding: 24px 24px 28px;
		height: 100%;
		overflow: hidden;
		background-color: #fac393;
	}

	.event-card-gradient {
		position: absolute;
		inset: 0;
		pointer-events: none;
	}

	.compact-gradient {
		display: none;
	}

	.full-progress {
		display: contents;
	}

	.compact-progress {
		display: none;
		align-items: center;
		justify-content: space-between;
		width: 100%;
		gap: 24px;
	}

	.compact-logo {
		height: auto;
		width: auto;
		max-height: calc(100cqh - 48px);
		max-width: 100%;
	}

	@container (max-height: 200px) {
		.full-progress {
			display: none;
		}
		.full-gradient {
			display: none;
		}
		.compact-gradient {
			display: block;
		}
		.compact-progress {
			display: flex;
		}
		.event-card {
			justify-content: center;
			padding: 24px;
		}
	}

	.progress-card {
		display: flex;
		flex-direction: column;
		gap: 8px;
		align-items: flex-start;
		justify-content: flex-end;
		padding: 16px;
		background-color: #f3e8d8;
	}

	.progress-bar {
		display: flex;
		width: 100%;
		height: 40px;
		border-radius: 4px;
		overflow: hidden;
	}

	.progress-segment {
		display: flex;
		align-items: flex-end;
		justify-content: flex-end;
		padding: 4px 4px 4px 8px;
	}

	.progress-label {
		font-family: 'Bricolage Grotesque', sans-serif;
		font-size: 12px;
		font-weight: 600;
		color: black;
		white-space: nowrap;
	}

	.shop-card {
		width: 100%;
		height: 100%;
		background-color: #6d9bf8;
	}

	.faq-card {
		width: 372px;
		height: 100%;
		background-color: #ff8b6f;
	}

	.admin-card {
		width: 372px;
		height: 100%;
		background-color: #5cb85c;
	}

	.community-card {
		width: 100%;
		height: 100%;
		background-color: #CA6DF8;
	}

	.slack-card {
		display: flex;
		align-items: center;
		gap: 16px;
		padding: 14px 20px;
		background-color: #f3e8d8;
		text-decoration: none;
		transition: transform var(--juice-duration) var(--juice-easing);
	}
	.slack-card:hover {
		transform: scale(var(--juice-scale));
	}

	.nav-hint-card {
		display: flex;
		align-items: center;
		padding: 20px;
		background-color: #f3e8d8;
		cursor: default;
	}

	.user-card {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 20px;
		background-color: #f3e8d8;
		cursor: default;
		overflow: visible;
	}

	.refer-btn {
		transition:
			background-color var(--selected-duration) ease,
			transform var(--juice-duration) var(--juice-easing);
		animation: white-blink 1.5s ease-in-out infinite;
	}
	@keyframes white-blink {
		0%, 100% { background-color: #fdd9a8; }
		50% { background-color: #fba74d; }
	}
	.refer-btn:hover {
		transform: scale(var(--juice-scale));
	}

	.logout-btn {
		background: none;
		border: none;
		cursor: pointer;
		color: black;
		opacity: 0.4;
		padding: 0;
		display: flex;
		align-items: center;
		transition: opacity 0.2s ease;
	}
	.logout-btn:hover {
		opacity: 1;
	}

	/* Entry / exit animations */
	@keyframes fly-in-top {
		from { transform: translateY(-120vh); }
		to   { transform: translateY(0); }
	}
	@keyframes fly-out-top {
		from { transform: translateY(0); }
		to   { transform: translateY(-120vh); }
	}
	@keyframes fly-in-left {
		from { transform: translateX(-120vw); }
		to   { transform: translateX(0); }
	}
	@keyframes fly-out-left {
		from { transform: translateX(0); }
		to   { transform: translateX(-120vw); }
	}
	@keyframes fly-in-right {
		from { transform: translateX(120vw); }
		to   { transform: translateX(0); }
	}
	@keyframes fly-out-right {
		from { transform: translateX(0); }
		to   { transform: translateX(120vw); }
	}

	.enter-up {
		animation: fly-in-top var(--enter-duration) var(--enter-easing) var(--enter-delay, 0ms) both;
	}
	.enter-up.exiting {
		animation: fly-out-top var(--exit-duration) var(--exit-easing) var(--exit-delay, 0ms) both;
	}


	@keyframes fly-in-bottom {
		from { transform: translateY(120vh); }
		to   { transform: translateY(0); }
	}
	@keyframes fly-out-bottom {
		from { transform: translateY(0); }
		to   { transform: translateY(120vh); }
	}

	.enter-down {
		animation: fly-in-bottom var(--enter-duration) var(--enter-easing) var(--enter-delay, 0ms) both;
	}
	.enter-down.exiting {
		animation: fly-out-bottom var(--exit-duration) var(--exit-easing) var(--exit-delay, 0ms) both;
	}

	/* Override: all cards fly out to the right with stagger */
	.exit-right.exiting {
		animation: fly-out-right var(--exit-duration) var(--exit-easing) var(--exit-right-delay, 0ms) both;
	}

	@keyframes shake {
		0%, 100% { translate: 0 0; }
		20%       { translate: -8px 0; }
		40%       { translate: 8px 0; }
		60%       { translate: -6px 0; }
		80%       { translate: 6px 0; }
	}

	.card.shaking {
		animation: shake 0.4s cubic-bezier(0.36, 0.07, 0.19, 0.97) both;
	}

	/* Post-onboarding popover */
	.card-popover {
		position: absolute;
		bottom: 12px;
		left: 12px;
		right: 12px;
		z-index: 20;
		background: #f3e8d8;
		border: 3px solid black;
		border-radius: 12px;
		box-shadow: 3px 3px 0px 0px black;
		padding: 12px 16px;
	}
</style>
