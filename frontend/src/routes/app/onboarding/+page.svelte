<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { api } from '$lib/api';
	import yaml from 'js-yaml';
	import type { EventConfig } from '$lib/events/types';
	import eventsRaw from '$lib/events/events.yaml?raw';
	import beanSiblings from '$lib/assets/onboarding/bean-siblings.png';
	import beanSiblingsSide from '$lib/assets/onboarding/bean-siblings-side.png';

	interface ApiEvent {
		slug: string;
		location?: string;
		startDate: string;
		endDate: string;
		description?: string;
	}

	const eventsMap = yaml.load(eventsRaw) as Record<string, EventConfig>;
	let apiEvents = $state<ApiEvent[]>([]);

	const events = $derived(
		Object.entries(eventsMap).map(([slug, config]) => {
			const apiEvent = apiEvents.find((e) => e.slug === slug);
			return { slug, ...config, location: apiEvent?.location, startDate: apiEvent?.startDate, endDate: apiEvent?.endDate };
		})
	);

	onMount(async () => {
		const { data } = await api.GET('/api/events' as any);
		if (data && Array.isArray(data)) {
			apiEvents = data;
		}
	});

	let step = $state(0);
	let selectedEvent = $state<string | null>(null);

	const steps = [
		{
			speaker: 'THE BEAN SIBLINGS',
			text: "Hiiii! *ferret noises* We are the bean siblings! We're here to introduce you to Hack Club's Horizons!",
			image: beanSiblings,
			imageStyle: 'bottom',
			showEvents: false
		},
		{
			speaker: 'BEANUT',
			text: "We're running 7 hackathons across the world, and <u>you're invited!</u>",
			image: beanSiblingsSide,
			imageStyle: 'side',
			showEvents: true,
			eventsOpacity: 0.4
		},
		{
			speaker: 'JELLY',
			text: 'Choose which event you want to go to!',
			image: beanSiblingsSide,
			imageStyle: 'side',
			showEvents: true,
			eventsOpacity: 1
		}
	];

	const selectedApiEvent = $derived(
		selectedEvent ? apiEvents.find((e) => e.slug === selectedEvent) : null
	);

	const currentStep = $derived({
		...steps[step],
		...(step === 2 && selectedApiEvent?.description
			? { text: selectedApiEvent.description }
			: {})
	});

	function advance() {
		if (step < steps.length - 1) {
			step++;
		}
	}

	function handleEventSelect(slug: string) {
		if (step !== 2) return;
		selectedEvent = selectedEvent === slug ? null : slug;
	}

	function formatDateRange(start: string, end: string) {
		const s = new Date(start);
		const e = new Date(end);
		const month = s.getMonth() + 1;
		return `${month}/${s.getDate()}-${e.getDate()}`;
	}

	async function handleContinue() {
		if (!selectedEvent) return;
		await api.POST('/api/events/auth/pinned-event' as any, {
			body: { slug: selectedEvent }
		});
		goto('/app');
	}
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="onboarding" onclick={step < 2 ? advance : undefined}>
	<!-- Event cards -->
	{#if currentStep.showEvents}
		<div
			class="events-row"
			style="opacity: {currentStep.eventsOpacity}; pointer-events: {step === 2 ? 'auto' : 'none'};"
		>
			{#each events as event}
				<button
					class="event-card"
					class:selected={selectedEvent === event.slug}
					onclick={(e) => { e.stopPropagation(); handleEventSelect(event.slug); }}
					disabled={step !== 2}
				>
					<div class="event-logo">
						<img src={event.logo} alt={event.name} />
					</div>
					{#if event.location || (event.startDate && event.endDate)}
						<p class="event-info font-bricolage">
							{[event.location, event.startDate && event.endDate ? formatDateRange(event.startDate, event.endDate) : null].filter(Boolean).join(' - ')}
						</p>
					{/if}
				</button>
			{/each}
		</div>
	{/if}

	<!-- Character image (centered, step 1 only) -->
	{#if currentStep.imageStyle === 'bottom'}
		<div class="character-center">
			<img src={currentStep.image} alt="Bean siblings" class="character-img-center" />
		</div>
	{/if}

	<!-- Dialog box -->
	<div class="dialog-wrapper">
		{#if currentStep.imageStyle === 'side'}
			<div class="character-side">
				<img src={currentStep.image} alt="Bean siblings" class="character-img-side" />
			</div>
		{/if}
		<div class="dialog-box">
		<div class="dialog-content">
			<p class="speaker-name font-cook">{currentStep.speaker}</p>
			<p class="speaker-text font-bricolage">{@html currentStep.text}</p>
		</div>

		{#if step < 2}
			<p class="click-hint font-bricolage">Click anywhere to continue</p>
		{/if}

		{#if step === 2}
			<div class="dialog-actions">
				<button class="skip-btn font-bricolage" onclick={(e) => { e.stopPropagation(); goto('/app'); }}>
					Skip
				</button>
				{#if selectedEvent}
					<button class="continue-btn font-bricolage" onclick={(e) => { e.stopPropagation(); handleContinue(); }}>
						Continue
					</button>
				{/if}
			</div>
		{/if}
		</div>
	</div>


</div>

<style>
	.onboarding {
		position: absolute;
		inset: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		overflow: hidden;
	}

	.events-row {
		display: flex;
		gap: 32px;
		align-items: center;
		position: absolute;
		top: 80px;
		transition: opacity 0.4s ease;
	}

	.event-card {
		width: 298px;
		height: 159px;
		background-color: #f3e8d8;
		border: 4px solid black;
		border-radius: 20px;
		box-shadow: 4px 4px 0px 0px black;
		overflow: hidden;
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		transition: transform var(--juice-duration) var(--juice-easing);
	}

.event-card:not(:disabled):not(.selected):hover {
		transform: scale(var(--juice-scale));
	}

	.event-card.selected {
		transform: scale(1.08);
	}

	.event-card:disabled {
		cursor: default;
	}

	.event-logo {
		display: flex;
		align-items: center;
		justify-content: center;
		flex: 1;
		padding: 12px;
	}

	.event-logo img {
		width: 240px;
		max-height: 80px;
		object-fit: contain;
	}

	.event-info {
		font-size: 16px;
		font-weight: 600;
		position: absolute;
		bottom: 12px;
		white-space: nowrap;
	}

	.character-center {
		position: absolute;
		bottom: 200px;
		display: flex;
		justify-content: center;
	}

	.character-img-center {
		height: 250px;
		object-fit: contain;
		margin-bottom: -20px;
	}

	.dialog-wrapper {
		position: absolute;
		bottom: 80px;
		left: 50%;
		transform: translateX(calc(-50% + 30px));
		width: 727px;
	}

	.character-side {
		position: absolute;
		bottom: 20px;
		left: -80px;
		z-index: -1;
	}

	.character-img-side {
		height: 180px;
		object-fit: contain;
	}

	.dialog-box {
		position: relative;
		width: 100%;
		min-height: 180px;
		background-color: #f3e8d8;
		border: 4px solid black;
		border-radius: 20px;
		box-shadow: 4px 4px 0px 0px black;
		padding: 30px;
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.dialog-content {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.speaker-name {
		font-size: 24px;
		color: black;
		white-space: nowrap;
	}

	.speaker-text {
		font-size: 24px;
		font-weight: 600;
		color: black;
		line-height: normal;
	}

	.dialog-actions {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.skip-btn {
		font-size: 16px;
		font-weight: 600;
		color: black;
		opacity: 0.4;
		background: none;
		border: none;
		cursor: pointer;
		text-decoration: underline;
		transition: opacity 0.15s ease;
	}

	.skip-btn:hover {
		opacity: 0.7;
	}

	.continue-btn {
		background-color: black;
		color: #f3e8d8;
		font-size: 18px;
		font-weight: 600;
		padding: 10px 32px;
		border-radius: 12px;
		border: none;
		cursor: pointer;
		transition: transform var(--juice-duration) var(--juice-easing);
	}

	.continue-btn:hover {
		transform: scale(var(--juice-scale));
	}

	.click-hint {
		font-size: 14px;
		font-weight: 600;
		color: black;
		margin-top: 8px;
		animation: blink 1s ease-in-out infinite;
	}

	@keyframes blink {
		0%, 100% {
			opacity: 0.6;
		}
		50% {
			opacity: 0.2;
		}
	}
</style>
