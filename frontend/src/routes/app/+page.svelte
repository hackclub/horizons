<script lang="ts">
	import CircleIn from '$lib/components/anim/CircleIn.svelte';
	import TextWave from '$lib/components/TextWave.svelte';
	import CommunityEventsCard from '$lib/components/CommunityEventsCard.svelte';
	import ProjectsCard from '$lib/components/ProjectsCard.svelte';
	import EventsCard from '$lib/components/EventsCard.svelte';
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
		"IT'S! TIME! TO! COOK!",
	];
	const headerText = phrases[Math.floor(Math.random() * phrases.length)];

	let disableAnimations = false;
	let hideCirc = $state(page.url.searchParams.has('noanimate') || disableAnimations);

	// Post-onboarding popovers
	let postOnboarding = $state(page.url.searchParams.has('post-onboarding'));

	const cardDescriptions: Record<string, string> = {
		'0-0': 'See what\'s coming up in the community!',
		'1-0': 'Create projects, track your progress, and submit them for review!',
		'1-1': 'Check out upcoming Horizons events!',
		'2-0': 'Spend your approved hours on rewards!',
		'3-0': 'Check out online events we\'re running for the community!',
		'4-0': 'Got questions? Find answers here.',
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

	const round1 = (n: number) => Number((Math.round(n * 10) / 10).toFixed(1));
	let approvedDisplay = $derived(round1(approvedHours));
	let completedMinusApprovedHours = $derived(round1(Math.max(0, completedHours - approvedHours)));
	let remainingHours = $derived(round1(Math.max(0, targetHours - completedHours)));
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
		['/app/community'],
		['/app/projects?back', '/app/events'],
		['/app/shop?back'],
		['/app/community'],
		['/faq?from=app'],
		['/admin'],
	];

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

	let ceFocusedEventId = $state<string | null>(null);

	const nav = createGridNav({
		columns: () => isAdmin ? [1, 2, 1, 1, 1, 1] : [1, 2, 1, 1, 1],
		onSelect: (col, row) => {
			if (isDisabled(col, row)) {
				triggerShake(col, row);
			} else if (col === 0 && ceFocusedEventId) {
				navigateTo(`/app/community?event=${encodeURIComponent(ceFocusedEventId)}`);
			} else {
				navigateTo(hrefs[col][row]);
			}
		},
	});

	// Refs for scroll targets (index = nav column)
	let scrollContainer = $state<HTMLElement | null>(null);
	let cardsRow = $state<HTMLElement | null>(null);
	let cardRefs = $state<(HTMLElement | null)[]>([null, null, null, null, null, null]);

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
			const colCount = isAdmin ? 6 : 5;
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
					<p class="font-cook text-[20px] font-semibold text-black m-0 whitespace-nowrap leading-tight">Join 1000+ teenagers at #horizons</p>
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
				<!-- Community Events (preview card, leftmost) -->
				<div class="enter-up shrink-0" class:exiting={navigating} class:exit-right={exitRight} style:--exit-delay="0ms" style:--enter-delay="0ms" style:--exit-right-delay="150ms">
					<CommunityEventsCard
						bind:element={cardRefs[0]}
						bind:focusedEventId={ceFocusedEventId}
						selected={nav.isSelected(0, 0)}
						postOnboarding={postOnboarding}
						description={cardDescriptions['0-0']}
						onmouseenter={() => { if (!nav.usingKeyboard) nav.select(0, 0); }}
						onclick={(e) => { e.preventDefault(); navigateTo('/app/community'); }}
						onEventClick={(id) => navigateTo(`/app/community?event=${encodeURIComponent(id)}`)}
					/>
				</div>

				<!-- Projects (top) + Events (bottom) -->
				<div class="left-col shrink-0" bind:this={cardRefs[1]}>
					<!-- Projects -->
					<div class="enter-up flex-1 min-h-0" class:exiting={navigating} class:exit-right={exitRight} style:--exit-delay="0ms" style:--enter-delay="50ms" style:--exit-right-delay="150ms">
						<ProjectsCard
							selected={nav.isSelected(1, 0)}
							postOnboarding={postOnboarding}
							description={cardDescriptions['1-0']}
							onmouseenter={() => { if (!nav.usingKeyboard) nav.select(1, 0); }}
							onclick={(e) => { e.preventDefault(); navigateTo('/app/projects?back'); }}
						/>
					</div>

					<!-- Events -->
					<div class="enter-down flex-1 min-h-0" class:exiting={navigating} class:exit-right={exitRight} style:--exit-delay="30ms" style:--enter-delay="100ms" style:--exit-right-delay="150ms">
						<EventsCard
							selected={nav.isSelected(1, 1)}
							disabled={isDisabled(1, 1)}
							shaking={isShaking(1, 1)}
							postOnboarding={postOnboarding}
							description={cardDescriptions['1-1']}
							onmouseenter={() => { if (!nav.usingKeyboard) nav.select(1, 1); }}
							onclick={(e) => { e.preventDefault(); if (isDisabled(1, 1)) triggerShake(1, 1); else navigateTo('/app/events'); }}
							onanimationend={() => { shakingKey = null; }}
						/>
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
								<p class="absolute top-4 right-5 font-cook text-[24px] font-semibold text-black m-0 z-10" style="-webkit-text-stroke: 8px #f3e8d8; paint-order: stroke fill;">PROGRESS</p>
								<div class="flex flex-col gap-3 w-full relative flex-1 min-h-0">
									<div class="flex-1 min-h-0 w-full">
										<img src={pinnedEventConfig?.logo ?? '/logos/nexus.webp'} alt={pinnedEventConfig?.name ?? 'Horizons'} class="h-full w-full object-contain object-left" />
									</div>
									<div class="card progress-card shrink-0">
										<div class="progress-bar">
											{#if approvedPct > 0}
												<div class="progress-segment" style="width: {approvedPct}%; background-color: {pinnedEventConfig?.progressBar?.approved ?? '#ffa936'};">
													<span class="progress-label">{approvedDisplay} HOURS APPROVED</span>
												</div>
											{/if}
											{#if completedPct > 0}
												<div class="progress-segment" style="width: {completedPct}%; background-color: {pinnedEventConfig?.progressBar?.completed ?? '#f86d95'};">
													<span class="progress-label">{completedMinusApprovedHours} HOURS COMPLETED</span>
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
								class:selected={nav.isSelected(2, 0)}
								onmouseenter={() => { if (!nav.usingKeyboard) nav.select(2, 0); }}
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
								{#if postOnboarding && nav.isSelected(2, 0)}
									<div class="card-popover">
										<p class="font-bricolage text-[16px] font-semibold text-black/70 m-0">{cardDescriptions['2-0']}</p>
									</div>
								{/if}
							</a>
						</div>

						<!-- Community -->
						<div class="enter-down flex-1" class:exiting={navigating} class:exit-right={exitRight} style:--exit-delay="90ms" style:--enter-delay="200ms" style:--exit-right-delay="150ms">
							<a bind:this={cardRefs[3]} href="/app/community" class="card nav-card community-card"
								class:selected={nav.isSelected(3, 0)}
								onmouseenter={() => { if (!nav.usingKeyboard) nav.select(3, 0); }}
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
								{#if postOnboarding && nav.isSelected(3, 0)}
									<div class="card-popover">
										<p class="font-bricolage text-[16px] font-semibold text-black/70 m-0">{cardDescriptions['3-0']}</p>
									</div>
								{/if}
							</a>
						</div>
					</div>
				</div>

				<!-- FAQ (tall right card) -->
				<div class="enter-up shrink-0" class:exiting={navigating} class:exit-right={exitRight} style:--exit-delay="120ms" style:--enter-delay="250ms" style:--exit-right-delay="150ms">
					<a bind:this={cardRefs[4]} href="/faq?from=app" class="card nav-card faq-card"
						class:selected={nav.isSelected(4, 0)}
						class:shaking={isShaking(4, 0)}
						onmouseenter={() => { if (!nav.usingKeyboard) nav.select(4, 0); }}
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
						{#if postOnboarding && nav.isSelected(4, 0)}
							<div class="card-popover">
								<p class="font-bricolage text-[16px] font-semibold text-black/70 m-0">{cardDescriptions['4-0']}</p>
							</div>
						{/if}
					</a>
				</div>

				<!-- Admin (only visible for admins) -->
				{#if isAdmin}
					<div class="enter-up shrink-0" class:exiting={navigating} class:exit-right={exitRight} style:--exit-delay="150ms" style:--enter-delay="300ms" style:--exit-right-delay="150ms">
						<a bind:this={cardRefs[5]} href="/admin" class="card nav-card admin-card"
							class:selected={nav.isSelected(5, 0)}
							onmouseenter={() => { if (!nav.usingKeyboard) nav.select(5, 0); }}
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
		height: clamp(32px, 6cqh, 40px);
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
