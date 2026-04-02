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
	import hackatimeIcon from '$lib/assets/icons/hackatime.svg';
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

	async function completeOnboarding() {
		await api.POST('/api/user/auth/complete-onboarding');
	}

	async function handleEventContinue() {
		if (!selectedEvent) return;
		await api.POST('/api/events/auth/pinned-event' as any, {
			body: { slug: selectedEvent }
		});
		if (!hasProjects) {
			step++;
		} else {
			await completeOnboarding();
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
			goto('/app');
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

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="absolute inset-0 flex flex-col items-center justify-center overflow-hidden" style="cursor: {step < eventSelectStep ? 'pointer' : 'default'};" onclick={step < eventSelectStep ? advance : undefined}>
	<!-- Event cards -->
	{#if currentStep.showEvents}
		<div
			class="flex flex-wrap justify-center content-start gap-8 max-w-[calc(298px*4+32px*3)] absolute top-0 bottom-0 overflow-y-auto p-2 transition-opacity duration-400 ease-in-out"
			style="opacity: {currentStep.eventsOpacity}; pointer-events: {isEventSelectStep ? 'auto' : 'none'};"
		>
			<div class="w-full h-10 shrink-0"></div>
			{#each events as event}
				<button
					class="event-card w-74.5 h-39.75 bg-[#f3e8d8] border-4 border-black rounded-[20px] shadow-[4px_4px_0px_0px_black] overflow-hidden relative flex flex-col items-center justify-center cursor-pointer transition-transform duration-(--juice-duration) ease-(--juice-easing)"
					class:selected={selectedEvent === event.slug}
					onclick={(e) => { e.stopPropagation(); handleEventSelect(event.slug); }}
					disabled={!isEventSelectStep}
				>
					<div class="flex items-center justify-center flex-1 p-3 min-h-0">
						<img src={event.logo} alt={event.name} class="max-w-65 max-h-full object-contain" />
					</div>
					{#if event.location || (event.startDate && event.endDate)}
						<p class="font-bricolage text-base font-semibold pb-3 whitespace-nowrap shrink-0">
							{[event.location, event.startDate && event.endDate ? formatDateRange(event.startDate, event.endDate) : null].filter(Boolean).join(' - ')}
						</p>
					{/if}
				</button>
			{/each}
			<div class="w-full h-75 shrink-0"></div>
		</div>
	{/if}

	<!-- Card steps (Hackatime setup / Project form) -->
	{#if isCardStep}
		<div class="absolute inset-0 flex items-center justify-center">
			<div class="absolute top-[calc(50%-331px-30px)] left-[calc(50%-363px-90px)] z-0">
				<img src={beanSiblingsSide} alt="Bean siblings" class="h-45 object-contain" />
			</div>
			<div class="relative z-1 w-181.75 h-165.5 bg-[#f3e8d8] border-4 border-black rounded-[20px] p-7.5 shadow-[4px_4px_0px_0px_black] flex flex-col justify-between items-center overflow-clip">
				{#if isHackatimeStep}
					<div class="w-full flex-1">
						<div class="flex flex-col gap-6 w-full">
							<div class="flex flex-col gap-2">
								<p class="font-bricolage text-2xl font-medium text-black leading-normal">Make sure to set up the Hackatime extension.</p>
							</div>
							<div class="flex flex-col gap-2 w-full">
								<p class="font-bricolage text-2xl font-bold text-black leading-normal">Link Hackatime <span class="opacity-40">(Required)</span></p>
								<HackatimeLinkButton bind:linked={hackatimeLinked} variant="card" />
							</div>

							{#if hackatimeLinked}
								<div class="flex flex-col gap-2 w-full">
									<p class="font-bricolage text-2xl font-bold text-black leading-normal">
										Hackatime Setup <span class="opacity-40">(Important)</span>
									</p>
									<a href="https://hackatime.hackclub.com/my/wakatime_setup" target="_blank" rel="noopener" class="flex gap-2.75 items-center p-4 border-4 border-black rounded-2xl shadow-[4px_4px_0px_0px_black] bg-[#f3e8d8] no-underline text-inherit transition-transform duration-(--juice-duration) ease-(--juice-easing) hover:scale-(--juice-scale)">
										<div class="bg-black/5 p-2 rounded-lg flex items-center shrink-0">
											<img src={hackatimeIcon} alt="Hackatime" style="width: 52px; height: 64px;" />
										</div>
										<div class="flex flex-col gap-1">
											<div class="flex items-center gap-1">
												<span class="font-bricolage text-2xl font-semibold text-black">Install the Hackatime Extension</span>
												<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
													<path d="M4.7943 1.01921C4.7943 0.456645 5.25095 0 5.81351 0L14.9808 0.000703475C15.5434 0.000703733 15.9993 0.456645 15.9993 1.01921L16 10.1865C16 10.7491 15.5434 11.2057 14.9808 11.2057C14.4185 11.2056 13.9626 10.7495 13.9623 10.1872V3.47826L1.44054 16L0 14.5595L12.5217 2.03772H5.81281C5.25053 2.03742 4.79437 1.58154 4.7943 1.01921Z" fill="black"/>
												</svg>
											</div>
											<span class="font-bricolage text-base font-semibold text-black/60">Set up the Hackatime extension in your IDE to track your coding time!</span>
										</div>
									</a>
								</div>
							{/if}
						</div>
					</div>
					<button
						class="card-btn w-103.75 py-2 px-4 border-2 border-black rounded-lg bg-transparent font-bricolage text-base font-semibold text-black cursor-pointer transition-[transform,background-color] duration-(--juice-duration) ease-(--juice-easing) hover:not-disabled:scale-(--juice-scale) hover:not-disabled:bg-[#ffa936] disabled:opacity-40 disabled:cursor-default"
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
							class="card-btn w-103.75 py-2 px-4 border-2 border-black rounded-lg bg-transparent font-bricolage text-base font-semibold text-black cursor-pointer self-center transition-[transform,background-color] duration-(--juice-duration) ease-(--juice-easing) hover:scale-(--juice-scale) hover:bg-[#ffa936] disabled:opacity-60 disabled:cursor-default"
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
	{/if}

	<!-- Character image (centered, step 1 only) -->
	{#if currentStep.imageStyle === 'bottom'}
		<div class="absolute bottom-50 flex justify-center">
			<img src={currentStep.image} alt="Bean siblings" class="h-62.5 object-contain -mb-5" />
		</div>
	{/if}

	<!-- Dialog box (for dialog-based steps) -->
	{#if !isCardStep}
		<div class="absolute bottom-20 left-1/2 -translate-x-[calc(50%-30px)] w-181.75">
			{#if currentStep.imageStyle === 'side'}
				<div class="absolute bottom-5 -left-20 -z-1">
					<img src={currentStep.image} alt="Bean siblings" class="h-45 object-contain" />
				</div>
			{/if}
			<div class="relative w-full min-h-45 bg-[#f3e8d8] border-4 border-black rounded-[20px] shadow-[4px_4px_0px_0px_black] p-7.5 flex flex-col gap-4">
			<div class="flex flex-col gap-2">
				<p class="font-cook text-2xl text-black whitespace-nowrap">{currentStep.speaker}</p>
				<p class="font-bricolage text-2xl font-semibold text-black leading-normal">{@html currentStep.text}</p>
			</div>

			{#if step < eventSelectStep}
				<p class="font-bricolage text-sm font-semibold text-black mt-2 animate-blink">Click anywhere to continue</p>
			{/if}

			{#if isEventSelectStep}
				<div class="flex justify-between items-center">
					<button class="font-bricolage text-base font-semibold text-black opacity-40 bg-transparent border-none cursor-pointer underline hover:opacity-70 transition-opacity duration-150 ease-in-out" onclick={async (e) => { e.stopPropagation(); if (!hasProjects) { step++; } else { await completeOnboarding(); goto('/app'); } }}>
						Skip
					</button>
					{#if selectedEvent}
						<button class="py-2 px-4 border-2 border-black rounded-lg bg-transparent font-bricolage text-base font-semibold text-black cursor-pointer transition-[transform,background-color] duration-(--juice-duration) ease-(--juice-easing) hover:scale-(--juice-scale) hover:bg-[#ffa936]" onclick={(e) => { e.stopPropagation(); handleEventContinue(); }}>
							Continue
						</button>
					{/if}
				</div>
			{/if}

			{#if isExperienceStep}
				<div class="flex gap-2.5 w-full">
					<button class="flex-1 py-2 px-4 border-2 border-black rounded-lg bg-transparent font-bricolage text-base font-semibold text-black cursor-pointer transition-[transform,background-color] duration-(--juice-duration) ease-(--juice-easing) hover:scale-(--juice-scale) hover:bg-[#ffa936]" onclick={(e) => { e.stopPropagation(); step++; }}>
						Yes!
					</button>
					<button class="flex-1 py-2 px-4 border-2 border-black rounded-lg bg-transparent font-bricolage text-base font-semibold text-black cursor-pointer transition-[transform,background-color] duration-(--juice-duration) ease-(--juice-easing) hover:scale-(--juice-scale) hover:bg-[#ffa936]" onclick={(e) => { e.stopPropagation(); goto('/app/onboarding/tutorial'); }}>
						No, this is my first time.
					</button>
				</div>
			{/if}
			</div>
		</div>
	{/if}
</div>

<style>
	.event-card:not(:disabled):not(.selected):hover {
		transform: scale(var(--juice-scale));
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
