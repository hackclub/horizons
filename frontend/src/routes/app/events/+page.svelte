<script lang="ts">
	import { tick, onMount } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { api } from '$lib/api';
	import yaml from 'js-yaml';
	import type { EventConfig } from '$lib/events/types';
	import eventsRaw from '$lib/events/events.yaml?raw';
	import InputPrompt from '$lib/components/InputPrompt.svelte';
	import NavigationHint from '$lib/components/NavigationHint.svelte';
	import TurbulentImage from '$lib/components/TurbulentImage.svelte';
	import { createListNav } from '$lib/nav/wasd.svelte';
	import type { components } from '$lib/api';
	import { EXIT_DURATION } from '$lib';
	import BackButton from '$lib/components/BackButton.svelte';
	import { setCachedPinnedEvent, clearCachedPinnedEvent } from '$lib/store/pinnedEventCache';

	type EventResponse = components['schemas']['EventResponse'];

	interface MergedEvent {
		slug: string;
		config: EventConfig;
		api: EventResponse | null;
	}

	const eventsMap = yaml.load(eventsRaw) as Record<string, EventConfig>;

	let entered = $state(false);
	let navigating = $state(false);
	let backExiting = $state(false);

	onMount(() => {
		requestAnimationFrame(() => requestAnimationFrame(() => { entered = true; }));
	});

	async function navigateTo(href: string, opts: { exitBack?: boolean } = {}) {
		navigating = true;
		if (opts.exitBack) backExiting = true;
		await new Promise(resolve => setTimeout(resolve, EXIT_DURATION + 350));
		goto(href);
	}

	let apiEvents = $state<EventResponse[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let pinning = $state(false);
	let pinnedSlug = $state<string | null>(null);
	let pinnedDismissing = $state(false);
	let pinnedAction = $state<'pinned' | 'unpinned'>('pinned');
	let currentPinnedSlug = $state<string | null>(null);

	onMount(async () => {
		try {
			const [eventsRes, pinnedRes] = await Promise.all([
				api.GET('/api/events' as any, {}),
				api.GET('/api/events/auth/pinned-event' as any, {}).catch(() => null)
			]);
			if (eventsRes.data && Array.isArray(eventsRes.data)) {
				apiEvents = eventsRes.data;
			}
			if (pinnedRes?.data) {
				currentPinnedSlug = (pinnedRes.data as any).event?.slug ?? null;
			}
		} catch {
			error = 'Failed to load events';
		} finally {
			loading = false;
		}
	});

	const events = $derived<MergedEvent[]>(
		Object.entries(eventsMap)
			.map(([slug, config]) => {
				const apiEvent = apiEvents.find((e) => e.slug === slug) ?? null;
				return { slug, config, api: apiEvent };
			})
			.filter((e) => e.api !== null || apiEvents.length === 0)
	);

	let scrollOffset = $state(0);
	let listEl: HTMLDivElement;
	let clickWasSelected = false;

	const nav = createListNav({
		count: () => events.length,
		wheel: 80,
		onChange: () => updateScroll(),
		onEscape: () => navigateTo('/app?noanimate', { exitBack: true }),
		onSelect: (i) => {
			const event = events[i];
			if (event) togglePin(event.slug);
		},
	});

	function togglePin(slug: string) {
		if (pinning) return;
		pinning = true;

		const wasAlreadyPinned = currentPinnedSlug === slug;
		pinnedAction = wasAlreadyPinned ? 'unpinned' : 'pinned';
		currentPinnedSlug = wasAlreadyPinned ? null : slug;
		pinnedSlug = slug;
		pinnedDismissing = false;
		setTimeout(() => { pinnedDismissing = true; }, 1500);
		setTimeout(() => { pinnedSlug = null; pinnedDismissing = false; pinning = false; }, 2500);

		if (wasAlreadyPinned) {
			clearCachedPinnedEvent();
			api.DELETE('/api/events/auth/pinned-event' as any, {}).catch(() => {});
		} else {
			const eventApi = apiEvents.find((e) => e.slug === slug);
			setCachedPinnedEvent(slug, (eventApi as any)?.hourCost ?? 30);
			api.POST('/api/events/auth/pinned-event' as any, {
				body: { slug }
			}).catch(() => {});
		}
	}

	async function updateScroll() {
		await tick();
		if (!listEl) return;
		const cards = listEl.querySelectorAll('.event-card') as NodeListOf<HTMLElement>;
		const card = cards[nav.selectedIndex];
		if (!card) return;

		const containerHeight = listEl.parentElement?.clientHeight ?? 0;
		const cardTop = card.offsetTop;
		const cardHeight = card.offsetHeight;
		const listHeight = listEl.scrollHeight;

		let offset = -(cardTop + cardHeight / 2 - containerHeight / 2);
		offset = Math.min(offset, 0);
		if (listHeight > containerHeight) {
			offset = Math.max(offset, -(listHeight - containerHeight));
		}

		scrollOffset = offset;
	}

	const selectedEvent = $derived(events[nav.selectedIndex] ?? null);
	const heroSrc = $derived(selectedEvent?.api?.imageUrl ?? selectedEvent?.config.eventCard?.bgImage ?? null);

	function getCardBg(event: MergedEvent): string {
		const color = event.config.eventCard?.bgColor ?? event.config.colors.primary;
		return `color-mix(in srgb, ${color} 40%, #f3e8d8)`;
	}

	function getCardBgSelected(event: MergedEvent): string {
		const color = event.config.eventCard?.bgColor ?? event.config.colors.primary;
		return `color-mix(in srgb, ${color} 60%, #f3e8d8)`;
	}
</script>

<svelte:window onkeydown={nav.handleKeydown} onwheel={nav.handleWheel} />

<div class="relative size-full">
	<!-- Hero image -->
	<div style="opacity: {navigating || !entered ? 0 : heroSrc ? 1 : 0}; transition: opacity 0.4s ease;">
		{#if heroSrc}
			<TurbulentImage
				src={heroSrc}
				alt={selectedEvent?.config.name ?? ''}
				inset="0 -40% 0 40%"
				zIndex={0}
			/>
		{/if}
	</div>

	<!-- Scrollable event list -->
	<div class="absolute left-10.5 top-45 bottom-10 w-215 overflow-visible z-2" role="listbox" tabindex="-1">
		<div class="flex flex-col gap-7.5" bind:this={listEl} style="transform: translateY({scrollOffset}px); transition: transform var(--juice-duration) var(--juice-easing);">
			{#if loading}
				<div class="event-card bg-[#f3e8d8] border-4 border-black rounded-[20px] p-7.5 shadow-[4px_4px_0px_0px_black] flex items-center justify-center" style="width: 649px;">
					<p class="font-cook font-semibold text-black text-[40px] m-0 opacity-50">LOADING...</p>
				</div>
			{:else if error}
				<div class="event-card bg-[#f3e8d8] border-4 border-black rounded-[20px] p-7.5 shadow-[4px_4px_0px_0px_black] flex items-center justify-center" style="width: 649px;">
					<p class="font-cook font-semibold text-black text-[40px] m-0 opacity-50">{error}</p>
				</div>
			{:else}
				{#each events as event, i (event.slug)}
					{@const selected = i === nav.selectedIndex}
					<button
						class="event-card border-4 border-black rounded-[20px] p-7.5 shadow-[4px_4px_0px_0px_black] flex flex-col items-start overflow-hidden relative cursor-pointer text-left outline-none"
						class:selected
						class:exiting={navigating}
						onpointerdown={() => { clickWasSelected = nav.selectedIndex === i; }}
						onfocus={() => { nav.selectedIndex = i; updateScroll(); }}
						onclick={() => { if (clickWasSelected) { togglePin(event.slug); } }}
						style="--card-index: {i}; width: {selected ? '824px' : '649px'}; background-color: {selected ? getCardBgSelected(event) : getCardBg(event)}; gap: {selected ? '32px' : '0'}; transition: width var(--juice-duration) var(--juice-easing), background-color var(--selected-duration) ease, padding 0.3s ease;"
					>
						{#if currentPinnedSlug === event.slug}
							<span class="absolute top-4 right-4 font-bricolage text-sm font-bold px-3 py-1 rounded-full border-2 border-black z-1" style="background-color: {getCardBgSelected(event)};">
								PINNED
							</span>
						{/if}

						<div class="flex flex-col gap-1 z-1 w-full">
							<img
								src={event.config.logo}
								alt="{event.config.name} logo"
								class="h-18.75 w-auto object-contain object-left"
								style="max-width: {event.config.logoMaxWidth ?? '264px'};"
							/>
							{#if event.config.dates}
								<span class="font-bricolage text-sm font-bold px-3 py-1 rounded-full border-2 border-black self-start mt-1" style="background-color: {getCardBgSelected(event)};">
									{event.config.dates}
								</span>
							{/if}
							<p class="font-bricolage font-semibold text-black m-0 transition-[font-size_0.3s_ease]" style="font-size: {selected ? '32px' : '20px'};">
								{event.api?.description ?? event.config.tagline}
							</p>
						</div>

						<div
							class="grid z-1"
							style="grid-template-rows: {selected ? '1fr' : '0fr'}; opacity: {selected ? 1 : 0}; transition: grid-template-rows 0.15s ease, opacity 0.15s ease;"
						>
							<div class="overflow-hidden flex items-center gap-2">
								<InputPrompt type="Enter" />

								<span class="font-bricolage text-2xl font-bold text-black">OR</span>

								<InputPrompt type="click" />

								<span class="font-bricolage text-2xl font-bold text-black">{currentPinnedSlug === event.slug ? 'TO UNPIN' : 'TO PIN'}</span>
							</div>
						</div>
					</button>
				{/each}
			{/if}
		</div>
	</div>

	<!-- Back button -->
	<BackButton
		onclick={() => navigateTo('/app?noanimate', { exitBack: true })}
		exiting={backExiting}
		flyIn={page.url.searchParams.has('back')}
	/>

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

	<!-- Pinned popup -->
	{#if pinnedSlug}
		<div class="pinned-popup absolute top-13 left-1/2 z-20" class:exiting={pinnedDismissing}>
			<div class="flex items-center gap-2.5 px-7 py-5 bg-[#f3e8d8] border-4 border-black rounded-[20px] shadow-[4px_4px_0px_0px_black]">
				<p class="font-cook text-[24px] font-semibold text-black m-0 whitespace-nowrap">EVENT {pinnedAction === 'pinned' ? 'PINNED' : 'UNPINNED'}!</p>
			</div>
		</div>
	{/if}
</div>

<style>
	/* Per-card staggered entry */
	@keyframes card-enter {
		from { transform: translateX(-120vw); }
		to   { transform: translateX(0); }
	}
	.event-card {
		animation: card-enter var(--enter-duration) var(--enter-easing) both;
		animation-delay: calc(var(--card-index, 0) * 75ms);
	}

	/* Per-card staggered exit */
	@keyframes card-exit {
		from { transform: translateX(0); }
		to   { transform: translateX(-120vw); }
	}
	.event-card.exiting {
		animation: card-exit var(--exit-duration) var(--exit-easing) both;
		animation-delay: calc(var(--card-index, 0) * 75ms);
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

	@keyframes fly-in-top {
		from { transform: translate(-50%, -120vh); }
		to   { transform: translate(-50%, 0); }
	}
	@keyframes fly-out-top {
		from { transform: translate(-50%, 0); }
		to   { transform: translate(-50%, -120vh); }
	}
	.pinned-popup {
		animation: fly-in-top var(--enter-duration) var(--enter-easing) both;
	}
	.pinned-popup.exiting {
		animation: fly-out-top var(--exit-duration) var(--exit-easing) both;
	}
</style>
