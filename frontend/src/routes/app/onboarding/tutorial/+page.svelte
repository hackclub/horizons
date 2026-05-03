<script lang="ts">
	import { goto } from '$app/navigation';
	import { api } from '$lib/api';
	import beanSiblingsSide from '$lib/assets/onboarding/bean-siblings-side.png';
	import HackatimeLinkButton from '$lib/components/HackatimeLinkButton.svelte';
	import { FormField, FormTextarea, FileUpload, FormError } from '$lib/components/form';
	import { invalidateAllProjectCaches } from '$lib/store/projectDetailCache';
	import { m } from '$lib/paraglide/messages.js';

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
			projectError = m.app_tutorial_error_required_fields();
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
			let message = response.statusText || m.app_tutorial_error_unknown();
			try {
				const body = await response.json();
				if (body?.message) message = Array.isArray(body.message) ? body.message.join(', ') : body.message;
			} catch {}
			projectError = m.app_tutorial_error_create_project({ message });
		}

		projectSubmitting = false;
	}
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="absolute inset-0 flex flex-col items-center overflow-y-auto overflow-x-hidden" style="cursor: {isDialogStep ? 'pointer' : 'default'};" onclick={isDialogStep ? () => step++ : undefined}>

	<!-- Dialog step: Jelly excited -->
	{#if isDialogStep}
		<div class="absolute bottom-20 left-1/2 -translate-x-[calc(50%-30px)] w-181.75">
			<div class="absolute bottom-5 -left-20 -z-1">
				<img src={beanSiblingsSide} alt={m.app_tutorial_alt_bean_siblings()} class="h-45 object-contain" />
			</div>
			<div class="relative w-full min-h-45 bg-[#f3e8d8] border-4 border-black rounded-[20px] shadow-[4px_4px_0px_0px_black] p-7.5 flex flex-col gap-4">
				<div class="flex flex-col gap-2">
					<p class="font-cook text-2xl text-black">{m.app_tutorial_speaker_bean()}</p>
					<p class="font-bricolage text-2xl font-semibold text-black leading-normal">{m.app_tutorial_intro_text()}</p>
				</div>
				<p class="font-bricolage text-sm font-semibold text-black mt-2 animate-blink">{m.app_tutorial_click_to_continue()}</p>
			</div>
		</div>
	{/if}

	<!-- Card steps -->
	{#if !isDialogStep}
		<div class="w-full flex items-center justify-center py-8 my-auto">
			<div class="relative">
				<div class="absolute -top-7.5 -left-22.5 z-0">
					<img src={beanSiblingsSide} alt={m.app_tutorial_alt_bean_siblings()} class="h-45 object-contain" />
				</div>
				<div class="relative z-1 w-181.75 min-h-165.5 bg-[#f3e8d8] border-4 border-black rounded-[20px] p-7.5 shadow-[4px_4px_0px_0px_black] flex flex-col justify-between items-center overflow-hidden">
				{#if isStep1}
					<div class="w-full flex-1">
						<div class="flex flex-col gap-6 w-full">
							<div class="flex flex-col gap-2">
								<h1 class="font-cook text-2xl text-black leading-normal">{m.app_tutorial_step1_title()}</h1>
								<p class="font-bricolage text-2xl font-medium text-black leading-normal">{m.app_tutorial_step1_subtitle()}</p>
							</div>

							<!-- Install IDE -->
							<div class="flex flex-col gap-2 w-full">
								<p class="font-bricolage text-2xl font-bold text-black leading-normal">
									{m.app_tutorial_install_ide()} <span class="opacity-40">{m.app_tutorial_recommended()}</span>
								</p>
								<a href="https://code.visualstudio.com/docs/setup/setup-overview" target="_blank" rel="noopener" class="flex gap-2.75 items-center p-4 border-4 border-black rounded-2xl shadow-[4px_4px_0px_0px_black] bg-[#f3e8d8] no-underline text-inherit transition-transform duration-(--juice-duration) ease-(--juice-easing) hover:scale-(--juice-scale)">
									<div class="bg-black/5 p-2 rounded-lg flex items-center shrink-0">
										<img src="https://code.visualstudio.com/favicon.ico" alt={m.app_tutorial_alt_vscode()} class="w-16 h-16 object-contain" />
									</div>
									<div class="flex flex-col gap-1">
										<div class="flex items-center gap-1">
											<span class="font-bricolage text-2xl font-semibold text-black">{m.app_tutorial_setup_vscode()}</span>
											<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
												<path d="M4.7943 1.01921C4.7943 0.456645 5.25095 0 5.81351 0L14.9808 0.000703475C15.5434 0.000703733 15.9993 0.456645 15.9993 1.01921L16 10.1865C16 10.7491 15.5434 11.2057 14.9808 11.2057C14.4185 11.2056 13.9626 10.7495 13.9623 10.1872V3.47826L1.44054 16L0 14.5595L12.5217 2.03772H5.81281C5.25053 2.03742 4.79437 1.58154 4.7943 1.01921Z" fill="black"/>
											</svg>
										</div>
										<span class="font-bricolage text-base font-semibold text-black/60">{m.app_tutorial_vscode_desc()}</span>
									</div>
								</a>
							</div>

							<!-- Hackatime -->
							<div class="flex flex-col gap-2 w-full">
								<p class="font-bricolage text-2xl font-bold text-black leading-normal">{m.app_tutorial_setup_hackatime()}</p>
								<HackatimeLinkButton bind:linked={hackatimeLinked} variant="card" />
							</div>
						</div>
					</div>
					<button
						class="juice-btn card-btn w-103.75 py-2 px-4 border-2 border-black rounded-lg bg-transparent font-bricolage text-base font-semibold text-black cursor-pointer hover:not-disabled:scale-(--juice-scale) hover:not-disabled:bg-[#ffa936] disabled:opacity-40 disabled:cursor-default"
						class:card-continue-ready={hackatimeLinked}
						onclick={() => step++}
						disabled={!hackatimeLinked}
					>
						{m.app_tutorial_continue()}
					</button>
				{/if}

				{#if isStep2}
					<div class="w-full flex-1">
						<div class="flex flex-col gap-6 w-full">
							<div class="flex flex-col gap-2">
								<h1 class="font-cook text-2xl text-black leading-normal">{m.app_tutorial_step2_title()}</h1>
								<p class="font-bricolage text-2xl font-medium text-black leading-normal">{m.app_tutorial_step2_subtitle()}</p>
							</div>

							<div class="flex flex-col gap-4 w-full">
								<p class="font-bricolage text-2xl font-bold text-black leading-normal">{m.app_tutorial_recommended_tutorials()}</p>
								<a href="https://guides.horizons.hackclub.com/guides/website-guide/" target="_blank" rel="noopener" class="flex gap-2.75 items-center p-4 border-4 border-black rounded-2xl shadow-[4px_4px_0px_0px_black] bg-[#f3e8d8] no-underline text-inherit transition-transform duration-(--juice-duration) ease-(--juice-easing) hover:scale-(--juice-scale)">
									<div class="flex flex-col gap-1">
										<div class="flex items-center gap-1">
											<span class="font-bricolage text-2xl font-semibold text-black">{m.app_tutorial_guide_website_title()}</span>
											<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
												<path d="M4.7943 1.01921C4.7943 0.456645 5.25095 0 5.81351 0L14.9808 0.000703475C15.5434 0.000703733 15.9993 0.456645 15.9993 1.01921L16 10.1865C16 10.7491 15.5434 11.2057 14.9808 11.2057C14.4185 11.2056 13.9626 10.7495 13.9623 10.1872V3.47826L1.44054 16L0 14.5595L12.5217 2.03772H5.81281C5.25053 2.03742 4.79437 1.58154 4.7943 1.01921Z" fill="black"/>
											</svg>
										</div>
										<span class="font-bricolage text-base font-semibold text-black/60">{m.app_tutorial_guide_website_desc()}</span>
									</div>
								</a>
								<a href="https://guides.horizons.hackclub.com/guides/godot-guide/" target="_blank" rel="noopener" class="flex gap-2.75 items-center p-4 border-4 border-black rounded-2xl shadow-[4px_4px_0px_0px_black] bg-[#f3e8d8] no-underline text-inherit transition-transform duration-(--juice-duration) ease-(--juice-easing) hover:scale-(--juice-scale)">
									<div class="flex flex-col gap-1">
										<div class="flex items-center gap-1">
											<span class="font-bricolage text-2xl font-semibold text-black">{m.app_tutorial_guide_platformer_title()}</span>
											<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
												<path d="M4.7943 1.01921C4.7943 0.456645 5.25095 0 5.81351 0L14.9808 0.000703475C15.5434 0.000703733 15.9993 0.456645 15.9993 1.01921L16 10.1865C16 10.7491 15.5434 11.2057 14.9808 11.2057C14.4185 11.2056 13.9626 10.7495 13.9623 10.1872V3.47826L1.44054 16L0 14.5595L12.5217 2.03772H5.81281C5.25053 2.03742 4.79437 1.58154 4.7943 1.01921Z" fill="black"/>
											</svg>
										</div>
										<span class="font-bricolage text-base font-semibold text-black/60">{m.app_tutorial_guide_platformer_desc()}</span>
									</div>
								</a>
								<a href="https://guides.horizons.hackclub.com/guides/git-guide/" target="_blank" rel="noopener" class="flex gap-2.75 items-center p-4 border-4 border-black rounded-2xl shadow-[4px_4px_0px_0px_black] bg-[#f3e8d8] no-underline text-inherit transition-transform duration-(--juice-duration) ease-(--juice-easing) hover:scale-(--juice-scale)">
									<div class="flex flex-col gap-1">
										<div class="flex items-center gap-1">
											<span class="font-bricolage text-2xl font-semibold text-black">{m.app_tutorial_guide_git_title()}</span>
											<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
												<path d="M4.7943 1.01921C4.7943 0.456645 5.25095 0 5.81351 0L14.9808 0.000703475C15.5434 0.000703733 15.9993 0.456645 15.9993 1.01921L16 10.1865C16 10.7491 15.5434 11.2057 14.9808 11.2057C14.4185 11.2056 13.9626 10.7495 13.9623 10.1872V3.47826L1.44054 16L0 14.5595L12.5217 2.03772H5.81281C5.25053 2.03742 4.79437 1.58154 4.7943 1.01921Z" fill="black"/>
											</svg>
										</div>
										<span class="font-bricolage text-base font-semibold text-black/60">{m.app_tutorial_guide_git_desc()}</span>
									</div>
								</a>
							</div>

							<p class="font-bricolage text-lg font-medium text-black leading-normal text-center">{m.app_tutorial_step2_continue_hint()}</p>
						</div>
					</div>
					<button class="juice-btn card-btn w-103.75 py-2 px-4 border-2 border-black rounded-lg bg-transparent font-bricolage text-base font-semibold text-black cursor-pointer mt-1 hover:scale-(--juice-scale) hover:bg-[#ffa936]" onclick={() => step++}>
						{m.app_tutorial_continue()}
					</button>
				{/if}

				{#if isStep3}
					<div class="w-full flex-1">
						<div class="flex flex-col gap-6 w-full">
							<div class="flex flex-col gap-2">
								<h1 class="font-cook text-2xl text-black leading-normal">{m.app_tutorial_step3_title()}</h1>
								<p class="font-bricolage text-2xl font-medium text-black leading-normal">{m.app_tutorial_step3_subtitle()}</p>
								<p class="font-bricolage text-base font-medium text-black leading-normal">{m.app_tutorial_step3_desc()}</p>
								<p class="font-bricolage text-base font-medium text-black/60 leading-normal">{m.app_tutorial_step3_disclaimer()}</p>
							</div>
							<div class="flex flex-col gap-4 w-full">
								<FormField label={m.app_tutorial_label_title()} id="title" placeholder={m.app_tutorial_placeholder_title()} maxlength={30} bind:value={projectTitle} />
								<FormTextarea label={m.app_tutorial_label_description()} id="description" placeholder={m.app_tutorial_placeholder_description()} maxlength={500} bind:value={projectDescription} />
								<div class="flex flex-col gap-1 w-full">
									<label class="font-bricolage text-base font-semibold text-black leading-normal">{m.app_tutorial_label_screenshot()} <span class="opacity-60">{m.app_tutorial_optional()}</span></label>
									<FileUpload label="" hideHint bind:mediaUrl bind:mediaPreview onerror={(msg) => projectError = msg} />
								</div>
							</div>
						</div>
					</div>
					<div class="flex flex-col gap-2 w-full">
						<FormError message={projectError} />
						<button
							class="juice-btn card-btn w-103.75 py-2 px-4 border-2 border-black rounded-lg bg-transparent font-bricolage text-base font-semibold text-black cursor-pointer self-center hover:scale-(--juice-scale) hover:bg-[#ffa936] disabled:opacity-60 disabled:cursor-default"
							class:card-submit-ready={projectFormReady}
							onclick={handleProjectSubmit}
							disabled={projectSubmitting}
						>
							{projectSubmitting ? m.app_tutorial_creating() : m.app_tutorial_create_project_btn()}
						</button>
					</div>
				{/if}
			</div>
			</div>
		</div>
	{/if}
</div>

<style>
	.juice-btn {
		transition: scale var(--juice-duration) var(--juice-easing),
		            background-color 0.2s ease-in-out;
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
