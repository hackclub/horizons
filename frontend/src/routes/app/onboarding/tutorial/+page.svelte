<script lang="ts">
	import { goto } from '$app/navigation';
	import { api } from '$lib/api';
	import beanSiblingsSide from '$lib/assets/onboarding/bean-siblings-side.png';
	import HackatimeLinkButton from '$lib/components/HackatimeLinkButton.svelte';
	import { FormField, FormTextarea, FileUpload, FormError } from '$lib/components/form';
	import { invalidateAllProjectCaches } from '$lib/store/projectDetailCache';

	let step = $state(0);
	let hackatimeLinked = $state(false);

	// Project form state
	let projectTitle = $state('');
	let projectDescription = $state('');
	let projectSubmitting = $state(false);
	let projectError = $state<string | null>(null);
	let mediaUrl = $state<string | null>(null);
	let mediaPreview = $state<string | null>(null);

	const projectFormReady = $derived(projectTitle.trim().length > 0 && projectDescription.trim().length > 0);
	const isDialogStep = $derived(step === 0);
	const isStep1 = $derived(step === 1);
	const isStep2 = $derived(step === 2);
	const isStep3 = $derived(step === 3);

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
<div class="absolute inset-0 flex flex-col items-center justify-center overflow-hidden" style="cursor: {isDialogStep ? 'pointer' : 'default'};" onclick={isDialogStep ? () => step++ : undefined}>

	<!-- Dialog step: Jelly excited -->
	{#if isDialogStep}
		<div class="absolute bottom-20 left-1/2 -translate-x-[calc(50%-30px)] w-181.75">
			<div class="absolute bottom-5 -left-20 -z-1">
				<img src={beanSiblingsSide} alt="Bean siblings" class="h-45 object-contain" />
			</div>
			<div class="relative w-full min-h-45 bg-[#f3e8d8] border-4 border-black rounded-[20px] shadow-[4px_4px_0px_0px_black] p-7.5 flex flex-col gap-4">
				<div class="flex flex-col gap-2">
					<p class="font-cook text-2xl text-black">BEAN</p>
					<p class="font-bricolage text-2xl font-semibold text-black leading-normal">YAYAYA!! I'm so excited for you to build your first project!</p>
				</div>
				<p class="font-bricolage text-sm font-semibold text-black mt-2 animate-blink">Click anywhere to continue</p>
			</div>
		</div>
	{/if}

	<!-- Card steps -->
	{#if !isDialogStep}
		<div class="absolute inset-0 flex items-center justify-center">
			<div class="absolute top-[calc(50%-331px-30px)] left-[calc(50%-363px-90px)] z-0">
				<img src={beanSiblingsSide} alt="Bean siblings" class="h-45 object-contain" />
			</div>
			<div class="relative z-1 w-181.75 min-h-165.5 bg-[#f3e8d8] border-4 border-black rounded-[20px] p-7.5 shadow-[4px_4px_0px_0px_black] flex flex-col justify-between items-center overflow-hidden">
				{#if isStep1}
					<div class="w-full flex-1">
						<div class="flex flex-col gap-6 w-full">
							<div class="flex flex-col gap-2">
								<h1 class="font-cook text-2xl text-black leading-normal">STEP 1</h1>
								<p class="font-bricolage text-2xl font-medium text-black leading-normal">Set up your coding environment!</p>
							</div>

							<!-- Install IDE -->
							<div class="flex flex-col gap-2 w-full">
								<p class="font-bricolage text-2xl font-bold text-black leading-normal">
									Install an IDE <span class="opacity-40">(Recommended)</span>
								</p>
								<a href="https://code.visualstudio.com/docs/setup/setup-overview" target="_blank" rel="noopener" class="flex gap-2.75 items-center p-4 border-4 border-black rounded-2xl shadow-[4px_4px_0px_0px_black] bg-[#f3e8d8] no-underline text-inherit transition-transform duration-(--juice-duration) ease-(--juice-easing) hover:scale-(--juice-scale)">
									<div class="bg-black/5 p-2 rounded-lg flex items-center shrink-0">
										<img src="https://code.visualstudio.com/favicon.ico" alt="VS Code" class="w-16 h-16 object-contain" />
									</div>
									<div class="flex flex-col gap-1">
										<div class="flex items-center gap-1">
											<span class="font-bricolage text-2xl font-semibold text-black">Setup VS Code</span>
											<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
												<path d="M4.7943 1.01921C4.7943 0.456645 5.25095 0 5.81351 0L14.9808 0.000703475C15.5434 0.000703733 15.9993 0.456645 15.9993 1.01921L16 10.1865C16 10.7491 15.5434 11.2057 14.9808 11.2057C14.4185 11.2056 13.9626 10.7495 13.9623 10.1872V3.47826L1.44054 16L0 14.5595L12.5217 2.03772H5.81281C5.25053 2.03742 4.79437 1.58154 4.7943 1.01921Z" fill="black"/>
											</svg>
										</div>
										<span class="font-bricolage text-base font-semibold text-black/60">VS Code is a popular IDE. You can use it for development!</span>
									</div>
								</a>
							</div>

							<!-- Hackatime -->
							<div class="flex flex-col gap-2 w-full">
								<p class="font-bricolage text-2xl font-bold text-black leading-normal">Set up Hackatime (Required)</p>
								<HackatimeLinkButton bind:linked={hackatimeLinked} variant="card" />
							</div>
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

				{#if isStep2}
					<div class="w-full flex-1">
						<div class="flex flex-col gap-6 w-full">
							<div class="flex flex-col gap-2">
								<h1 class="font-cook text-2xl text-black leading-normal">STEP 2</h1>
								<p class="font-bricolage text-2xl font-medium text-black leading-normal">Pick a project you want to work on!</p>
							</div>

							<div class="flex flex-col gap-4 w-full">
								<p class="font-bricolage text-2xl font-bold text-black leading-normal">Recommended Tutorials</p>
								<a href="https://guides.horizons.hackclub.com/guides/website-guide/" target="_blank" rel="noopener" class="flex gap-2.75 items-center p-4 border-4 border-black rounded-2xl shadow-[4px_4px_0px_0px_black] bg-[#f3e8d8] no-underline text-inherit transition-transform duration-(--juice-duration) ease-(--juice-easing) hover:scale-(--juice-scale)">
									<div class="flex flex-col gap-1">
										<div class="flex items-center gap-1">
											<span class="font-bricolage text-2xl font-semibold text-black">Make your first personal website</span>
											<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
												<path d="M4.7943 1.01921C4.7943 0.456645 5.25095 0 5.81351 0L14.9808 0.000703475C15.5434 0.000703733 15.9993 0.456645 15.9993 1.01921L16 10.1865C16 10.7491 15.5434 11.2057 14.9808 11.2057C14.4185 11.2056 13.9626 10.7495 13.9623 10.1872V3.47826L1.44054 16L0 14.5595L12.5217 2.03772H5.81281C5.25053 2.03742 4.79437 1.58154 4.7943 1.01921Z" fill="black"/>
											</svg>
										</div>
										<span class="font-bricolage text-base font-semibold text-black/60">Build and deploy your own personal website!</span>
									</div>
								</a>
								<a href="https://guides.horizons.hackclub.com/guides/godot-platformer/" target="_blank" rel="noopener" class="flex gap-2.75 items-center p-4 border-4 border-black rounded-2xl shadow-[4px_4px_0px_0px_black] bg-[#f3e8d8] no-underline text-inherit transition-transform duration-(--juice-easing) hover:scale-(--juice-scale)">
									<div class="flex flex-col gap-1">
										<div class="flex items-center gap-1">
											<span class="font-bricolage text-2xl font-semibold text-black">Create your first platformer game</span>
											<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
												<path d="M4.7943 1.01921C4.7943 0.456645 5.25095 0 5.81351 0L14.9808 0.000703475C15.5434 0.000703733 15.9993 0.456645 15.9993 1.01921L16 10.1865C16 10.7491 15.5434 11.2057 14.9808 11.2057C14.4185 11.2056 13.9626 10.7495 13.9623 10.1872V3.47826L1.44054 16L0 14.5595L12.5217 2.03772H5.81281C5.25053 2.03742 4.79437 1.58154 4.7943 1.01921Z" fill="black"/>
											</svg>
										</div>
										<span class="font-bricolage text-base font-semibold text-black/60">Build a platformer game with Godot!</span>
									</div>
								</a>
								<a href="https://guides.horizons.hackclub.com/guides/git-guide/" target="_blank" rel="noopener" class="flex gap-2.75 items-center p-4 border-4 border-black rounded-2xl shadow-[4px_4px_0px_0px_black] bg-[#f3e8d8] no-underline text-inherit transition-transform duration-(--juice-duration) ease-(--juice-easing) hover:scale-(--juice-scale)">
									<div class="flex flex-col gap-1">
										<div class="flex items-center gap-1">
											<span class="font-bricolage text-2xl font-semibold text-black">Learn how to set up git</span>
											<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
												<path d="M4.7943 1.01921C4.7943 0.456645 5.25095 0 5.81351 0L14.9808 0.000703475C15.5434 0.000703733 15.9993 0.456645 15.9993 1.01921L16 10.1865C16 10.7491 15.5434 11.2057 14.9808 11.2057C14.4185 11.2056 13.9626 10.7495 13.9623 10.1872V3.47826L1.44054 16L0 14.5595L12.5217 2.03772H5.81281C5.25053 2.03742 4.79437 1.58154 4.7943 1.01921Z" fill="black"/>
											</svg>
										</div>
										<span class="font-bricolage text-base font-semibold text-black/60">Set up git for your project!</span>
									</div>
								</a>
							</div>

							<p class="font-bricolage text-lg font-medium text-black leading-normal text-center">Once you've figured out what type of project you want to make, hit continue!</p>
						</div>
					</div>
					<button class="card-btn w-103.75 py-2 px-4 border-2 border-black rounded-lg bg-transparent font-bricolage text-base font-semibold text-black cursor-pointer mt-1 transition-[transform,background-color] duration-(--juice-duration) ease-(--juice-easing) hover:scale-(--juice-scale) hover:bg-[#ffa936]" onclick={() => step++}>
						Continue
					</button>
				{/if}

				{#if isStep3}
					<div class="w-full flex-1">
						<div class="flex flex-col gap-6 w-full">
							<div class="flex flex-col gap-2">
								<h1 class="font-cook text-2xl text-black leading-normal">STEP 3</h1>
								<p class="font-bricolage text-2xl font-medium text-black leading-normal">Create your project!</p>
								<p class="font-bricolage text-base font-medium text-black leading-normal">You don't need to have a completed project. You can just put an idea for a new project.</p>
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
</div>

<style>
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
