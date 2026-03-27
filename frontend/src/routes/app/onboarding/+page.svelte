<script lang="ts">
	import { goto } from '$app/navigation';
	import beanSiblings from '$lib/assets/onboarding/bean-siblings.png';
	import beanSiblingsSide from '$lib/assets/onboarding/bean-siblings-side.png';
	import nexusLogo from '$lib/assets/onboarding/nexus-logo.png';
	import polarisLogo from '$lib/assets/onboarding/polaris-logo.png';

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

	const currentStep = $derived(steps[step]);

	function advance() {
		if (step < steps.length - 1) {
			step++;
		}
	}

	function handleEventSelect(eventId: string) {
		if (step !== 2) return;
		selectedEvent = selectedEvent === eventId ? null : eventId;
	}

	function handleContinue() {
		// TODO: API call to save selected event
		goto('/app');
	}

	const events = [
		{
			id: 'nexus',
			name: 'Nexus',
			logo: nexusLogo,
			location: 'Seattle, WA',
			dates: '6/19-21',
			bgColor: '#fac393',
			textColor: 'black'
		},
		{
			id: 'polaris',
			name: 'Polaris',
			logo: polarisLogo,
			location: 'Toronto, CA',
			dates: '6/19-21',
			bgColor: '#303d83',
			textColor: 'white'
		}
	];
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
					class:selected={selectedEvent === event.id}
					style="background-color: {event.bgColor}; color: {event.textColor};"
					onclick={(e) => { e.stopPropagation(); handleEventSelect(event.id); }}
					disabled={step !== 2}
				>
					<div class="event-logo">
						<img src={event.logo} alt={event.name} />
					</div>
					<p class="event-info font-bricolage">
						{event.location} - {event.dates}
					</p>
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

		{#if step === 2 && selectedEvent}
			<button class="continue-btn font-bricolage" onclick={(e) => { e.stopPropagation(); handleContinue(); }}>
				Continue
			</button>
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
		transition:
			transform 0.2s ease,
			box-shadow 0.2s ease;
	}

	.event-card:not(:disabled):hover {
		transform: translateY(-4px);
		box-shadow: 4px 8px 0px 0px black;
	}

	.event-card.selected {
		outline: 4px solid #ffa936;
		outline-offset: 2px;
		transform: translateY(-4px);
		box-shadow: 4px 8px 0px 0px black;
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
		max-width: 240px;
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

	.continue-btn {
		align-self: flex-end;
		background-color: black;
		color: #f3e8d8;
		font-size: 18px;
		font-weight: 600;
		padding: 10px 32px;
		border-radius: 12px;
		border: none;
		cursor: pointer;
		transition:
			transform 0.15s ease,
			opacity 0.15s ease;
	}

	.continue-btn:hover {
		transform: translateY(-2px);
		opacity: 0.9;
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
