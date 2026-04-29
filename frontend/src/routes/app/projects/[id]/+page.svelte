<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import heroPlaceholder from '$lib/assets/projects/hero-placeholder.png';
	import InputPrompt from '$lib/components/InputPrompt.svelte';
	import NavigationHint from '$lib/components/NavigationHint.svelte';
	import TurbulentImage from '$lib/components/TurbulentImage.svelte';
	import BackButton from '$lib/components/BackButton.svelte';
	import { createGridNav } from '$lib/nav/wasd.svelte';
	import { projectDetailStore, fetchProjectDetail, preloadEditData } from '$lib/store/projectDetailCache';
	import type { components } from '$lib/api';
	import { EXIT_DURATION } from '$lib';

	type ProjectResponse = components['schemas']['ProjectResponse'];

	const projectId = $derived(page.params.id!);

	let entered = $state(false);
	let navigating = $state(false);
	let feedbackOpen = $state(false);

	onMount(() => {
		requestAnimationFrame(() => requestAnimationFrame(() => { entered = true; }));
	});

	async function navigateTo(href: string) {
		navigating = true;
		await new Promise(resolve => setTimeout(resolve, EXIT_DURATION + 350));
		goto(href);
	}

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
	let isRejected = $derived(latestSubmission?.approvalStatus === 'rejected');

	// Hackatime derived
	let currentHours = $derived(hackatimeInfo?.currentHackatimeHours ?? 0);
	// Show approved hours (set by reviewer) when approved, otherwise show the original submitted hours
	let submittedHours = $derived(
		isApproved
			? (latestSubmission?.approvedHours ?? latestSubmission?.hackatimeHours ?? null)
			: isPending
				? (latestSubmission?.hackatimeHours ?? null)
				: null
	);
	let hoursLabel = $derived(isApproved ? 'approved' : 'submitted');

	const nav = createGridNav({
		columns: () => [1, 1],
		onSelect: (col) => {
			if (col === 0) navigateTo(`/app/projects/${projectId}/edit`);
			else navigateTo(`/app/projects/${projectId}/ship/presubmit`);
		},
		onEscape: () => navigateTo('/app/projects?noanimate'),
	});

	// Preload edit page data when project detail is available
	$effect(() => {
		if (projectId) {
			preloadEditData(projectId);
		}
	});

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			if (feedbackOpen) {
				feedbackOpen = false;
				return;
			}
			navigateTo('/app/projects?noanimate');
			return;
		}
		if (feedbackOpen) return;
		if (!isPending) nav.handleKeydown(e);
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
			style="opacity: {navigating || !entered ? 0 : 1}; transition: opacity 0.4s ease;"
		>
			<TurbulentImage
				src={project.screenshotUrl || heroPlaceholder}
				alt={project.projectTitle}
				inset="0 0 0 0"
				filterId="hero-turbulence"
			/>
		</div>

		<!-- Project details card -->
		<div class="absolute bottom-20 left-1/2 -translate-x-[calc(50%+0.5px)] z-2">
		<div
			class="detail-card w-181.75 bg-[#f3e8d8] border-4 border-black rounded-[20px] p-7.5 shadow-[4px_4px_0px_0px_black] flex flex-col items-start gap-8 overflow-hidden"
			class:exiting={navigating}
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
						tracked {currentHours} hrs{submittedHours !== null ? ` · ${hoursLabel} ${submittedHours} hrs` : ''}
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
				{@const submissionDate = latestSubmission?.createdAt ? new Date(latestSubmission.createdAt) : null}
				{@const daysAgo = submissionDate ? Math.floor((Date.now() - submissionDate.getTime()) / (1000 * 60 * 60 * 24)) : null}
				{@const formattedDate = submissionDate ? `${submissionDate.getMonth() + 1}/${submissionDate.getDate()}/${submissionDate.getFullYear()}` : ''}
				{@const repoUrl = latestSubmission?.repoUrl ?? project?.repoUrl}
				{@const demoUrl = latestSubmission?.playableUrl ?? project?.playableUrl}
				{@const reviewerFeedback = latestSubmission?.hoursJustification}
				{@const step2Color = isApproved ? '#ffa936' : isRejected ? '#e05632' : isPending ? '#ffa936' : '#f3e8d8'}
				{@const step3Color = isApproved ? '#ffa936' : '#f3e8d8'}
				{@const step2Label = isRejected ? 'Rejected' : 'Under Review'}

				<div class="flex flex-col gap-3 w-full border-4 border-black rounded-[20px] p-4">
					<p class="font-cook text-[28px] font-semibold text-black m-0">SUBMISSION TRACKING</p>

					<!-- Arrow progress bar -->
					<svg viewBox="-2 -2 604 52" style="width: 100%; aspect-ratio: 604 / 52; display: block;" xmlns="http://www.w3.org/2000/svg">
						<defs>
							<clipPath id="progress-clip">
								<rect width="600" height="48" rx="11" ry="11" />
							</clipPath>
						</defs>
						<g clip-path="url(#progress-clip)">
							<path d="M 400 0 H 600 V 48 H 400 L 416 24 Z" fill={step3Color} />
							{#if isPending}
							<path d="M 200 0 H 400 L 416 24 L 400 48 H 200 L 216 24 Z" fill={step2Color}>
								<animate attributeName="opacity" values="0.6;0.2;0.6" calcMode="spline" keySplines="0.4 0 0.6 1; 0.4 0 0.6 1" dur="3s" repeatCount="indefinite" />
							</path>
						{:else}
							<path d="M 200 0 H 400 L 416 24 L 400 48 H 200 L 216 24 Z" fill={step2Color} />
						{/if}
							<path d="M 0 0 H 200 L 216 24 L 200 48 H 0 Z" fill="#ffa936" />
						</g>
						<rect width="600" height="48" rx="11" ry="11" fill="none" stroke="black" stroke-width="3" />
						<polyline points="200,0 216,24 200,48" fill="none" stroke="black" stroke-width="2.5" stroke-linejoin="round" />
						<polyline points="400,0 416,24 400,48" fill="none" stroke="black" stroke-width="2.5" stroke-linejoin="round" />
						<text x="100" y="24" dominant-baseline="middle" text-anchor="middle" font-family="'Bricolage Grotesque', sans-serif" font-size="19" fill="black">Submitted</text>
						<text x="308" y="24" dominant-baseline="middle" text-anchor="middle" font-family="'Bricolage Grotesque', sans-serif" font-size="19" fill="black">{step2Label}</text>
						<text x="500" y="24" dominant-baseline="middle" text-anchor="middle" font-family="'Bricolage Grotesque', sans-serif" font-size="19" fill="black">Approved</text>
					</svg>

					<!-- Info Panels -->
					<div class="flex gap-3">
						<!-- Reviewer Feedback -->
						{#if reviewerFeedback}
							<div class="flex-1 bg-[rgba(0,0,0,0.1)] rounded-xl p-4 flex flex-col gap-1 min-w-0">
								<p class="font-bricolage text-[15px] font-bold text-black m-0">Reviewer Feedback</p>
								<p class="font-bricolage text-[14px] text-black m-0 line-clamp-4">{reviewerFeedback}</p>
								<button
									type="button"
									class="font-bricolage text-[13px] font-semibold text-black underline self-start cursor-pointer mt-0.5"
									onclick={() => (feedbackOpen = true)}
								>
									Read more
								</button>
							</div>
						{/if}

						<!-- Links / Date panel -->
						<div class="flex-1 bg-[rgba(0,0,0,0.1)] rounded-xl p-4 flex flex-col gap-1.5 min-w-0">
							{#if repoUrl}
								<a href={repoUrl} target="_blank" rel="noopener noreferrer" class="flex items-center gap-2 font-bricolage text-[15px] text-black">
									<!-- GitHub mark -->
									<svg class="size-4 shrink-0" viewBox="0 0 16 16" fill="black" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
										<path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
									</svg>
									<span class="underline truncate">{repoUrl}</span>
									<svg class="size-3 shrink-0" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
										<path d="M7 1H11M11 1V5M11 1L5 7M2 3H4M2 3V10H9V8" stroke="black" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
									</svg>
								</a>
							{/if}
							{#if demoUrl}
								<a href={demoUrl} target="_blank" rel="noopener noreferrer" class="flex items-center gap-2 font-bricolage text-[15px] text-black">
									<!-- Play triangle -->
									<svg class="size-4 shrink-0" viewBox="0 0 16 16" fill="black" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
										<polygon points="2,1 2,15 15,8"/>
									</svg>
									<span class="underline truncate">{demoUrl}</span>
									<svg class="size-3 shrink-0" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
										<path d="M7 1H11M11 1V5M11 1L5 7M2 3H4M2 3V10H9V8" stroke="black" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
									</svg>
								</a>
							{/if}
							{#if formattedDate}
								<div class="flex items-center gap-2 font-bricolage text-[15px] text-black">
									<!-- Clock -->
									<svg class="size-4 shrink-0" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
										<circle cx="8" cy="8" r="6.5" stroke="black" stroke-width="1.5"/>
										<path d="M8 4.5V8L10 10" stroke="black" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
									</svg>
									<span>Submitted {formattedDate} {#if daysAgo !== null}<span class="text-black/60"> ({daysAgo === 0 ? 'today' : daysAgo === 1 ? '1 day ago' : `${daysAgo} days ago`})</span>{/if}</span>
								</div>
							{/if}
						</div>
					</div>
				</div>
			{/if}

			<div class="flex gap-2.5 w-full justify-center">
				<button
					class="action-btn w-70.25 py-2 px-4 border-2 border-black rounded-lg font-bricolage text-base font-semibold text-black overflow-hidden"
					class:selected={nav.usingKeyboard && nav.isSelected(0, 0)}
					class:keyboard={nav.usingKeyboard}
					class:pending={isPending}
					onclick={() => navigateTo(`/app/projects/${projectId}/edit`)}
					onmouseenter={() => nav.select(0, 0)}
					disabled={isPending}
				>
					EDIT PROJECT
				</button>
				<button
					class="action-btn w-70.25 py-2 px-4 border-2 border-black rounded-lg font-bricolage text-base font-semibold text-black overflow-hidden"
					class:selected={nav.usingKeyboard && nav.isSelected(1, 0)}
					class:keyboard={nav.usingKeyboard}
					class:pending={isPending}
					onclick={() => navigateTo(`/app/projects/${projectId}/ship/presubmit`)}
					onmouseenter={() => nav.select(1, 0)}
					disabled={isPending}
				>
					{hasSubmission ? 'RE-SHIP' : 'SHIP'}
				</button>
			</div>
		</div>
		</div>
	{/if}

	<!-- Reviewer feedback modal -->
	{#if feedbackOpen && latestSubmission?.hoursJustification}
		<div
			class="fixed inset-0 z-50 flex items-center justify-center p-6"
			role="dialog"
			aria-modal="true"
			aria-label="Reviewer feedback"
		>
			<button
				type="button"
				class="absolute inset-0 bg-black/50 cursor-default"
				aria-label="Close reviewer feedback"
				onclick={() => (feedbackOpen = false)}
			></button>
			<div class="relative max-w-2xl w-full max-h-[80vh] bg-[#f3e8d8] border-4 border-black rounded-[20px] p-6 shadow-[4px_4px_0px_0px_black] flex flex-col gap-3 overflow-hidden">
				<div class="flex items-center justify-between gap-4">
					<p class="font-cook text-[28px] font-semibold text-black m-0">REVIEWER FEEDBACK</p>
					<button
						type="button"
						class="font-bricolage text-[14px] font-semibold text-black underline cursor-pointer"
						onclick={() => (feedbackOpen = false)}
					>
						Close
					</button>
				</div>
				<p class="font-bricolage text-[16px] text-black m-0 whitespace-pre-wrap break-words flex-1 min-h-0 overflow-y-auto">{latestSubmission.hoursJustification}</p>
			</div>
		</div>
	{/if}

	<!-- Back button -->
	<BackButton onclick={() => navigateTo('/app/projects?noanimate')} />

	<div class="fade-wrap" class:entered class:exiting={navigating}>
		<NavigationHint
			segments={[
				{ type: 'text', value: 'USE' },
				{ type: 'input', value: 'AD' },
				{ type: 'text', value: 'TO NAVIGATE' }
			]}
			position="bottom-right"
		/>
	</div>
</div>

<style>
	@keyframes card-enter {
		from { transform: translateY(120vh); }
		to   { transform: translateY(0); }
	}

	@keyframes card-exit {
		from { transform: translateY(0); }
		to   { transform: translateY(120vh); }
	}

	.detail-card {
		animation: card-enter var(--enter-duration) var(--enter-easing) both;
	}

	.detail-card.exiting {
		animation: card-exit var(--exit-duration) var(--exit-easing) both;
	}

	.fade-wrap {
		opacity: 0;
	}
	.fade-wrap.entered {
		opacity: 1;
		transition: opacity var(--enter-duration) ease;
	}
	.fade-wrap.exiting {
		opacity: 0;
		transition: opacity 250ms ease;
	}

	.action-btn {
		background-color: #f3e8d8;
		cursor: pointer;
		transition:
			background-color var(--selected-duration) ease,
			transform var(--juice-duration) var(--juice-easing);
	}

	.action-btn.pending {
		background-color: rgba(204, 204, 204, 0.5);
		cursor: not-allowed;
	}

	.action-btn:not(.pending):not(.keyboard):hover,
	.action-btn.selected {
		background-color: #ffa936;
		transform: scale(var(--juice-scale));
	}
</style>
