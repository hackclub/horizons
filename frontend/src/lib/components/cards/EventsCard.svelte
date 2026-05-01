<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { fade } from 'svelte/transition';
	import yaml from 'js-yaml';
	import type { EventConfig } from '$lib/events/types';
	import eventsRaw from '$lib/events/events.yaml?raw';
	import enterSvg from '$lib/assets/prompts/enter.svg';
	import clickSvg from '$lib/assets/prompts/click.svg';

	interface Props {
		selected?: boolean;
		usingKeyboard?: boolean;
		shaking?: boolean;
		disabled?: boolean;
		postOnboarding?: boolean;
		description?: string;
		onmouseenter?: () => void;
		onclick?: (e: MouseEvent) => void;
		onanimationend?: () => void;
	}

	let {
		selected = false,
		usingKeyboard = true,
		shaking = false,
		disabled = false,
		postOnboarding = false,
		description = '',
		onmouseenter,
		onclick,
		onanimationend,
	}: Props = $props();

	const IDLE_MS = 14000;
	const SLIDE_MS = 6000;
	const FLY_OUT_MS = 1400;
	const SLIDE_FADE_OUT_MS = 400;
	const FLY_IN_MS = 1100;

	const eventsMap = yaml.load(eventsRaw) as Record<string, EventConfig>;
	const allEvents: { slug: string; config: EventConfig }[] = shuffle(
		Object.entries(eventsMap)
			.filter(([, cfg]) => !!cfg?.name)
			.map(([slug, config]) => ({ slug, config }))
	);

	function shuffle<T>(arr: T[]): T[] {
		const copy = [...arr];
		for (let i = copy.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[copy[i], copy[j]] = [copy[j], copy[i]];
		}
		return copy;
	}

	let flyOutActive = $state(false);
	let idleSlideshowActive = $state(false);
	let slideshowIndex = $state(0);

	let idleTimer: ReturnType<typeof setTimeout> | null = null;
	let slideTimer: ReturnType<typeof setInterval> | null = null;
	let flyOutTimer: ReturnType<typeof setTimeout> | null = null;
	let endTimer: ReturnType<typeof setTimeout> | null = null;

	function clearSlideTimer() {
		if (slideTimer) {
			clearInterval(slideTimer);
			slideTimer = null;
		}
	}

	function startSlideshow() {
		if (allEvents.length === 0) return;
		flyOutActive = true;
		if (flyOutTimer) clearTimeout(flyOutTimer);
		flyOutTimer = setTimeout(() => {
			idleSlideshowActive = true;
			slideshowIndex = 0;
			clearSlideTimer();
			let shown = 1;
			slideTimer = setInterval(() => {
				if (allEvents.length === 0) return;
				if (shown >= allEvents.length) {
					endSlideshow();
					return;
				}
				slideshowIndex = (slideshowIndex + 1) % allEvents.length;
				shown++;
			}, SLIDE_MS);
		}, FLY_OUT_MS);
	}

	function endSlideshow() {
		clearSlideTimer();
		idleSlideshowActive = false;
		if (endTimer) clearTimeout(endTimer);
		endTimer = setTimeout(() => {
			flyOutActive = false;
			endTimer = setTimeout(() => {
				scheduleNextCycle();
			}, FLY_IN_MS);
		}, SLIDE_FADE_OUT_MS);
	}

	function scheduleNextCycle() {
		if (idleTimer) clearTimeout(idleTimer);
		idleTimer = setTimeout(() => startSlideshow(), IDLE_MS);
	}

	function cancelAll() {
		if (idleTimer) clearTimeout(idleTimer);
		if (flyOutTimer) clearTimeout(flyOutTimer);
		if (endTimer) clearTimeout(endTimer);
		clearSlideTimer();
		flyOutActive = false;
		idleSlideshowActive = false;
	}

	let animationsEnabled = $state(true);
	let mq: MediaQueryList | null = null;

	onMount(() => {
		mq = window.matchMedia('(min-height: 550px)');
		animationsEnabled = mq.matches;
		const onChange = (e: MediaQueryListEvent) => { animationsEnabled = e.matches; };
		mq.addEventListener('change', onChange);
		return () => mq?.removeEventListener('change', onChange);
	});

	$effect(() => {
		if (animationsEnabled) {
			scheduleNextCycle();
		} else {
			cancelAll();
		}
	});

	onDestroy(() => {
		cancelAll();
	});
</script>

<a href="/app/events" class="card nav-card events-half-card"
	class:selected
	class:disabled
	class:shaking
	class:slideshow-active={flyOutActive}
	{onmouseenter}
	{onclick}
	{onanimationend}>
	<!-- Starburst background -->
	<div class="card-bg-icon starburst-icon">
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

	{#if idleSlideshowActive && allEvents.length > 0}
		{@const event = allEvents[slideshowIndex % allEvents.length]}
		{#key slideshowIndex}
			<div
				class="event-slide z-20"
				style="background-color: {event.config.eventCard?.bgColor ?? '#fac393'};"
				in:fade|global={{ duration: 700 }}
				out:fade|global={{ duration: 400 }}
			>
				{#if event.config.eventCard?.bgImage}
					<div class="event-slide-bg" style="background-image: url({event.config.eventCard.bgImage});"></div>
				{/if}
				<div class="event-slide-gradient"></div>
				<div class="event-slide-info">
					<img src={event.config.logo} alt={event.config.name} class="event-slide-logo" />
					<p class="font-cook text-[20px] text-white m-0">{event.config.name}</p>
					{#if event.config.dates || event.config.locationText}
						<p class="font-bricolage text-[16px] font-semibold text-white m-0 tracking-[0.16px]">
							{[event.config.dates, event.config.locationText].filter(Boolean).join(' · ')}
						</p>
					{/if}
				</div>
			</div>
		{/key}
	{/if}

	{#if selected}
		<div class="enter-hint">
			<img
				src={usingKeyboard ? enterSvg : clickSvg}
				alt={usingKeyboard ? 'Enter' : 'Click'}
				class="enter-hint-key"
			/>
			<span class="font-bricolage text-[12px] text-black font-semibold">TO VIEW EVENTS</span>
		</div>
	{/if}

	{#if postOnboarding && selected}
		<div class="card-popover">
			<p class="font-bricolage text-[16px] font-semibold text-black/70 m-0">{description}</p>
			<div class="popover-hint">
				<img
					src={usingKeyboard ? enterSvg : clickSvg}
					alt={usingKeyboard ? 'Enter' : 'Click'}
					class="enter-hint-key"
				/>
				<span class="font-bricolage text-[12px] text-black font-semibold">TO VIEW EVENTS</span>
			</div>
		</div>
	{/if}
</a>

<style>
	.card {
		border: 4px solid black;
		border-radius: 20px;
		box-shadow: 4px 4px 0px 0px black;
		overflow: hidden;
		text-decoration: none;
		color: black;
	}

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

	.events-half-card {
		position: relative;
		display: block;
		width: 100%;
		height: 100%;
		overflow: hidden;
		background-color: #f86d95;
	}

	.card-bg-icon {
		position: absolute;
		color: white;
		opacity: 0.2;
		pointer-events: none;
	}

	.starburst-icon {
		right: -60px;
		top: 50%;
		height: 140%;
		transform: translateY(-50%) rotate(130deg);
	}

	.card-text {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 20px;
		justify-content: center;
		height: 100%;
	}

	/* Slideshow exit animations */
	.events-half-card .card-text,
	.events-half-card .starburst-icon {
		transition:
			transform 1100ms cubic-bezier(0.4, 0, 0.2, 1),
			opacity 700ms ease;
	}

	.events-half-card.slideshow-active .card-text {
		transform: translateX(-110%);
		opacity: 0;
	}

	.events-half-card.slideshow-active .starburst-icon {
		transform: translateY(-50%) translateX(110%) rotate(130deg);
		opacity: 0;
	}

	.event-slide {
		position: absolute;
		inset: 0;
		overflow: hidden;
		pointer-events: none;
	}

	.event-slide-bg {
		position: absolute;
		inset: 0;
		background-size: cover;
		background-position: center;
		animation: slide-pan 9s ease-out forwards;
		transform-origin: center;
		will-change: transform;
	}

	.event-slide-gradient {
		position: absolute;
		inset: 0;
		background: linear-gradient(to top, rgba(0, 0, 0, 0.85), transparent);
	}

	.event-slide-info {
		position: absolute;
		left: 20px;
		right: 20px;
		bottom: 20px;
		display: flex;
		flex-direction: column;
		gap: 6px;
		align-items: flex-start;
	}

	.event-slide-logo {
		max-height: 60px;
		max-width: 80%;
		height: auto;
		object-fit: contain;
		object-position: left;
		filter: drop-shadow(0px 0px 20px rgba(0, 0, 0, 0.5));
	}

	.enter-hint {
		position: absolute;
		bottom: 12px;
		right: 12px;
		z-index: 30;
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 5px 12px;
		background: #f3e8d8;
		border: 2px solid black;
		border-radius: 8px;
	}

	.enter-hint-key {
		height: 22px;
		width: auto;
	}

	.card-popover {
		position: absolute;
		bottom: 12px;
		left: 12px;
		right: 12px;
		z-index: 40;
		background: #f3e8d8;
		border: 3px solid black;
		border-radius: 12px;
		box-shadow: 3px 3px 0px 0px black;
		padding: 12px 16px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.popover-hint {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		align-self: flex-end;
	}

	@keyframes slide-pan {
		from {
			transform: scale(1.05) translate(-2%, 1%);
		}
		to {
			transform: scale(1.18) translate(2%, -1%);
		}
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
</style>
