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
<div class="onboarding" style="cursor: {isDialogStep ? 'pointer' : 'default'};" onclick={isDialogStep ? () => step++ : undefined}>

	<!-- Dialog step: Jelly excited -->
	{#if isDialogStep}
		<div class="dialog-wrapper">
			<div class="character-side">
				<img src={beanSiblingsSide} alt="Bean siblings" class="character-img-side" />
			</div>
			<div class="dialog-box">
				<div class="dialog-content">
					<p class="speaker-name font-cook">JELLY</p>
					<p class="speaker-text font-bricolage">WOOOOO!! I'm so excited for you to build your first project!</p>
				</div>
				<p class="click-hint font-bricolage">Click anywhere to continue</p>
			</div>
		</div>
	{/if}

	<!-- Card steps -->
	{#if !isDialogStep}
		<div class="card-step-wrapper">
			<div class="character-card-corner">
				<img src={beanSiblingsSide} alt="Bean siblings" class="character-img-side" />
			</div>
			<div class="centered-card">
				{#if isStep1}
					<div class="card-body">
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
								<a href="https://code.visualstudio.com/docs/setup/setup-overview" target="_blank" rel="noopener" class="resource-card">
									<div class="resource-icon">
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
					<button class="card-continue-btn font-bricolage" class:card-continue-ready={hackatimeLinked} onclick={() => step++} disabled={!hackatimeLinked}>
						Continue
					</button>
				{/if}

				{#if isStep2}
					<div class="card-body">
						<div class="flex flex-col gap-6 w-full">
							<div class="flex flex-col gap-2">
								<h1 class="font-cook text-2xl text-black leading-normal">STEP 2</h1>
								<p class="font-bricolage text-2xl font-medium text-black leading-normal">Pick a project you want to work on!</p>
							</div>

							<div class="flex flex-col gap-2 w-full">
								<p class="font-bricolage text-2xl font-bold text-black leading-normal">Recommended Tutorials</p>
								<a href="https://kaplayjs.com/" target="_blank" rel="noopener" class="resource-card">
									<div class="resource-icon">
										<img src="https://kaplayjs.com/_astro/kaplay-logo-sm-og.DN-EC99e_Z1kkjtN.png" alt="Kaplay" class="w-16 h-16 object-contain" />
									</div>
									<div class="flex flex-col gap-1">
										<div class="flex items-center gap-1">
											<span class="font-bricolage text-2xl font-semibold text-black">Kaplay Guide</span>
											<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
												<path d="M4.7943 1.01921C4.7943 0.456645 5.25095 0 5.81351 0L14.9808 0.000703475C15.5434 0.000703733 15.9993 0.456645 15.9993 1.01921L16 10.1865C16 10.7491 15.5434 11.2057 14.9808 11.2057C14.4185 11.2056 13.9626 10.7495 13.9623 10.1872V3.47826L1.44054 16L0 14.5595L12.5217 2.03772H5.81281C5.25053 2.03742 4.79437 1.58154 4.7943 1.01921Z" fill="black"/>
											</svg>
										</div>
										<span class="font-bricolage text-base font-semibold text-black/60">Build your first game with Kaplay!</span>
									</div>
								</a>
							</div>

							<p class="font-bricolage text-2xl font-medium text-black leading-normal">Once you've figured out what type of project you want to make, hit continue!</p>
						</div>
					</div>
					<button class="card-continue-btn font-bricolage" onclick={() => step++}>
						Continue
					</button>
				{/if}

				{#if isStep3}
					<div class="card-body">
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
						<button class="card-submit-btn font-bricolage" class:card-submit-ready={projectFormReady} onclick={handleProjectSubmit} disabled={projectSubmitting}>
							{projectSubmitting ? 'Creating...' : 'Create Project'}
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
	}

	.speaker-text {
		font-size: 24px;
		font-weight: 600;
		color: black;
		line-height: normal;
	}

	.click-hint {
		font-size: 14px;
		font-weight: 600;
		color: black;
		margin-top: 8px;
		animation: blink 1s ease-in-out infinite;
	}

	@keyframes blink {
		0%, 100% { opacity: 0.6; }
		50% { opacity: 0.2; }
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
		overflow-y: auto;
	}

	.card-body {
		width: 100%;
		flex: 1;
	}

	.resource-card {
		display: flex;
		gap: 11px;
		align-items: center;
		padding: 16px;
		border: 4px solid black;
		border-radius: 16px;
		box-shadow: 4px 4px 0px 0px black;
		background-color: #f3e8d8;
		text-decoration: none;
		color: inherit;
		transition: transform var(--juice-duration) var(--juice-easing);
	}

	.resource-card:hover {
		transform: scale(var(--juice-scale));
	}

	.resource-icon {
		background-color: rgba(0, 0, 0, 0.05);
		padding: 8px;
		border-radius: 8px;
		display: flex;
		align-items: center;
		flex-shrink: 0;
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
</style>
