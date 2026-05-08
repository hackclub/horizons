<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import heroPlaceholder from '$lib/assets/projects/hero-placeholder.png';
	import TurbulentImage from '$lib/components/TurbulentImage.svelte';
	import BackButton from '$lib/components/BackButton.svelte';
	import { api, type components } from '$lib/api';
	import { EXIT_DURATION } from '$lib';
	import { onMount } from 'svelte';

	type PublicProject = components['schemas']['PublicProjectResponse'];

	const projectId = $derived(page.params.id!);

	let project = $state<PublicProject | null>(null);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let entered = $state(false);
	let navigating = $state(false);
	let canReview = $state(false);

	onMount(() => {
		requestAnimationFrame(() => requestAnimationFrame(() => { entered = true; }));
		// Best-effort: if the viewer is signed in as a reviewer/admin, surface a
		// shortcut into the review tool. Failures (401 for logged-out viewers) are
		// expected and silently ignored — this is a public page.
		api
			.GET('/api/user/auth/me')
			.then(({ data }) => {
				const role = data?.role;
				canReview = role === 'reviewer' || role === 'admin' || role === 'superadmin';
			})
			.catch(() => {});
	});

	$effect(() => {
		const id = Number(projectId);
		if (!Number.isFinite(id) || id <= 0) {
			loading = false;
			error = 'Project not found';
			return;
		}
		loading = true;
		error = null;
		project = null;
		api
			.GET('/api/projects/{id}', { params: { path: { id } } })
			.then((res) => {
				if (!res.data) {
					error = res.response?.status === 404 ? 'Project not found' : 'Failed to load project';
					return;
				}
				project = res.data;
			})
			.catch(() => {
				error = 'Failed to load project';
			})
			.finally(() => {
				loading = false;
			});
	});

	async function navigateTo(href: string) {
		navigating = true;
		await new Promise((resolve) => setTimeout(resolve, EXIT_DURATION + 350));
		goto(href);
	}

	const PROJECT_TYPE_LABELS: Record<string, string> = {
		windows_playable: 'Windows app',
		mac_playable: 'Mac app',
		linux_playable: 'Linux app',
		web_playable: 'Web app',
		cross_platform_playable: 'Cross-platform',
		hardware: 'Hardware',
		mobile_app: 'Mobile app',
	};

	function formatType(type: string | undefined): string {
		if (!type) return '';
		return PROJECT_TYPE_LABELS[type] ?? type.replace(/_/g, ' ');
	}

	let authorName = $derived(
		project
			? [project.user.firstName, project.user.lastName].filter(Boolean).join(' ').trim()
			: '',
	);

	let pageTitle = $derived(project ? `${project.projectTitle} — Horizons` : 'Project — Horizons');
	let metaDescription = $derived(project?.description ?? '');
	let ogImage = $derived(project?.screenshotUrl ?? '');
</script>

<svelte:head>
	<title>{pageTitle}</title>
	{#if metaDescription}
		<meta name="description" content={metaDescription} />
		<meta property="og:description" content={metaDescription} />
		<meta name="twitter:description" content={metaDescription} />
	{/if}
	{#if project}
		<meta property="og:title" content={project.projectTitle} />
		<meta name="twitter:title" content={project.projectTitle} />
		<meta property="og:type" content="article" />
	{/if}
	{#if ogImage}
		<meta property="og:image" content={ogImage} />
		<meta name="twitter:image" content={ogImage} />
		<meta name="twitter:card" content="summary_large_image" />
	{/if}
</svelte:head>

<div class="relative size-full">
	{#if loading}
		<div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
			<p class="font-cook text-[36px] font-semibold text-black m-0">LOADING...</p>
		</div>
	{:else if error || !project}
		<div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center px-4">
			<p class="font-cook text-[36px] font-semibold text-black m-0">NOT FOUND</p>
			<p class="font-bricolage text-[20px] sm:text-[24px] font-semibold text-black m-0 max-w-md">
				{error ?? "We couldn't find that project."}
			</p>
		</div>
	{:else}
		<!-- Hero image (desktop) -->
		<div
			class="hidden sm:block absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[calc(50%+73px)] w-214 h-120.5 z-0 pointer-events-none"
			style="opacity: {navigating || !entered ? 0 : 1}; transition: opacity 0.4s ease;"
		>
			<TurbulentImage
				src={project.screenshotUrl || heroPlaceholder}
				alt={project.projectTitle}
				inset="0 0 0 0"
				filterId="public-hero-turbulence"
			/>
		</div>

		<!-- Mobile hero -->
		<div class="block sm:hidden w-full h-56 mt-20 mb-4 px-4 z-0 pointer-events-none">
			<img
				src={project.screenshotUrl || heroPlaceholder}
				alt={project.projectTitle}
				class="w-full h-full object-cover rounded-[20px] border-4 border-black"
				style="opacity: {navigating || !entered ? 0 : 1}; transition: opacity 0.4s ease;"
			/>
		</div>

		<div class="relative w-full px-4 pb-8 sm:absolute sm:bottom-20 sm:left-1/2 sm:-translate-x-[calc(50%+0.5px)] sm:px-0 sm:pb-0 sm:w-auto z-2">
			<div
				class="detail-card w-full sm:w-181.75 bg-[#f3e8d8] border-4 border-black rounded-[20px] p-5 sm:p-7.5 shadow-[4px_4px_0px_0px_black] flex flex-col items-start gap-5 sm:gap-7 overflow-hidden"
				class:exiting={navigating}
			>
				<div class="flex flex-col gap-2 w-full leading-normal text-black">
					<div class="flex items-baseline justify-between gap-3 flex-wrap">
						<p class="font-cook text-[26px] sm:text-[36px] font-semibold m-0 break-words">
							{project.projectTitle}
						</p>
						{#if project.projectType}
							<span class="font-bricolage text-sm font-semibold bg-black text-[#f3e8d8] px-2 py-0.5 rounded-sm whitespace-nowrap uppercase tracking-wide">
								{formatType(project.projectType)}
							</span>
						{/if}
					</div>
					{#if authorName}
						<p class="font-bricolage text-[18px] sm:text-[22px] font-semibold text-black/60 m-0">
							by {authorName}
						</p>
					{/if}
					{#if project.description}
						<p class="font-bricolage text-[18px] sm:text-[24px] font-semibold m-0 break-words mt-2">
							{project.description}
						</p>
					{/if}
				</div>

				{#if project.playableUrl || project.repoUrl || project.readmeUrl || project.journalUrl}
					<div class="flex flex-col gap-1.5 w-full bg-[rgba(0,0,0,0.08)] rounded-xl p-4">
						{#if project.playableUrl}
							<a href={project.playableUrl} target="_blank" rel="noopener noreferrer" class="flex items-center gap-2 font-bricolage text-[15px] text-black">
								<svg class="size-4 shrink-0" viewBox="0 0 16 16" fill="black" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
									<polygon points="2,1 2,15 15,8" />
								</svg>
								<span class="underline truncate">{project.playableUrl}</span>
							</a>
						{/if}
						{#if project.repoUrl}
							<a href={project.repoUrl} target="_blank" rel="noopener noreferrer" class="flex items-center gap-2 font-bricolage text-[15px] text-black">
								<svg class="size-4 shrink-0" viewBox="0 0 16 16" fill="black" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
									<path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
								</svg>
								<span class="underline truncate">{project.repoUrl}</span>
							</a>
						{/if}
						{#if project.readmeUrl}
							<a href={project.readmeUrl} target="_blank" rel="noopener noreferrer" class="flex items-center gap-2 font-bricolage text-[15px] text-black">
								<svg class="size-4 shrink-0" viewBox="0 0 16 16" fill="none" stroke="black" stroke-width="1.5" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
									<path d="M3 2.5h7l3 3V13a.5.5 0 0 1-.5.5h-9.5A.5.5 0 0 1 2.5 13V3a.5.5 0 0 1 .5-.5z" />
									<path d="M10 2.5v3h3" />
									<path d="M5 8h6M5 10.5h6M5 5.5h2" stroke-linecap="round" />
								</svg>
								<span class="underline truncate">README</span>
							</a>
						{/if}
						{#if project.journalUrl}
							<a href={project.journalUrl} target="_blank" rel="noopener noreferrer" class="flex items-center gap-2 font-bricolage text-[15px] text-black">
								<svg class="size-4 shrink-0" viewBox="0 0 16 16" fill="none" stroke="black" stroke-width="1.5" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
									<path d="M3 2h8a1 1 0 0 1 1 1v11l-2.5-1.5L8 14l-1.5-1.5L4 14V3a1 1 0 0 1 1-1z" />
								</svg>
								<span class="underline truncate">Journal</span>
							</a>
						{/if}
					</div>
				{/if}
			</div>
		</div>
	{/if}

	<BackButton onclick={() => navigateTo('/')} />

	{#if canReview && project}
		<a
			href="/admin/review/{project.projectId}"
			class="review-shortcut fixed sm:absolute right-4 top-4 sm:right-8 sm:top-13 z-5 flex items-center gap-2 px-3 sm:px-5 py-2 sm:py-3 bg-[#f3e8d8] border-4 border-black rounded-[14px] sm:rounded-[20px] shadow-[4px_4px_0px_0px_black] no-underline cursor-pointer overflow-hidden"
			class:entered
			class:exiting={navigating}
			title="Open this project in the review tool"
		>
			<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
				<path d="M9 11l3 3 8-8" />
				<path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
			</svg>
			<span class="font-bricolage text-sm sm:text-base font-semibold text-black">SHOW IN REVIEW</span>
		</a>
	{/if}
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

	.review-shortcut {
		transform: translateX(120vw);
		transition: background-color var(--selected-duration) ease, transform var(--juice-duration) var(--juice-easing);
	}
	.review-shortcut.entered {
		transform: translateX(0);
		transition: transform var(--enter-duration) var(--enter-easing);
	}
	.review-shortcut.exiting {
		transform: translateX(120vw);
		transition: transform var(--exit-duration) var(--exit-easing);
	}
	@media (hover: hover) {
		.review-shortcut:hover {
			background-color: #ffa936;
			transform: scale(var(--juice-scale));
		}
	}
</style>
