<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { api } from '$lib/api';
	import CircleIn from '$lib/components/anim/CircleIn.svelte';
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
			speaker: 'THE FERRETLINGS',
			text: "Hiiii! *ferret noises* We are the ferretlings! We're here to introduce you to Hack Club's Horizons!",
			image: beanSiblings,
			imageStyle: 'bottom' as const,
			showEvents: false,
			showProjectForm: false,
			showExperiencePrompt: false,
			showHackatimeSetup: false
		},
		{
			speaker: 'BEAN',
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

	// `?debug` lets us walk through every step regardless of project state (so the
	// project-creation/Hackatime steps stay visible even for already-onboarded users).
	const debugMode = $derived(page.url.searchParams.has('debug'));
	const showAllSteps = $derived(!hasProjects || debugMode);

	const steps = $derived([...baseSteps, ...(showAllSteps ? noProjectSteps : [])]);

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
		const sMonth = s.toLocaleString('default', { month: 'long' });
		const eMonth = e.toLocaleString('default', { month: 'long' });
		if (sMonth === eMonth) {
			return `${sMonth} ${s.getDate()} - ${e.getDate()}`;
		}
		return `${sMonth} ${s.getDate()} - ${eMonth} ${e.getDate()}`;
	}

	async function completeOnboarding() {
		await api.POST('/api/user/auth/complete-onboarding');
	}

	async function handleEventContinue() {
		if (!selectedEvent) return;
		await api.POST('/api/events/auth/pinned-event' as any, {
			body: { slug: selectedEvent }
		});
		if (showAllSteps) {
			step++;
		} else {
			await completeOnboarding();
			goto('/app?post-onboarding');
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

		const { data, response } = await api.POST('/api/projects/auth', {
			body: {
				projectTitle: projectTitle.trim(),
				projectType: 'web_playable',
				projectDescription: projectDescription.trim(),
				screenshotUrl: mediaUrl || undefined,
			},
		});

		if (data) {
			invalidateAllProjectCaches();
			goto('/app?post-onboarding');
		} else {
			let message = response.statusText || 'An unknown error occurred';
			try {
				const body = await response.json();
				if (body?.message) message = Array.isArray(body.message) ? body.message.join(', ') : body.message;
			} catch {}
			projectError = `Failed to create project: ${message}`;
		}

		projectSubmitting = false;
	}
</script>

<CircleIn />

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="absolute inset-0 flex flex-col items-center overflow-y-auto overflow-x-hidden" style="cursor: {step < eventSelectStep ? 'pointer' : 'default'};" onclick={step < eventSelectStep ? advance : undefined}>
	<!-- Event cards -->
	{#if currentStep.showEvents}
		<div
			class="relative w-full px-4 pt-8 pb-64 flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:justify-center sm:content-start sm:gap-8 sm:max-w-[calc(298px*4+32px*3)] sm:absolute sm:top-0 sm:bottom-0 sm:overflow-y-auto sm:p-2 sm:px-0 sm:py-0 transition-opacity duration-400 ease-in-out"
			style="opacity: {currentStep.eventsOpacity}; pointer-events: {isEventSelectStep ? 'auto' : 'none'};"
		>
			<div class="hidden sm:block w-full h-10 shrink-0"></div>
			{#each events as event}
				<button
					class="event-card w-full sm:w-74.5 h-60 sm:h-39.75 bg-[#f3e8d8] border-4 border-black rounded-[20px] shadow-[4px_4px_0px_0px_black] overflow-hidden relative flex flex-col items-center justify-center cursor-pointer transition-transform duration-(--juice-duration) ease-(--juice-easing) p-3 sm:p-0"
					class:selected={selectedEvent === event.slug}
					style={event.slug === 'nexus' && event.eventCard?.bgImage
						? `background-image: url(${event.eventCard.bgImage}); background-size: cover; background-position: center;`
						: undefined}
					onclick={(e) => { e.stopPropagation(); handleEventSelect(event.slug); }}
					disabled={!isEventSelectStep}
				>
					<div class="flex items-center justify-center flex-1 p-3 min-h-0">
						<img src={event.logo} alt={event.name} class="max-w-65 max-h-full object-contain" />
					</div>
					<p class="block sm:hidden font-cook text-lg leading-none whitespace-nowrap" class:text-white={event.slug === 'nexus'}>{event.name}</p>
					{#if event.location || (event.startDate && event.endDate)}
						<div class="flex flex-col items-center pt-1 sm:pt-0 pb-3 shrink-0 leading-tight" class:text-white={event.slug === 'nexus'}>
							{#if event.location}
								<p class="font-bricolage text-base font-semibold whitespace-nowrap">{event.location}</p>
							{/if}
							{#if event.startDate && event.endDate}
								<p class="font-bricolage text-base font-semibold whitespace-nowrap">{formatDateRange(event.startDate, event.endDate)}</p>
							{/if}
						</div>
					{/if}
				</button>
			{/each}
			<button
				class="event-card w-full sm:w-74.5 h-60 sm:h-39.75 bg-[#f3e8d8] border-4 border-black rounded-[20px] shadow-[4px_4px_0px_0px_black] overflow-hidden relative flex flex-col items-center justify-center cursor-pointer transition-transform duration-(--juice-duration) ease-(--juice-easing) p-3 sm:p-0"
				onclick={async (e) => { e.stopPropagation(); if (showAllSteps) { step++; } else { await completeOnboarding(); goto('/app?post-onboarding'); } }}
				disabled={!isEventSelectStep}
			>
				<div class="flex flex-col items-center justify-center flex-1 p-3 min-h-0 gap-1">
					<p class="font-cook text-2xl text-black leading-none">CHOOSE LATER</p>
					<p class="font-bricolage text-sm font-semibold text-black opacity-60">I'll decide another time</p>
				</div>
			</button>
			<div class="hidden sm:block w-full h-75 shrink-0"></div>
		</div>
	{/if}

	<!-- Card steps (Hackatime setup / Project form) -->
	{#if isCardStep}
		<div class="w-full flex items-center justify-center px-4 py-8 sm:px-0 sm:my-auto">
			<div class="relative w-full sm:w-auto flex justify-center">
				<div class="hidden sm:block absolute -top-7.5 -left-22.5 z-0">
					<img src={beanSiblingsSide} alt="Bean siblings" class="h-45 object-contain" />
				</div>
				<div class="relative z-1 w-full max-w-[727px] sm:w-181.75 min-h-0 sm:min-h-165.5 bg-[#f3e8d8] border-4 border-black rounded-[20px] p-5 sm:p-7.5 shadow-[4px_4px_0px_0px_black] flex flex-col justify-between items-center overflow-clip gap-6">
				{#if isHackatimeStep}
					<div class="w-full flex-1">
						<div class="flex flex-col gap-6 w-full">
							<div class="flex flex-col gap-2">
								<p class="font-bricolage text-2xl font-medium text-black leading-normal">Make sure to set up the Hackatime extension.</p>
							</div>
							<HackatimeLinkButton bind:linked={hackatimeLinked} variant="card" />
						</div>
					</div>
					<button
						class="juice-btn card-btn w-full max-w-[415px] sm:w-103.75 py-2 px-4 border-2 border-black rounded-lg bg-transparent font-bricolage text-base font-semibold text-black cursor-pointer hover:not-disabled:scale-(--juice-scale) hover:not-disabled:bg-[#ffa936] disabled:opacity-40 disabled:cursor-default"
						class:card-continue-ready={hackatimeLinked}
						onclick={() => step++}
						disabled={!hackatimeLinked}
					>
						Continue
					</button>
				{/if}

				{#if isProjectStep}
					<div class="w-full flex-1">
						<div class="flex flex-col gap-6 w-full">
							<div class="flex flex-col gap-2">
								<h1 class="font-cook text-2xl text-black leading-normal">CREATE YOUR PROJECT</h1>
								<p class="font-bricolage text-2xl font-medium text-black leading-normal">Fill out the following fields! You can put an existing project, or the idea for a new project.</p>
								<p class="font-bricolage text-base font-medium text-black/60 leading-normal">Don't worry, this doesn't have to be final, you can change all of this later!</p>
							</div>
							<div class="flex flex-col gap-4 w-full">
								<FormField label="Title" id="title" placeholder="Horizons" maxlength={30} bind:value={projectTitle} />
								<FormTextarea label="Description" id="description" placeholder="Describe what your project does..." maxlength={500} bind:value={projectDescription} />
								<div class="flex flex-col gap-1 w-full">
									<label class="font-bricolage text-base font-semibold text-black leading-normal">Screenshot <span class="opacity-60">(optional)</span></label>
									<FileUpload label="" hideHint bind:mediaUrl bind:mediaPreview onerror={(msg) => projectError = msg} />
								</div>
							</div>
						</div>
					</div>
					<div class="flex flex-col gap-2 w-full">
						<FormError message={projectError} />
						<button
							class="juice-btn card-btn w-full max-w-[415px] sm:w-103.75 py-2 px-4 border-2 border-black rounded-lg bg-transparent font-bricolage text-base font-semibold text-black cursor-pointer self-center hover:scale-(--juice-scale) hover:bg-[#ffa936] disabled:opacity-60 disabled:cursor-default"
							class:card-submit-ready={projectFormReady}
							onclick={handleProjectSubmit}
							disabled={projectSubmitting}
						>
							{projectSubmitting ? 'Creating...' : 'Create Project'}
						</button>
					</div>
				{/if}
				</div>
			</div>
		</div>
	{/if}

	<!-- Character image (centered, step 1 only) -->
	{#if currentStep.imageStyle === 'bottom'}
		<div class="hidden sm:flex absolute bottom-50 justify-center">
			<img src={currentStep.image} alt="Bean siblings" class="h-62.5 object-contain -mb-5" />
		</div>
	{/if}

	<!-- Dialog box (for dialog-based steps) -->
	{#if !isCardStep}
		<div class="fixed bottom-4 left-4 right-4 z-20 sm:absolute sm:bottom-20 sm:left-1/2 sm:right-auto sm:top-auto sm:-translate-x-[calc(50%-30px)] sm:w-181.75 sm:z-auto">
			<!-- Mobile-only bean character (above the dialog) -->
			<img src={beanSiblingsSide} alt="" class="block sm:hidden absolute bottom-full -right-4 mb-2 w-24 pointer-events-none" />
			{#if currentStep.imageStyle === 'side'}
				<div class="hidden sm:block absolute bottom-5 -left-20 -z-1">
					<img src={currentStep.image} alt="Bean siblings" class="h-45 object-contain" />
				</div>
			{/if}
			<div class="relative w-full min-h-45 bg-[#f3e8d8] border-4 border-black rounded-[20px] shadow-[4px_4px_0px_0px_black] p-5 sm:p-7.5 flex flex-col gap-4">
			<div class="flex flex-col gap-2">
				<p class="font-cook text-2xl text-black whitespace-nowrap">{currentStep.speaker}</p>
				<p class="font-bricolage text-2xl font-semibold text-black leading-normal">{@html currentStep.text}</p>
			</div>

			{#if step < eventSelectStep}
				<p class="font-bricolage text-sm font-semibold text-black mt-2 animate-blink">Click anywhere to continue</p>
			{/if}

			{#if isEventSelectStep}
				<div class="flex justify-between items-center gap-4">
					<p class="font-bricolage text-base font-semibold text-black opacity-60">You can change which event you want to go to later!</p>
					{#if selectedEvent}
						<button class="juice-btn py-2 px-4 border-2 border-black rounded-lg bg-transparent font-bricolage text-base font-semibold text-black cursor-pointer hover:scale-(--juice-scale) hover:bg-[#ffa936] shrink-0" onclick={(e) => { e.stopPropagation(); handleEventContinue(); }}>
							Continue
						</button>
					{/if}
				</div>
			{/if}

			{#if isExperienceStep}
				<div class="flex flex-col sm:flex-row gap-2.5 w-full">
					<button class="juice-btn flex-1 py-2 px-4 border-2 border-black rounded-lg bg-transparent font-bricolage text-base font-semibold text-black cursor-pointer hover:scale-(--juice-scale) hover:bg-[#ffa936]" onclick={(e) => { e.stopPropagation(); step++; }}>
						Yes!
					</button>
					<button class="juice-btn flex-1 py-2 px-4 border-2 border-black rounded-lg bg-transparent font-bricolage text-base font-semibold text-black cursor-pointer hover:scale-(--juice-scale) hover:bg-[#ffa936]" onclick={(e) => { e.stopPropagation(); goto(`/app/onboarding/tutorial${page.url.searchParams.has('debug') ? '?debug' : ''}`); }}>
						No, this is my first time.
					</button>
				</div>
			{/if}
			</div>
		</div>
	{/if}
</div>

<style>
	.juice-btn {
		transition: scale var(--juice-duration) var(--juice-easing),
		            background-color 0.2s ease-in-out;
	}

	@media (hover: hover) {
		.event-card:not(:disabled):not(.selected):hover {
			transform: scale(var(--juice-scale));
		}
	}

	.event-card.selected {
		transform: scale(1.08);
	}

	.event-card:disabled {
		cursor: default;
	}

	.card-continue-ready {
		background-color: #fdd9a8;
		animation: white-blink 1.5s ease-in-out infinite;
	}

	.card-submit-ready {
		background-color: #fdd9a8;
		animation: white-blink 1.5s ease-in-out infinite;
	}

	@keyframes white-blink {
		0%, 100% { background-color: #fdd9a8; }
		50% { background-color: #fba74d; }
	}

	@keyframes blink {
		0%, 100% { opacity: 0.6; }
		50% { opacity: 0.2; }
	}
</style>
