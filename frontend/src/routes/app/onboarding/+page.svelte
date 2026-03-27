<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { api } from '$lib/api';
	import yaml from 'js-yaml';
	import type { EventConfig } from '$lib/events/types';
	import eventsRaw from '$lib/events/events.yaml?raw';
	import beanSiblings from '$lib/assets/onboarding/bean-siblings.png';
	import beanSiblingsSide from '$lib/assets/onboarding/bean-siblings-side.png';
	import { FormField, FormTextarea, FileUpload, FormError } from '$lib/components/form';
	import HackatimeLinkButton from '$lib/components/HackatimeLinkButton.svelte';
	import { invalidateAllProjectCaches } from '$lib/store/projectDetailCache';
	import { fetchProjects } from '$lib/store/projectCache';

	interface ApiEvent {
		slug: string;
		location?: string;
		startDate: string;
		endDate: string;
		description?: string;
	}

	const eventsMap = yaml.load(eventsRaw) as Record<string, EventConfig>;
	let apiEvents = $state<ApiEvent[]>([]);
	let hasProjects = $state(true);

	const events = $derived(
		Object.entries(eventsMap).map(([slug, config]) => {
			const apiEvent = apiEvents.find((e) => e.slug === slug);
			return { slug, ...config, location: apiEvent?.location, startDate: apiEvent?.startDate, endDate: apiEvent?.endDate };
		})
	);

	onMount(async () => {
		const [eventsRes, projects] = await Promise.all([
			api.GET('/api/events' as any),
			fetchProjects().catch(() => [])
		]);
		if (eventsRes.data && Array.isArray(eventsRes.data)) {
			apiEvents = eventsRes.data;
		}
		hasProjects = Array.isArray(projects) && projects.length > 0;
	});

	let step = $state(0);
	let selectedEvent = $state<string | null>(null);

	const baseSteps = [
		{
			speaker: 'THE BEAN SIBLINGS',
			text: "Hiiii! *ferret noises* We are the bean siblings! We're here to introduce you to Hack Club's Horizons!",
			image: beanSiblings,
			imageStyle: 'bottom' as const,
			showEvents: false,
			showProjectForm: false,
			showExperiencePrompt: false,
			showHackatimeSetup: false
		},
		{
			speaker: 'BEANUT',
			text: "We're running 7 hackathons across the world, and <u>you're invited!</u>",
			image: beanSiblingsSide,
			imageStyle: 'side' as const,
			showEvents: true,
			eventsOpacity: 0.4,
			showProjectForm: false,
			showExperiencePrompt: false,
			showHackatimeSetup: false
		},
		{
			speaker: 'JELLY',
			text: 'Choose which event you want to go to!',
			image: beanSiblingsSide,
			imageStyle: 'side' as const,
			showEvents: true,
			eventsOpacity: 1,
			showProjectForm: false,
			showExperiencePrompt: false,
			showHackatimeSetup: false
		}
	];

	const noProjectSteps = [
		{
			speaker: 'JELLY',
			text: 'Have you built a project before?',
			image: beanSiblingsSide,
			imageStyle: 'side' as const,
			showEvents: false,
			showProjectForm: false,
			showExperiencePrompt: true,
			showHackatimeSetup: false
		},
		{
			speaker: '',
			text: '',
			image: beanSiblingsSide,
			imageStyle: 'card' as const,
			showEvents: false,
			showProjectForm: false,
			showExperiencePrompt: false,
			showHackatimeSetup: true
		},
		{
			speaker: '',
			text: '',
			image: beanSiblingsSide,
			imageStyle: 'card' as const,
			showEvents: false,
			showProjectForm: true,
			showExperiencePrompt: false,
			showHackatimeSetup: false
		}
	];

	const steps = $derived([...baseSteps, ...(!hasProjects ? noProjectSteps : [])]);

	const selectedApiEvent = $derived(
		selectedEvent ? apiEvents.find((e) => e.slug === selectedEvent) : null
	);

	const eventSelectStep = 2;
	const isEventSelectStep = $derived(step === eventSelectStep);
	const isExperienceStep = $derived(steps[step]?.showExperiencePrompt === true);
	const isHackatimeStep = $derived(steps[step]?.showHackatimeSetup === true);
	const isProjectStep = $derived(steps[step]?.showProjectForm === true);
	const isCardStep = $derived(isHackatimeStep || isProjectStep);

	const currentStep = $derived({
		...steps[step],
		...(isEventSelectStep && selectedApiEvent?.description
			? { text: selectedApiEvent.description }
			: {})
	});

	function advance() {
		if (step < steps.length - 1) {
			step++;
		}
	}

	function handleEventSelect(slug: string) {
		if (!isEventSelectStep) return;
		selectedEvent = selectedEvent === slug ? null : slug;
	}

	function formatDateRange(start: string, end: string) {
		const s = new Date(start);
		const e = new Date(end);
		const month = s.getMonth() + 1;
		return `${month}/${s.getDate()}-${e.getDate()}`;
	}

	async function handleEventContinue() {
		if (!selectedEvent) return;
		await api.POST('/api/events/auth/pinned-event' as any, {
			body: { slug: selectedEvent }
		});
		if (!hasProjects) {
			step++;
		} else {
			goto('/app');
		}
	}

	// Project form state
	let projectTitle = $state('');
	let projectDescription = $state('');
	let projectSubmitting = $state(false);
	let projectError = $state<string | null>(null);
	let mediaUrl = $state<string | null>(null);
	let mediaPreview = $state<string | null>(null);
	let hackatimeLinked = $state(false);
	const projectFormReady = $derived(projectTitle.trim().length > 0 && projectDescription.trim().length > 0);

	async function handleProjectSubmit() {
		if (!projectTitle.trim() || !projectDescription.trim()) {
			projectError = 'Title and description are required';
			return;
		}

		projectSubmitting = true;
		projectError = null;

		const { data } = await api.POST('/api/projects/auth', {
			body: {
				projectTitle: projectTitle.trim(),
				projectType: 'web_playable',
				projectDescription: projectDescription.trim(),
				screenshotUrl: mediaUrl || undefined,
			},
		});

		if (data) {
			invalidateAllProjectCaches();
			goto(`/app/projects/${data.projectId}`);
		} else {
			projectError = 'Failed to create project. Please try again.';
		}

		projectSubmitting = false;
	}
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="onboarding" style="cursor: {step < eventSelectStep ? 'pointer' : 'default'};" onclick={step < eventSelectStep ? advance : undefined}>
	<!-- Event cards -->
	{#if currentStep.showEvents}
		<div
			class="events-row"
			style="opacity: {currentStep.eventsOpacity}; pointer-events: {isEventSelectStep ? 'auto' : 'none'};"
		>
			{#each events as event}
				<button
					class="event-card"
					class:selected={selectedEvent === event.slug}
					onclick={(e) => { e.stopPropagation(); handleEventSelect(event.slug); }}
					disabled={!isEventSelectStep}
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

	<!-- Card steps (Hackatime setup / Project form) -->
	{#if isCardStep}
		<div class="card-step-wrapper">
			<div class="character-card-corner">
				<img src={beanSiblingsSide} alt="Bean siblings" class="character-img-side" />
			</div>
			<div class="centered-card">
				{#if isHackatimeStep}
					<div class="card-body">
						<div class="flex flex-col gap-6 w-full">
							<div class="flex flex-col gap-2">
								<h1 class="font-cook text-2xl text-black leading-normal">SET UP HACKATIME</h1>
								<p class="font-bricolage text-2xl font-medium text-black leading-normal">We need to link your Hackatime account to Horizons so we can keep track of the time you spend on your projects.</p>
							</div>
							<HackatimeLinkButton bind:linked={hackatimeLinked} variant="card" />
						</div>
					</div>
					<button class="card-continue-btn font-bricolage" class:card-continue-ready={hackatimeLinked} onclick={() => step++} disabled={!hackatimeLinked}>
						Continue
					</button>
				{/if}

				{#if isProjectStep}
					<div class="card-body">
						<div class="flex flex-col gap-6 w-full">
							<div class="flex flex-col gap-2">
								<h1 class="font-cook text-2xl text-black leading-normal">CREATE YOUR PROJECT</h1>
								<p class="font-bricolage text-2xl font-medium text-black leading-normal">Fill out the following fields! You can put an existing project, or the idea for a new project.</p>
							</div>
							<div class="flex flex-col gap-4 w-full">
								<FormField label="Title" id="title" placeholder="Horizons" bind:value={projectTitle} />
								<FormTextarea label="Description" id="description" placeholder="Describe what your project does..." bind:value={projectDescription} />
								<div class="flex flex-col gap-1 w-full">
									<label class="font-bricolage text-base font-semibold text-black leading-normal">Screenshot <span class="opacity-60">(optional)</span></label>
									<FileUpload label="" hideHint bind:mediaUrl bind:mediaPreview onerror={(msg) => projectError = msg} />
								</div>
							</div>
						</div>
					</div>
					<div class="flex flex-col gap-2 w-full">
						<FormError message={projectError} />
						<button class="card-submit-btn font-bricolage" class:card-submit-ready={projectFormReady} onclick={handleProjectSubmit} disabled={projectSubmitting}>
							{projectSubmitting ? 'Creating...' : 'Create Project'}
						</button>
					</div>
				{/if}
			</div>
		</div>
	{/if}

	<!-- Character image (centered, step 1 only) -->
	{#if currentStep.imageStyle === 'bottom'}
		<div class="character-center">
			<img src={currentStep.image} alt="Bean siblings" class="character-img-center" />
		</div>
	{/if}

	<!-- Dialog box (for dialog-based steps) -->
	{#if !isCardStep}
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

			{#if step < eventSelectStep}
				<p class="click-hint font-bricolage">Click anywhere to continue</p>
			{/if}

			{#if isEventSelectStep}
				<div class="dialog-actions">
					<button class="skip-btn font-bricolage" onclick={(e) => { e.stopPropagation(); !hasProjects ? step++ : goto('/app'); }}>
						Skip
					</button>
					{#if selectedEvent}
						<button class="continue-btn font-bricolage" onclick={(e) => { e.stopPropagation(); handleEventContinue(); }}>
							Continue
						</button>
					{/if}
				</div>
			{/if}

			{#if isExperienceStep}
				<div class="experience-buttons">
					<button class="experience-btn font-bricolage" onclick={(e) => { e.stopPropagation(); step++; }}>
						Yes!
					</button>
					<button class="experience-btn font-bricolage" onclick={(e) => { e.stopPropagation(); goto('/app/onboarding/tutorial'); }}>
						No, this is my first time.
					</button>
				</div>
			{/if}
			</div>
		</div>
	{/if}
</div>

<style>
	.onboarding {
		position: absolute;
		inset: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		overflow: hidden;
	}

	.sublabel {
		font-size: 13px;
		font-weight: 500;
		color: rgba(0, 0, 0, 0.5);
		line-height: normal;
	}

	.card-step-wrapper {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.character-card-corner {
		position: absolute;
		top: calc(50% - 331px - 30px);
		left: calc(50% - 363px - 90px);
		z-index: 0;
	}

	.centered-card {
		position: relative;
		z-index: 1;
		width: 727px;
		height: 662px;
		background-color: #f3e8d8;
		border: 4px solid black;
		border-radius: 20px;
		padding: 30px;
		box-shadow: 4px 4px 0px 0px black;
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		align-items: center;
		overflow: clip;
	}

	.card-body {
		width: 100%;
		flex: 1;
	}

	.card-continue-btn {
		width: 415px;
		padding: 8px 16px;
		border: 2px solid black;
		border-radius: 8px;
		background: none;
		font-size: 16px;
		font-weight: 600;
		color: black;
		cursor: pointer;
		transition: transform var(--juice-duration) var(--juice-easing), background-color var(--selected-duration) ease;
	}

	.card-continue-btn:hover:not(:disabled) {
		transform: scale(var(--juice-scale));
		background-color: #ffa936;
	}

	.card-continue-btn:disabled {
		opacity: 0.4;
		cursor: default;
	}

	.card-continue-ready {
		background-color: #fdd9a8;
		animation: white-blink 1.5s ease-in-out infinite;
	}

	@keyframes white-blink {
		0%, 100% { background-color: #fdd9a8; }
		50% { background-color: #fba74d; }
	}

	.card-submit-btn {
		width: 415px;
		padding: 8px 16px;
		border: 2px solid black;
		border-radius: 8px;
		background: none;
		font-size: 16px;
		font-weight: 600;
		color: black;
		cursor: pointer;
		align-self: center;
		transition: transform var(--juice-duration) var(--juice-easing), background-color var(--selected-duration) ease;
	}

	.card-submit-btn:hover {
		transform: scale(var(--juice-scale));
		background-color: #ffa936;
	}

	.card-submit-ready {
		background-color: #fdd9a8;
		animation: white-blink 1.5s ease-in-out infinite;
	}

	.card-submit-btn:disabled {
		opacity: 0.6;
		cursor: default;
	}

	.events-row {
		display: flex;
		gap: 32px;
		align-items: center;
		position: absolute;
		top: 80px;
		transition: opacity 0.4s ease;
	}

	.experience-buttons {
		display: flex;
		gap: 10px;
		width: 100%;
	}

	.experience-btn {
		flex: 1;
		padding: 8px 16px;
		border: 2px solid black;
		border-radius: 8px;
		background: none;
		font-size: 16px;
		font-weight: 600;
		color: black;
		cursor: pointer;
		transition: transform var(--juice-duration) var(--juice-easing), background-color var(--selected-duration) ease;
	}

	.experience-btn:hover {
		transform: scale(var(--juice-scale));
		background-color: #ffa936;
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
