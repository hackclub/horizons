<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import heroPlaceholder from '$lib/assets/projects/hero-placeholder.png';
	import InputPrompt from '$lib/components/InputPrompt.svelte';
	import TurbulentImage from '$lib/components/TurbulentImage.svelte';
	import BackButton from '$lib/components/BackButton.svelte';
	import { projectDetailStore, fetchProjectDetail, preloadEditData } from '$lib/store/projectDetailCache';
	import type { components } from '$lib/api';

	type ProjectResponse = components['schemas']['ProjectResponse'];

	const projectId = $derived(page.params.id!);

	let detailState = $state<{
		project: ProjectResponse | null;
		submission: any | null;
		loading: boolean;
		error: string | null;
	}>({ project: null, submission: null, loading: true, error: null });
	let unsubscribe: (() => void) | null = null;

	$effect(() => {
		// Subscribe to store updates
		unsubscribe = projectDetailStore.subscribe(state => {
			detailState = state;
		});

		// Fetch project details on mount or ID change
		fetchProjectDetail(projectId).catch(() => {
			// Error is already in store
		});

		return () => {
			unsubscribe?.();
		};
	});

	let project = $derived(detailState.project);
	let loading = $derived(detailState.loading);
	let error = $derived(detailState.error);

	// Submission tracking
	let latestSubmission = $derived(detailState.submission);
	let hasSubmission = $derived(latestSubmission !== null);
	let isPending = $derived(latestSubmission?.approvalStatus === 'pending');
	let isApproved = $derived(latestSubmission?.approvalStatus === 'approved');

	// Preload edit page data when project detail is available
	$effect(() => {
		if (projectId) {
			preloadEditData(projectId);
		}
	});

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			goto('/app/projects?noanimate');
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="relative size-full">
	{#if loading}
		<div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
			<p class="font-cook text-[36px] font-semibold text-black m-0">LOADING...</p>
		</div>
	{:else if error}
		<div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
			<p class="font-cook text-[36px] font-semibold text-black m-0">ERROR</p>
			<p class="font-bricolage text-[32px] font-semibold text-black m-0">{error}</p>
		</div>
	{:else if project}
		<!-- Hero image -->
		<div
			class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[calc(50%+73px)] w-214 h-120.5 z-0 pointer-events-none"
		>
			<TurbulentImage
				src={project.screenshotUrl || heroPlaceholder}
				alt={project.projectTitle}
				inset="0 0 0 0"
				filterId="hero-turbulence"
			/>
		</div>

		<!-- Project details card -->
		<div
			class="absolute bottom-20 left-1/2 -translate-x-[calc(50%+0.5px)] w-181.75 bg-[#f3e8d8] border-4 border-black rounded-[20px] p-7.5 shadow-[4px_4px_0px_0px_black] flex flex-col items-start gap-8 overflow-hidden z-2"
		>
			<div class="flex flex-col gap-2 w-full leading-normal text-black">
				<p class="font-cook text-[36px] font-semibold m-0">
					{project.projectTitle}
				</p>
				{#if project.description}
					<p class="font-bricolage text-[32px] font-semibold m-0">
						{project.description}
					</p>
				{/if}
			</div>

			<!-- Submission Tracker -->
			{#if hasSubmission}
				<div class="border-2 border-black rounded-lg px-5 py-5 flex flex-col gap-3 items-center w-full">
					<p class="font-bricolage text-base font-semibold text-black m-0">Submission Tracker</p>
					<div class="flex gap-4">
						<!-- Submitted -->
						<div class="flex flex-col gap-2 items-center w-[82px]">
							<div class="size-9 border-2 border-black rounded-lg bg-[#f3e8d8] flex items-center justify-center">
								{#if hasSubmission}
									<span class="font-bricolage text-base font-semibold text-black">&#x2714;&#xFE0E;</span>
								{/if}
							</div>
							<p class="font-bricolage text-base font-semibold text-black text-center m-0 leading-normal">Submitted</p>
						</div>
						<!-- Under Review -->
						<div class="flex flex-col gap-2 items-center w-[82px]">
							<div class="size-9 border-2 border-black rounded-lg bg-[#f3e8d8] flex items-center justify-center">
								{#if isPending || isApproved}
									<span class="font-bricolage text-base font-semibold text-black">&#x2714;&#xFE0E;</span>
								{/if}
							</div>
							<p class="font-bricolage text-base font-semibold text-black text-center m-0 leading-normal">Under Review</p>
						</div>
						<!-- Approved -->
						<div class="flex flex-col gap-2 items-center w-[82px]">
							<div class="size-9 border-2 border-black rounded-lg bg-[#f3e8d8] flex items-center justify-center">
								{#if isApproved}
									<span class="font-bricolage text-base font-semibold text-black">&#x2714;&#xFE0E;</span>
								{/if}
							</div>
							<p class="font-bricolage text-base font-semibold text-black text-center m-0 leading-normal">Approved</p>
						</div>
					</div>
				</div>
			{/if}

			<div class="flex gap-2.5 w-full justify-center">
				<button
					class="action-btn w-70.25 py-2 px-4 border-2 border-black rounded-lg font-bricolage text-base font-semibold text-black cursor-pointer overflow-hidden hover:scale-(--juice-scale) {isPending ? 'bg-[rgba(204,204,204,0.5)] cursor-not-allowed' : 'bg-[#ffa936]'}"
					onclick={() => goto(`/app/projects/${projectId}/edit`)}
					disabled={isPending}
				>
					EDIT PROJECT
				</button>
				<button
					class="action-btn w-70.25 py-2 px-4 border-2 border-black rounded-lg font-bricolage text-base font-semibold text-black cursor-pointer overflow-hidden hover:scale-(--juice-scale) {isPending ? 'bg-[rgba(204,204,204,0.5)] cursor-not-allowed' : 'bg-[#ffa936]'}"
					onclick={() => goto(`/app/projects/${projectId}/ship/presubmit`)}
					disabled={isPending}
				>
					{isPending ? "I'M READY TO SHIP" : 'SHIP'}
				</button>
			</div>
		</div>
	{/if}

	<!-- Back button -->
	<BackButton onclick={() => goto('/app/projects?noanimate')} />
</div>

<style>
	.action-btn {
		transition:
			background-color var(--selected-duration) ease,
			scale var(--juice-duration) var(--juice-easing);
	}
</style>
