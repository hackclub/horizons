<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import heroPlaceholder from '$lib/assets/projects/hero-placeholder.png';
	import InputPrompt from '$lib/components/InputPrompt.svelte';
	import NavigationHint from '$lib/components/NavigationHint.svelte';
	import TurbulentImage from '$lib/components/TurbulentImage.svelte';
	import BackButton from '$lib/components/BackButton.svelte';
	import { projectDetailStore, fetchProjectDetail, preloadEditData } from '$lib/store/projectDetailCache';
	import type { components } from '$lib/api';

	type ProjectResponse = components['schemas']['ProjectResponse'];

	const projectId = $derived(page.params.id!);

	let detailState = $state<{
		project: ProjectResponse | null;
		submission: any | null;
		hackatimeInfo: { hackatimeProjects: string[]; currentHackatimeHours: number; hackatimeProjectHours: Record<string, number>; lastSubmittedHours: number | null } | null;
		loading: boolean;
		error: string | null;
	}>({ project: null, submission: null, hackatimeInfo: null, loading: true, error: null });
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
	let hackatimeInfo = $derived(detailState.hackatimeInfo);

	// Submission tracking
	let latestSubmission = $derived(detailState.submission);
	let hasSubmission = $derived(latestSubmission !== null);
	let isPending = $derived(latestSubmission?.approvalStatus === 'pending');
	let isApproved = $derived(latestSubmission?.approvalStatus === 'approved');

	// Hackatime derived
	let currentHours = $derived(hackatimeInfo?.currentHackatimeHours ?? 0);
	let pendingHours = $derived(isPending ? (latestSubmission?.hackatimeHours ?? null) : null);

	// Button navigation (left/right arrows)
	let selectedButton = $state(0);

	function handleNavigationKeydown(e: KeyboardEvent) {
		if (isPending) return;

		if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
			e.preventDefault();
			selectedButton = Math.max(0, selectedButton - 1);
		} else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
			e.preventDefault();
			selectedButton = Math.min(1, selectedButton + 1);
		} else if (e.key === 'Enter') {
			if (selectedButton === 0) {
				goto(`/app/projects/${projectId}/edit`);
			} else if (selectedButton === 1) {
				goto(`/app/projects/${projectId}/ship/presubmit`);
			}
		}
	}

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
		handleNavigationKeydown(e);
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
				<!-- Hackatime Hours & Linked Projects -->
				{#if hackatimeInfo}
					<p class="font-bricolage text-[22px] font-semibold text-black/60 m-0">
						tracked {currentHours} hrs{pendingHours !== null ? ` · submitted ${pendingHours} hrs` : ''}
					</p>
					{#if hackatimeInfo.hackatimeProjects.length > 0}
						<div class="flex flex-wrap gap-1">
							{#each hackatimeInfo.hackatimeProjects as name}
								<span class="bg-black text-[#f3e8d8] font-bricolage text-sm font-semibold px-2 py-0.5 rounded-sm whitespace-nowrap">
									{name}
								</span>
							{/each}
						</div>
					{/if}
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
					class="action-btn w-70.25 py-2 px-4 border-2 border-black rounded-lg font-bricolage text-base font-semibold text-black cursor-pointer overflow-hidden {isPending ? 'bg-[rgba(204,204,204,0.5)] cursor-not-allowed' : 'bg-[#ffa936]'} {selectedButton === 0 ? 'selected' : ''}"
					onclick={() => goto(`/app/projects/${projectId}/edit`)}
					onfocus={() => selectedButton = 0}
					disabled={isPending}
				>
					EDIT PROJECT
				</button>
				<button
					class="action-btn w-70.25 py-2 px-4 border-2 border-black rounded-lg font-bricolage text-base font-semibold text-black cursor-pointer overflow-hidden {isPending ? 'bg-[rgba(204,204,204,0.5)] cursor-not-allowed' : 'bg-[#ffa936]'} {selectedButton === 1 ? 'selected' : ''}"
					onclick={() => goto(`/app/projects/${projectId}/ship/presubmit`)}
					onfocus={() => selectedButton = 1}
					disabled={isPending}
				>
					{isPending ? "I'M READY TO SHIP" : 'SHIP'}
				</button>
			</div>
		</div>
	{/if}

	<!-- Back button -->
	<BackButton onclick={() => goto('/app/projects?noanimate')} />

	<NavigationHint
		segments={[
			{ type: 'text', value: 'USE' },
			{ type: 'input', value: 'AD' },
			{ type: 'text', value: 'TO NAVIGATE' }
		]}
		position="bottom-right"
	/>
</div>

<style>
	.action-btn {
		background-color: #f3e8d8 !important;
		transition:
			background-color var(--selected-duration) ease,
			transform var(--juice-duration) var(--juice-easing),
			font-size var(--juice-duration) var(--juice-easing);
	}

	.action-btn.selected {
		background-color: #ffa936 !important;
		transform: scale(var(--juice-scale));
		font-size: 1.0625rem;
	}
</style>
