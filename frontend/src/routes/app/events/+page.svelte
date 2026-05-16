<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { api } from '$lib/api';
	import yaml from 'js-yaml';
	import type { EventConfig } from '$lib/events/types';
	import eventsRaw from '$lib/events/events.yaml?raw';
	import BackButton from '$lib/components/BackButton.svelte';
	import NavigationHint from '$lib/components/NavigationHint.svelte';
	import enterSvg from '$lib/assets/prompts/enter.svg';
	import clickSvg from '$lib/assets/prompts/click.svg';
	import { createListNav } from '$lib/nav/wasd.svelte';
	import { EXIT_DURATION } from '$lib';
	import { getCachedPinnedEvent, setCachedPinnedEvent } from '$lib/store/pinnedEventCache';

	const eventsMap = yaml.load(eventsRaw) as Record<string, EventConfig>;

	type ItemKey = 'ticket' | 'stipends' | 'shop' | 'change';
	type NavItem = {
		key: ItemKey;
		title: string;
		/** Lowercased label used when this item is referenced as another's prereq. */
		prereqLabel?: string;
		/** Another item key that must be purchased before this one is available. */
		prereq?: ItemKey;
		/** Which event color drives the fill when available/purchased. */
		colorKey?: 'primary' | 'secondary';
	};

	const navItems: NavItem[] = [
		{ key: 'ticket', title: 'Buy Ticket', prereqLabel: 'ticket', colorKey: 'primary' },
		{ key: 'stipends', title: 'Travel Stipends' },
		{ key: 'shop', title: 'Event Shop' },
		{ key: 'change', title: 'Change Event' },
	];

	const visibleNavItems = $derived(
		navItems.filter((it) => it.key !== 'shop' || hasEventShopItems)
	);

	let entered = $state(false);
	let navigating = $state(false);
	let backExiting = $state(false);

	let pinnedSlug = $state<string>('nexus');
	let pinnedConfig = $state<EventConfig>(eventsMap['nexus']);
	let pinnedImageUrl = $state<string | null>(null);
	let targetHours = $state(30);
	let completedHours = $state(0);
	let loading = $state(true);
	let shakingKey = $state<string | null>(null);
	// Purchase state mirrors /api/events/auth/:slug/ticket-status. ticketThreshold
	// gates eligibility on approved hours; ticketCost is the deducted price
	// (balance is allowed to go negative).
	let ticketThreshold = $state<number | null>(null);
	let ticketCost = $state<number | null>(null);
	let hasTicket = $state(false);
	let balance = $state(0);
	let approvedHours = $state(0);
	let purchasing = $state<ItemKey | null>(null);
	let purchaseError = $state<string | null>(null);
	let hasEventShopItems = $state(false);

	let showConfirmModal = $state(false);
	let confirmText = $state('');
	let confirmInputEl = $state<HTMLTextAreaElement | null>(null);

	// --- DEBUG: ?debug enables overlay to preview each event + each state ---
	type DebugApprovedState = '' | 'none' | '15' | '30' | '60';
	type DebugBoolState = '' | 'yes' | 'no';
	const debugMode = $derived(page.url.searchParams.has('debug'));
	let debugEventSlug = $state<string>('');
	let debugApprovedState = $state<DebugApprovedState>('');
	let debugTicketState = $state<DebugBoolState>('');
	let debugThreshold = $state<number | null>(15);
	let debugTicketCost = $state<number | null>(30);

	const effectiveSlug = $derived(debugEventSlug || pinnedSlug);
	const effectiveConfig = $derived(eventsMap[effectiveSlug] ?? pinnedConfig);
	const effectiveImage = $derived(
		debugEventSlug ? (eventsMap[debugEventSlug]?.eventCard?.bgImage ?? null) : pinnedImageUrl
	);
	const effectiveApprovedHours = $derived(
		debugApprovedState === '' ? approvedHours :
		debugApprovedState === 'none' ? 0 :
		Number(debugApprovedState)
	);
	const effectiveHasTicket = $derived(
		debugTicketState === '' ? hasTicket : debugTicketState === 'yes'
	);
	const effectiveTicketThreshold = $derived(debugMode && debugEventSlug ? debugThreshold : ticketThreshold);
	const effectiveTicketCost = $derived(debugMode && debugEventSlug ? debugTicketCost : ticketCost);
	const effectiveBalance = $derived(
		debugApprovedState === '' ? balance : effectiveApprovedHours
	);
	const effectiveCompletedHours = $derived(
		debugApprovedState === '' ? completedHours : Math.max(effectiveApprovedHours, completedHours)
	);

	// Confirmation modal — activated when the user picks "Buy Ticket". The user
	// must type REQUIRED_PHRASE verbatim before the Purchase button enables.
	const REQUIRED_PHRASE = $derived(
		`I understand that by purchasing a ticket I must complete the requirements for an invite (${effectiveTicketCost} hour requirement) by the event date to receive prizes for my logged hours and to be allowed entry, regardless of my travel arrangements.`
	);
	const phraseMatches = $derived(confirmText.trim() === REQUIRED_PHRASE);

	// Hydrate from cache for instant render.
	const cached = getCachedPinnedEvent();
	if (cached && eventsMap[cached.slug]) {
		pinnedSlug = cached.slug;
		pinnedConfig = eventsMap[cached.slug];
		targetHours = cached.hourCost;
	}

	onMount(() => {
		requestAnimationFrame(() => requestAnimationFrame(() => { entered = true; }));
	});

	async function hydrateTicketStatus(slug: string) {
		const res = await api
			.GET('/api/events/auth/{slug}/ticket-status' as any, {
				params: { path: { slug } },
			})
			.catch(() => null);
		const data = res?.data as
			| {
					ticketThreshold: number | null;
					ticketCost: number | null;
					hasTicket: boolean;
					balance: number;
					approvedHours: number;
				}
			| undefined;
		if (!data) return;
		ticketThreshold = data.ticketThreshold;
		ticketCost = data.ticketCost;
		hasTicket = data.hasTicket;
		balance = Math.round(data.balance * 10) / 10;
		approvedHours = Math.round(data.approvedHours * 10) / 10;
	}

	onMount(async () => {
		try {
			const [pinnedRes, totalRes, shopRes] = await Promise.all([
				api.GET('/api/events/auth/pinned-event' as any, {}).catch(() => null),
				api.GET('/api/hackatime/hours/total').catch(() => null),
				api.GET('/api/shop/items').catch(() => null),
			]);
			const pinned = (pinnedRes?.data as any)?.event ?? null;
			if (pinned?.slug && eventsMap[pinned.slug]) {
				pinnedSlug = pinned.slug;
				pinnedConfig = eventsMap[pinned.slug];
				const hourCost = pinned.hourCost ?? 30;
				targetHours = hourCost;
				pinnedImageUrl = pinned.imageUrl ?? null;
				setCachedPinnedEvent(pinned.slug, hourCost);
			} else if (!cached) {
				// User has no pinned event and nothing cached — send them to explore to pick one.
				goto('/app/events/explore');
				return;
			}
			if (totalRes?.data) {
				completedHours = Math.round(((totalRes.data as any).totalNowHackatimeHours ?? 0) * 10) / 10;
			}
			const shopItems = (shopRes?.data as unknown as { shopSlug: string }[] | undefined) ?? [];
			hasEventShopItems = shopItems.some((it) => it.shopSlug === pinnedSlug);
			await hydrateTicketStatus(pinnedSlug);
		} finally {
			loading = false;
		}
	});

	async function navigateTo(href: string, opts: { exitBack?: boolean } = {}) {
		navigating = true;
		if (opts.exitBack) backExiting = true;
		await new Promise(resolve => setTimeout(resolve, EXIT_DURATION + 350));
		goto(href);
	}

	const heroImage = $derived(effectiveImage ?? effectiveConfig.eventCard?.bgImage ?? null);
	const nexusOverride = $derived(effectiveConfig.nexusOverrideFlag === true);
	const gradientColor = $derived(
		nexusOverride ? '#000000' : (effectiveConfig.colors?.primary ?? '#fac393')
	);
	const subtitle = $derived(
		[effectiveConfig.locationText, effectiveConfig.dates].filter(Boolean).join(' • ')
	);
	const round1 = (n: number) => Number((Math.round(n * 10) / 10).toFixed(1));

	type ItemStatus = 'locked' | 'available' | 'purchased';

	function isPurchased(key: ItemKey): boolean {
		if (key === 'ticket') return effectiveHasTicket;
		return false;
	}

	function costFor(item: NavItem): number | null {
		if (item.key === 'ticket') return effectiveTicketCost;
		return null;
	}

	function statusOf(item: NavItem): ItemStatus {
		if (isPurchased(item.key)) return 'purchased';
		if (item.prereq && !isPurchased(item.prereq)) return 'locked';
		if (item.colorKey) {
			const cost = costFor(item);
			if (cost === null) return 'locked';
			// Threshold gates eligibility on approved hours earned; balance is
			// allowed to go negative so it doesn't gate purchase.
			if (
				effectiveTicketThreshold !== null &&
				effectiveApprovedHours < effectiveTicketThreshold
			) {
				return 'locked';
			}
		}
		return 'available';
	}

	function eventColor(key: 'primary' | 'secondary'): string {
		const fallback = key === 'primary' ? '#ffa936' : '#f86d95';
		return effectiveConfig.colors?.[key] ?? fallback;
	}

	function bgColorFor(item: NavItem, status: ItemStatus): string {
		if (status === 'locked') return '#b3b3b3';
		if (item.colorKey) return eventColor(item.colorKey);
		return '#f3e8d8';
	}

	/** Solid color mixed halfway between the item's own color and the deselected
	 *  cream — softer than the active fill so purchased items recede visually. */
	function purchasedBlend(item: NavItem): string {
		const own = item.colorKey ? eventColor(item.colorKey) : eventColor('primary');
		return `color-mix(in srgb, ${own} 50%, #f3e8d8)`;
	}

	function subtitleFor(item: NavItem, status: ItemStatus): string | null {
		if (status === 'purchased') return 'Purchased!';
		if (status === 'locked') {
			if (item.prereq && !isPurchased(item.prereq)) {
				const prereq = navItems.find((it) => it.key === item.prereq);
				return `Purchase ${prereq?.prereqLabel ?? prereq?.title ?? 'prereq'} first`;
			}
			const cost = costFor(item);
			if (item.colorKey && cost === null) return 'Not yet available';
			if (
				item.key === 'ticket' &&
				effectiveTicketThreshold !== null &&
				effectiveApprovedHours < effectiveTicketThreshold
			) {
				return `Earn ${effectiveTicketThreshold} approved hours to unlock`;
			}
			if (cost !== null) return `Purchase for ${cost} hours`;
			return null;
		}
		// available
		const cost = costFor(item);
		if (cost !== null) return `Purchase for ${cost} hours`;
		return null;
	}

	function triggerShake(key: string) {
		if (shakingKey === key) {
			shakingKey = null;
			requestAnimationFrame(() => { shakingKey = key; });
		} else {
			shakingKey = key;
		}
	}

	function activate(item: NavItem) {
		if (item.key === 'change') {
			navigateTo('/app/events/explore?back');
			return;
		}
		if (item.key === 'shop') {
			navigateTo('/app/events/shop');
			return;
		}
		if (item.key === 'stipends') {
			navigateTo('/app/events/shop/1?from=events');
			return;
		}
		// Already purchased → fully disabled, no feedback.
		if (isPurchased(item.key)) return;
		// Locked or in-flight → shake to indicate "no-op".
		if (statusOf(item) === 'locked' || purchasing) {
			triggerShake(item.key);
			return;
		}
		if (item.key === 'ticket') {
			openConfirmModal();
			return;
		}
		triggerShake(item.key);
	}

	function openConfirmModal() {
		confirmText = '';
		showConfirmModal = true;
		// Focus the textarea on next tick so the user can start typing immediately.
		requestAnimationFrame(() => confirmInputEl?.focus());
	}

	function closeConfirmModal() {
		if (purchasing) return;
		showConfirmModal = false;
		confirmText = '';
	}

	async function purchase() {
		if (debugMode) {
			// Debug mode just flips local state so the visual flow can be exercised
			// without hitting the backend.
			hasTicket = true;
			showConfirmModal = false;
			return;
		}
		purchasing = 'ticket';
		purchaseError = null;
		try {
			const res = await api.POST('/api/events/auth/{slug}/ticket' as any, {
				params: { path: { slug: pinnedSlug } },
			});
			const ok = (res as any).response?.ok;
			if (!ok) {
				const status = (res as any).response?.status;
				const errBody = (res as any).error as { message?: string | string[] } | undefined;
				const msg = Array.isArray(errBody?.message)
					? errBody!.message!.join(' ')
					: errBody?.message;
				purchaseError = msg ?? `Purchase failed (${status ?? 'network error'})`;
				triggerShake('ticket');
				return;
			}
			// Apply the success result from the POST response immediately. The POST
			// already returns the authoritative newBalance, so the UI reflects the
			// deduction even if the follow-up hydrate is slow or silently fails.
			hasTicket = true;
			const successData = (res as any).data as { newBalance?: number } | undefined;
			if (typeof successData?.newBalance === 'number') {
				balance = Math.round(successData.newBalance * 10) / 10;
			}
			// Re-sync for any other side effects (status changes, hour-cost flips).
			await hydrateTicketStatus(pinnedSlug);
			if (!hasTicket) {
				purchaseError = 'Purchase did not persist — please try again.';
				triggerShake('ticket');
			} else {
				showConfirmModal = false;
				confirmText = '';
			}
		} catch (err) {
			purchaseError = err instanceof Error ? err.message : 'Purchase failed';
			triggerShake('ticket');
		} finally {
			purchasing = null;
		}
	}

	const nav = createListNav({
		count: () => visibleNavItems.length,
		wheel: 80,
		onSelect: (i) => activate(visibleNavItems[i]),
		onEscape: () => navigateTo('/app?noanimate', { exitBack: true }),
	});

	// Once we know the user's approved hours, snap initial selection to the first
	// item the user can actually act on (skip locked + already-purchased) — but
	// only once, so the user's later navigation isn't yanked.
	let initialSelectionSet = false;
	$effect(() => {
		if (loading || initialSelectionSet) return;
		initialSelectionSet = true;
		const firstActionable = visibleNavItems.findIndex((it) => statusOf(it) === 'available');
		if (firstActionable >= 0) nav.selectedIndex = firstActionable;
	});

	// Suspend the page's keyboard nav while the confirm modal is open. Escape
	// closes the modal; Enter inside the textarea inserts a newline normally,
	// but Cmd/Ctrl+Enter submits when the phrase matches.
	function handleWindowKeydown(e: KeyboardEvent) {
		if (showConfirmModal) {
			if (e.key === 'Escape') {
				e.preventDefault();
				closeConfirmModal();
			} else if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && phraseMatches && !purchasing) {
				e.preventDefault();
				void purchase();
			}
			return;
		}
		nav.handleKeydown(e);
	}

	function handleWindowWheel(e: WheelEvent) {
		if (showConfirmModal) return;
		nav.handleWheel(e);
	}

	function actionLabelFor(item: NavItem, status: ItemStatus): string | null {
		if (item.key === 'change') return 'TO CHANGE';
		if (item.key === 'shop') return 'TO BROWSE';
		if (item.key === 'stipends') return 'TO VIEW';
		if (item.key !== 'ticket') return null;
		if (status !== 'available') return null;
		if (purchasing === item.key) return 'PURCHASING...';
		const cost = costFor(item);
		const noun = cost === 1 ? 'HOUR' : 'HOURS';
		return cost !== null ? `TO PURCHASE (${cost} ${noun})` : 'TO PURCHASE';
	}
</script>

<svelte:window onkeydown={handleWindowKeydown} onwheel={handleWindowWheel} />

<div class="relative size-full overflow-hidden">
	{#if heroImage}
		<div class="hero-bg" class:exiting={navigating} class:entered>
			<img src={heroImage} alt="" class="hero-img" />
			<div
				class="hero-gradient"
				style="background-image: linear-gradient(90deg, {gradientColor} 0%, {gradientColor}00 65%);"
			></div>
		</div>
	{:else}
		<div class="absolute inset-0" style="background-color: {gradientColor};"></div>
	{/if}

	<div class="content-grid">
		<!-- Event detail card -->
		<div
			class="event-card fly-up"
			class:exiting={navigating}
			class:exit-back={backExiting}
			class:nexus-override={nexusOverride}
			style:--enter-delay="0ms"
		>
			<div class="event-card-bg" aria-hidden="true">
				{#if heroImage}
					<img src={heroImage} alt="" class="event-card-img" />
				{/if}
				<div
					class="event-card-gradient"
					style="background-image: linear-gradient(180deg, {gradientColor}00 0%, {gradientColor} 62%);"
				></div>
			</div>
			<div class="event-card-details">
				<img
					src={effectiveConfig.logo}
					alt="{effectiveConfig.name} logo"
					class="event-card-logo"
					style="max-width: {effectiveConfig.logoMaxWidth ?? '285px'};"
				/>
				<div class="event-card-text">
					<p class="card-text-primary font-cook text-[20px] m-0 leading-normal">{effectiveConfig.name}</p>
					{#if subtitle}
						<p class="card-text-primary font-bricolage font-semibold text-[16px] m-0 leading-normal">
							{subtitle}
						</p>
					{/if}
				</div>
				<div class="progress-bar">
					<p class="progress-text-primary font-cook text-[16px] m-0 leading-normal whitespace-nowrap">
						{loading && !debugMode ? '— / —' : `${round1(effectiveCompletedHours)}/${round1(targetHours)}`} hours completed
					</p>
					{#if !loading || debugMode}
						<p class="progress-text-muted font-cook text-[12px] m-0 leading-normal whitespace-nowrap">
							{round1(effectiveBalance)} hour{round1(effectiveBalance) === 1 ? '' : 's'} available to spend
						</p>
					{/if}
				</div>
			</div>
		</div>

		<!-- Nav column -->
		<div class="nav-column" role="listbox" tabindex="-1">
			{#each visibleNavItems as item, i (item.key)}
				{@const selected = i === nav.selectedIndex}
				{@const status = statusOf(item)}
				{@const sub = subtitleFor(item, status)}
				{@const showPulse = status === 'available' && costFor(item) !== null}
				{@const tintCream = selected && status !== 'locked' && !item.colorKey}
				{@const action = actionLabelFor(item, status)}
				{@const showAction = selected && action !== null}
				{@const showSub = !showAction && sub !== null}
				<div
					class="nav-item-wrap fly-right"
					class:exiting={navigating}
					style:--enter-delay="{80 + i * 75}ms"
				>
					<button
						type="button"
						class="nav-item"
						class:selected
						class:locked={status === 'locked'}
						class:purchased={status === 'purchased'}
						class:pulsing={showPulse}
						class:shaking={shakingKey === item.key}
						style:background={status === 'purchased'
							? purchasedBlend(item)
							: tintCream
								? eventColor('primary')
								: bgColorFor(item, status)}
						onmouseenter={() => nav.select(i)}
						onclick={() => activate(item)}
						onanimationend={() => { if (shakingKey === item.key) shakingKey = null; }}
					>
						<p class="font-cook text-[32px] text-black m-0 leading-normal whitespace-nowrap">
							{item.title}
						</p>
						<div class="hint-row" class:visible={showAction}>
							<div class="hint-row-inner">
								<div class="action-hint">
									{#if purchasing !== item.key}
										<img
											src={nav.usingKeyboard ? enterSvg : clickSvg}
											alt={nav.usingKeyboard ? 'Enter' : 'Click'}
											class="action-key"
										/>
									{/if}
									<span class="font-cook text-[16px] text-black leading-none">{action ?? ''}</span>
								</div>
							</div>
						</div>
						<div class="hint-row" class:visible={showSub}>
							<div class="hint-row-inner">
								<p class="font-cook text-[16px] text-black m-0 leading-normal whitespace-nowrap">
									{sub ?? ''}
								</p>
							</div>
						</div>
					</button>
				</div>
			{/each}
		</div>
	</div>

	<BackButton
		onclick={() => navigateTo('/app?noanimate', { exitBack: true })}
		exiting={backExiting}
		flyIn={page.url.searchParams.has('back')}
	/>

	{#if purchaseError}
		<div class="purchase-error" role="alert">
			<p class="font-cook text-[18px] font-semibold text-black m-0">{purchaseError}</p>
			<button
				type="button"
				class="purchase-error-dismiss"
				onclick={() => (purchaseError = null)}
				aria-label="Dismiss"
			>
				×
			</button>
		</div>
	{/if}

	{#if showConfirmModal}
		<div class="fixed inset-0 z-50 flex items-center justify-center p-6" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
			<button
				type="button"
				class="absolute inset-0 bg-black/50 cursor-default"
				aria-label="Cancel ticket purchase"
				onclick={closeConfirmModal}
			></button>
			<div class="relative max-w-xl w-full max-h-[85vh] bg-[#f3e8d8] border-4 border-black rounded-[20px] p-6 shadow-[4px_4px_0px_0px_black] flex flex-col gap-3 overflow-y-auto">
				<p id="confirm-title" class="font-cook text-[28px] font-semibold text-black m-0">CONFIRM TICKET PURCHASE</p>

				<p class="font-bricolage text-[16px] text-black m-0">
					Please read the following rules and certify below:
				</p>
				<ul class="list-disc pl-6 flex flex-col gap-2">
					<li class="font-bricolage text-[15px] text-black m-0 leading-snug">
						I understand that by purchasing a ticket, if I do not complete the requirements for an invite (30 approved hours) by the event date, I will not be able to participate further in Horizons and use my hours to redeem prizes.
					</li>
					<li class="font-bricolage text-[15px] text-black m-0 leading-snug">
						I understand that I will not be allowed in to the event if I do not complete the requirements for an invite even if I already paid for a flight &amp; show up.
					</li>
				</ul>

				<p class="font-bricolage text-[16px] text-black m-0">
					Please type the following:
				</p>
				<blockquote class="font-bricolage text-[15px] text-black m-0 leading-snug italic bg-black/10 border-2 border-black rounded-lg p-3 select-none">
					{REQUIRED_PHRASE}
				</blockquote>

				<textarea
					bind:this={confirmInputEl}
					bind:value={confirmText}
					class="font-bricolage text-[15px] text-black w-full bg-white border-2 border-black rounded-lg p-3 resize-none outline-none transition-[border-color,box-shadow] duration-150 shadow-[3px_3px_0px_0px_black]"
					class:matches={phraseMatches}
					placeholder="Type the phrase above…"
					rows="4"
					disabled={!!purchasing}
					spellcheck="false"
					autocomplete="off"
				></textarea>

				<div class="flex flex-col-reverse sm:flex-row gap-2.5 justify-end mt-1">
					<button
						type="button"
						class="action-btn cancel py-2 px-5 border-2 border-black rounded-lg font-bricolage text-base font-semibold text-black"
						onclick={closeConfirmModal}
						disabled={!!purchasing}
					>
						CANCEL
					</button>
					<button
						type="button"
						class="action-btn purchase py-2 px-5 border-2 border-black rounded-lg font-bricolage text-base font-semibold text-black"
						class:disabled={!phraseMatches || !!purchasing}
						onclick={() => purchase()}
						disabled={!phraseMatches || !!purchasing}
					>
						{purchasing ? 'PURCHASING…' : `PURCHASE${effectiveTicketCost !== null ? ` (${effectiveTicketCost}h)` : ''}`}
					</button>
				</div>
			</div>
		</div>
	{/if}

	<div class="fade-wrap" class:entered class:exiting={navigating}>
		<NavigationHint
			segments={[
				{ type: 'text', value: 'USE' },
				{ type: 'input', value: 'WS' },
				{ type: 'text', value: 'OR' },
				{ type: 'input', value: 'mouse-scroll' },
				{ type: 'text', value: 'TO NAVIGATE' }
			]}
			position="bottom-right"
		/>
	</div>
</div>

{#if debugMode}
	<div class="debug-panel">
		<div class="debug-title">DEBUG · /app/events?debug</div>

		<div class="debug-section">
			<label class="debug-label" for="debug-event">Event</label>
			<select id="debug-event" class="debug-select" bind:value={debugEventSlug}>
				<option value="">— actual pinned ({pinnedSlug}) —</option>
				{#each Object.entries(eventsMap) as [slug, cfg] (slug)}
					<option value={slug}>{cfg.name} ({slug})</option>
				{/each}
			</select>
		</div>

		<div class="debug-section">
			<div class="debug-label">Approved hours</div>
			<div class="debug-buttons">
				<button class:active={debugApprovedState === ''} onclick={() => (debugApprovedState = '')}>actual ({round1(approvedHours)}h)</button>
				<button class:active={debugApprovedState === 'none'} onclick={() => (debugApprovedState = 'none')}>0h</button>
				<button class:active={debugApprovedState === '15'} onclick={() => (debugApprovedState = '15')}>15h</button>
				<button class:active={debugApprovedState === '30'} onclick={() => (debugApprovedState = '30')}>30h</button>
				<button class:active={debugApprovedState === '60'} onclick={() => (debugApprovedState = '60')}>60h</button>
			</div>
		</div>

		<div class="debug-section">
			<div class="debug-label">Has Ticket</div>
			<div class="debug-buttons">
				<button class:active={debugTicketState === ''} onclick={() => (debugTicketState = '')}>actual ({hasTicket ? 'yes' : 'no'})</button>
				<button class:active={debugTicketState === 'no'} onclick={() => (debugTicketState = 'no')}>no</button>
				<button class:active={debugTicketState === 'yes'} onclick={() => (debugTicketState = 'yes')}>yes</button>
			</div>
		</div>

		{#if debugEventSlug}
			<div class="debug-section">
				<div class="debug-label">Mock costs (only when overriding event)</div>
				<div class="debug-buttons">
					<button class:active={debugThreshold !== null} onclick={() => (debugThreshold = debugThreshold === null ? 15 : null)}>
						Threshold: {debugThreshold === null ? 'null' : `${debugThreshold}h`}
					</button>
					<button class:active={debugTicketCost !== null} onclick={() => (debugTicketCost = debugTicketCost === null ? 30 : null)}>
						Ticket: {debugTicketCost === null ? 'null' : `${debugTicketCost}h`}
					</button>
				</div>
			</div>
		{/if}

		<div class="debug-section debug-readout">
			<div>slug: {effectiveSlug}{debugEventSlug ? ' (debug)' : ''}</div>
			<div>approved: {round1(effectiveApprovedHours)}h{debugApprovedState ? ' (debug)' : ''} · balance: {round1(effectiveBalance)}h</div>
			<div>threshold: {effectiveTicketThreshold === null ? 'null' : `${effectiveTicketThreshold}h`} · ticketCost: {effectiveTicketCost === null ? 'null' : `${effectiveTicketCost}h`}</div>
			<div>completed: {round1(effectiveCompletedHours)}h / target: {round1(targetHours)}h</div>
			<div class="debug-swatch-row">primary: <span class="swatch" style="background: {eventColor('primary')};"></span><span>{eventColor('primary')}</span></div>
			<div class="debug-swatch-row">secondary: <span class="swatch" style="background: {eventColor('secondary')};"></span><span>{eventColor('secondary')}</span></div>
			{#each navItems as item (item.key)}
				<div>{item.title}: {statusOf(item)}</div>
			{/each}
		</div>
	</div>
{/if}

<style>
	.hero-bg {
		position: absolute;
		inset: 0;
		overflow: hidden;
		opacity: 0;
	}
	.hero-bg.entered {
		opacity: 1;
		transition: opacity 0.4s ease;
	}
	.hero-bg.exiting {
		opacity: 0;
		transition: opacity 0.3s ease;
	}
	.hero-img {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
		transform: scale(1.05);
		transform-origin: center;
		will-change: transform;
		animation: bg-drift 14s ease-in-out infinite alternate;
	}
	.hero-gradient {
		position: absolute;
		inset: 0;
		pointer-events: none;
	}
	@keyframes bg-drift {
		from { transform: scale(1.05) translate(-1.5%, 0.8%); }
		to   { transform: scale(1.05) translate(1.5%, -0.8%); }
	}
	@media (prefers-reduced-motion: reduce) {
		.hero-img { animation: none; }
	}

	.content-grid {
		position: absolute;
		inset: 0;
		display: grid;
		grid-template-columns: 459px 508px;
		gap: 37px;
		justify-content: center;
		align-content: center;
		z-index: 2;
	}

	/* Event detail card */
	.event-card {
		--card-text: black;
		--progress-bg: #f3e8d8;
		--progress-border: black;
		--progress-shadow: black;
		--progress-text: black;
		--progress-text-muted: rgba(0, 0, 0, 0.6);
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: stretch;
		justify-content: flex-end;
		width: 459px;
		height: 507px;
		padding: 30px;
		border: 4px solid black;
		border-radius: 20px;
		box-shadow: 4px 4px 0px 0px black;
		/* Match border so any subpixel seam under the bg image blends in. */
		background-color: black;
		overflow: clip;
		text-align: left;
	}
	.event-card.nexus-override {
		--card-text: white;
		--progress-bg: black;
		--progress-border: white;
		--progress-shadow: white;
		--progress-text: white;
		--progress-text-muted: rgba(255, 255, 255, 0.6);
	}
	.card-text-primary {
		color: var(--card-text);
	}
	.progress-text-primary {
		color: var(--progress-text);
	}
	.progress-text-muted {
		color: var(--progress-text-muted);
	}
	.event-card-bg {
		position: absolute;
		inset: 0;
		pointer-events: none;
	}
	.event-card-img {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
		transform-origin: center;
		will-change: transform;
		animation: bg-drift 12s ease-in-out infinite alternate;
	}
	.event-card-gradient {
		position: absolute;
		inset: 0;
	}
	.event-card-details {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 12px;
		width: 100%;
	}
	.event-card-logo {
		display: block;
		height: 77.573px;
		width: auto;
		object-fit: contain;
		object-position: left;
	}
	.event-card-text {
		display: flex;
		flex-direction: column;
		gap: 4px;
		align-items: flex-start;
	}
	.progress-bar {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		width: 100%;
		padding: 16px;
		border: 4px solid var(--progress-border);
		border-radius: 20px;
		box-shadow: 4px 4px 0px 0px var(--progress-shadow);
		background-color: var(--progress-bg);
		overflow: clip;
	}

	/* Nav column */
	.nav-column {
		display: flex;
		flex-direction: column;
		gap: 20px;
		width: 508px;
		height: 461px;
		align-self: center;
		justify-self: start;
	}
	.nav-item-wrap {
		flex: 1 0 0;
		min-height: 0;
		width: 100%;
		display: flex;
	}
	.nav-item {
		flex: 1 0 0;
		min-height: 0;
		width: 100%;
		display: flex;
		flex-direction: column;
		gap: 4px;
		align-items: center;
		justify-content: center;
		padding: 16px;
		border: 4px solid black;
		border-radius: 20px;
		box-shadow: 4px 4px 0px 0px black;
		text-align: center;
		cursor: pointer;
		outline: none;
		overflow: clip;
		transition: transform var(--juice-duration) var(--juice-easing), background-color var(--selected-duration) ease;
	}
	.nav-item.selected {
		transform: scale(var(--juice-scale));
		z-index: 5;
	}
	.nav-item.locked {
		cursor: not-allowed;
	}
	.nav-item.purchased {
		cursor: default;
	}
	.action-hint {
		display: inline-flex;
		align-items: center;
		gap: 8px;
	}
	.action-key {
		height: 24px;
		width: auto;
		display: block;
	}
	/* CSS-only height animation via grid-template-rows: 0fr ↔ 1fr, plus opacity
	   so the content fades out instead of snapping at the moment overflow
	   clipping kicks in. Same pattern as the events explore page's PIN/UNPIN
	   reveal. */
	.hint-row {
		display: grid;
		grid-template-rows: 0fr;
		opacity: 0;
		transition: grid-template-rows 0.18s ease, opacity 0.18s ease;
		width: 100%;
	}
	.hint-row.visible {
		grid-template-rows: 1fr;
		opacity: 1;
	}
	.hint-row-inner {
		min-height: 0;
		overflow: hidden;
		display: flex;
		justify-content: center;
	}

	/* Per-card staggered fly-in */
	@keyframes fly-in-right {
		from { transform: translateX(120vw); }
		to   { transform: translateX(0); }
	}
	@keyframes fly-out-right {
		from { transform: translateX(0); }
		to   { transform: translateX(120vw); }
	}
	@keyframes fly-in-up {
		from { transform: translateY(120vh); }
		to   { transform: translateY(0); }
	}
	@keyframes fly-out-down {
		from { transform: translateY(0); }
		to   { transform: translateY(120vh); }
	}

	.fly-right {
		animation: fly-in-right var(--enter-duration) var(--enter-easing) var(--enter-delay, 0ms) both;
	}
	.fly-right.exiting {
		animation: fly-out-right var(--exit-duration) var(--exit-easing) var(--enter-delay, 0ms) both;
	}
	.fly-up {
		animation: fly-in-up var(--enter-duration) var(--enter-easing) var(--enter-delay, 0ms) both;
	}
	.fly-up.exiting {
		animation: fly-out-down var(--exit-duration) var(--exit-easing) var(--enter-delay, 0ms) both;
	}

	.fade-wrap {
		opacity: 0;
	}
	.fade-wrap.entered {
		opacity: 1;
		transition: opacity var(--enter-duration) ease;
	}
	.fade-wrap.exiting {
		opacity: 0;
		transition: opacity 250ms ease;
	}

	@keyframes shake {
		0%, 100% { translate: 0 0; }
		20%       { translate: -8px 0; }
		40%       { translate: 8px 0; }
		60%       { translate: -6px 0; }
		80%       { translate: 6px 0; }
	}
	.nav-item.shaking {
		animation: shake 0.4s cubic-bezier(0.36, 0.07, 0.19, 0.97) both;
	}

	@keyframes pulse-bright {
		0%, 100% { filter: brightness(1); }
		50%      { filter: brightness(1.18); }
	}
	.nav-item.pulsing:not(.shaking) {
		animation: pulse-bright 1.4s ease-in-out infinite;
	}

	/* Transient error popup near the top, similar to the EVENT PINNED feedback. */
	.purchase-error {
		position: absolute;
		top: 24px;
		left: 50%;
		transform: translateX(-50%);
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 14px 20px;
		background: #f86d95;
		border: 4px solid black;
		border-radius: 16px;
		box-shadow: 4px 4px 0px 0px black;
		z-index: 30;
		max-width: 80%;
	}
	.purchase-error-dismiss {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		border: 3px solid black;
		border-radius: 50%;
		background: white;
		font: 600 18px/1 ui-sans-serif, system-ui;
		color: black;
		cursor: pointer;
		padding: 0;
	}

	/* Match .action-btn pattern from /app/projects/[id] using the global juice
	   variables (--juice-scale, --juice-easing, etc.) so modal buttons feel
	   native to the rest of the app. Purchase stays orange when enabled,
	   cancel stays cream — only Purchase shifts color on hover. */
	.action-btn {
		background-color: #f3e8d8;
		cursor: pointer;
		transition:
			background-color var(--selected-duration) ease,
			transform var(--juice-duration) var(--juice-easing);
	}
	.action-btn.purchase {
		background-color: #ffa936;
	}
	.action-btn.purchase.disabled {
		background-color: rgba(204, 204, 204, 0.6);
		cursor: not-allowed;
	}
	.action-btn:disabled {
		cursor: not-allowed;
	}
	@media (hover: hover) {
		.action-btn:not(:disabled):hover {
			transform: scale(var(--juice-scale));
		}
	}

	textarea.matches:focus {
		border-color: #ffa936;
		box-shadow: 3px 3px 0px 0px #ffa936;
	}

	/* Debug overlay (?debug) */
	.debug-panel {
		position: fixed;
		bottom: 16px;
		right: 16px;
		z-index: 9999;
		min-width: 320px;
		max-width: 380px;
		display: flex;
		flex-direction: column;
		gap: 12px;
		padding: 14px 16px;
		background: rgba(20, 20, 20, 0.92);
		color: #f5f5f5;
		border: 2px solid #ffa936;
		border-radius: 12px;
		font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
		font-size: 12px;
		line-height: 1.4;
		box-shadow: 0 6px 20px rgba(0, 0, 0, 0.4);
	}
	.debug-title {
		font-weight: 700;
		letter-spacing: 0.06em;
		color: #ffa936;
	}
	.debug-section {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.debug-label {
		font-size: 11px;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: #aaa;
	}
	.debug-select {
		background: #2a2a2a;
		color: #f5f5f5;
		border: 1px solid #444;
		border-radius: 6px;
		padding: 6px 8px;
		font: inherit;
	}
	.debug-buttons {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
	}
	.debug-buttons button {
		background: #2a2a2a;
		color: #f5f5f5;
		border: 1px solid #444;
		border-radius: 6px;
		padding: 4px 8px;
		font: inherit;
		cursor: pointer;
	}
	.debug-buttons button:hover {
		border-color: #ffa936;
	}
	.debug-buttons button.active {
		background: #ffa936;
		color: #1a1a1a;
		border-color: #ffa936;
		font-weight: 600;
	}
	.debug-readout {
		gap: 2px;
		font-size: 11px;
		color: #ddd;
		padding-top: 6px;
		border-top: 1px dashed #444;
	}
	.debug-swatch-row {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.swatch {
		display: inline-block;
		width: 14px;
		height: 14px;
		border: 1px solid #555;
		border-radius: 3px;
	}
</style>
