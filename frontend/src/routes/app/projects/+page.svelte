<script lang="ts">
	import { tick, onMount } from 'svelte';
	import { page } from '$app/state';
	import heroPlaceholder from '$lib/assets/projects/hero-placeholder.png';
	import { goto } from '$app/navigation';
	import InputPrompt from '$lib/components/InputPrompt.svelte';
	import NavigationHint from '$lib/components/NavigationHint.svelte';
	import TurbulentImage from '$lib/components/TurbulentImage.svelte';
	import { createListNav } from '$lib/nav/wasd.svelte';
	import { projectsStore, fetchProjects } from '$lib/store/projectCache';
	import { fetchProjectDetail, submissionStatusMap } from '$lib/store/projectDetailCache';
	import type { components } from '$lib/api';
	import { EXIT_DURATION } from '$lib';
	import BackButton from '$lib/components/BackButton.svelte';
	import { m } from '$lib/paraglide/messages.js';

	type ProjectResponse = components['schemas']['ProjectResponse'];

	let entered = $state(false);
	let navigating = $state(false);
	let backExiting = $state(false);

	onMount(() => {
		requestAnimationFrame(() => requestAnimationFrame(() => { entered = true; }));
	});

	async function navigateTo(href: string, opts: { exitBack?: boolean } = {}) {
		navigating = true;
		if (opts.exitBack) backExiting = true;
		await new Promise(resolve => setTimeout(resolve, EXIT_DURATION + 350));
		goto(href);
	}

	let projectState = $state<{ projects: ProjectResponse[]; loading: boolean; error: string | null }>({ projects: [], loading: true, error: null });
	let unsubscribe: (() => void) | null = null;

	$effect(() => {
		// Subscribe to store updates
		unsubscribe = projectsStore.subscribe(state => {
			projectState = state;
		});

		// Fetch projects on mount
		fetchProjects().catch(() => {
			// Error is already in store
		});

		return () => {
			unsubscribe?.();
		};
	});

	let projects = $derived(projectState.projects);
	let loading = $derived(projectState.loading);
	let error = $derived(projectState.error);

	let statusMap = $state<Record<string, string | null>>({});
	let statusUnsub: (() => void) | null = null;

	$effect(() => {
		statusUnsub = submissionStatusMap.subscribe(m => { statusMap = m; });
		return () => { statusUnsub?.(); };
	});

	let scrollOffset = $state(0);
	let listEl: HTMLDivElement;
	let clickWasSelected = false;

	let windowWidth = $state(0);
	let isMobile = $derived(windowWidth > 0 && windowWidth < 640);

	const nav = createListNav({
		count: () => projects.length + 1, // +1 for create project card
		wheel: 80,
		onChange: () => updateScroll(),
		onEscape: () => navigateTo('/app?noanimate', { exitBack: true }),
		onSelect: (i) => {
			if (i === projects.length) {
				navigateTo('/app/projects/new');
			} else {
				const project = projects[i];
				if (project) {
					navigateTo(`/app/projects/${project.projectId}`);
				}
			}
		},
	});

	async function updateScroll() {
		if (isMobile) {
			scrollOffset = 0;
			return;
		}
		await tick();
		if (!listEl) return;
		const cards = listEl.querySelectorAll('.project-card') as NodeListOf<HTMLElement>;
		const card = cards[nav.selectedIndex];
		if (!card) return;

		const containerHeight = listEl.parentElement?.clientHeight ?? 0;
		const cardTop = card.offsetTop;
		const cardHeight = card.offsetHeight;
		const listHeight = listEl.scrollHeight;

		// Center the selected card vertically
		let offset = -(cardTop + cardHeight / 2 - containerHeight / 2);

		// Don't push the list below its natural top position
		offset = Math.min(offset, 0);

		// Don't scroll past the bottom
		if (listHeight > containerHeight) {
			offset = Math.max(offset, -(listHeight - containerHeight));
		}

		scrollOffset = offset;
	}

	const selectedProject = $derived(
		nav.selectedIndex === projects.length
			? null
			: projects[nav.selectedIndex]
	);

	// Helper to preload route chunks
	function preloadRoute(route: string) {
		if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
			requestIdleCallback(() => {
				const link = document.createElement('link');
				link.rel = 'prefetch';
				link.href = route;
				document.head.appendChild(link);
			});
		}
	}

	// Preload routes for selected project
	$effect(() => {
		if (selectedProject?.projectId) {
			preloadRoute(`/app/projects/${selectedProject.projectId}/edit`);
			preloadRoute(`/app/projects/${selectedProject.projectId}/ship/presubmit`);
		}
	});

	// Fetch all project details (force refresh for up-to-date review statuses)
	$effect(() => {
		if (projects.length > 0) {
			projects.forEach((project, index) => {
				setTimeout(() => {
					if (project.projectId) {
						fetchProjectDetail(String(project.projectId), true).catch(() => {});
					}
				}, index * 200);
			});
		}
	});
</script>

<svelte:window bind:innerWidth={windowWidth} onkeydown={nav.handleKeydown} onwheel={nav.handleWheel} />

<div class="relative size-full">
	<!-- Hero image (desktop only) -->
	<div class="hidden sm:block" style="opacity: {navigating || !entered ? 0 : selectedProject ? 1 : 0}; transition: opacity 0.4s ease;">
		<TurbulentImage
			src={selectedProject?.screenshotUrl ?? heroPlaceholder}
			alt={selectedProject?.projectTitle ?? m.projects_list_new_project_alt()}
			inset="0 -40% 0 40%"
			zIndex={0}
		/>
	</div>

	<!-- Mobile-only page header -->
	<h1 class="sm:hidden font-cook text-[28px] font-semibold text-black m-0 px-4 pt-20 leading-none">{m.projects_list_title()}</h1>

	<!-- Scrollable project list -->
	<div class="relative w-full px-4 pt-6 pb-24 sm:absolute sm:left-10.5 sm:top-45 sm:bottom-10 sm:w-215 sm:px-0 sm:pt-0 sm:pb-0 sm:overflow-visible z-2" role="listbox" tabindex="-1">
		<div class="flex flex-col gap-4 sm:gap-7.5" bind:this={listEl} style="transform: translateY({isMobile ? 0 : scrollOffset}px); transition: transform var(--juice-duration) var(--juice-easing);">
			{#if loading}
				<div class="project-card bg-[#f3e8d8] border-4 border-black rounded-[20px] p-5 sm:p-7.5 shadow-[4px_4px_0px_0px_black] flex items-center justify-center w-full sm:w-[649px]">
					<p class="font-cook font-semibold text-black text-[28px] sm:text-[40px] m-0 opacity-50">{m.projects_list_loading()}</p>
				</div>
			{:else if error}
				<div class="project-card bg-[#f3e8d8] border-4 border-black rounded-[20px] p-5 sm:p-7.5 shadow-[4px_4px_0px_0px_black] flex items-center justify-center w-full sm:w-[649px]">
					<p class="font-cook font-semibold text-black text-[28px] sm:text-[40px] m-0 opacity-50">{error}</p>
				</div>
			{:else}
				{#each projects as project, i (project.projectId)}
					{@const selected = i === nav.selectedIndex}
					{@const status = statusMap[String(project.projectId)] ?? null}
					<button
						class="project-card bg-[#f3e8d8] border-4 border-black rounded-[20px] p-5 sm:p-7.5 shadow-[4px_4px_0px_0px_black] flex flex-col items-start overflow-hidden relative cursor-pointer text-left outline-none w-full"
						class:selected
						class:exiting={navigating}
						onpointerdown={() => { clickWasSelected = nav.selectedIndex === i; }}
						onfocus={() => { if (!isMobile) { nav.selectedIndex = i; updateScroll(); } }}
						onclick={() => { if (isMobile || clickWasSelected) { navigateTo(`/app/projects/${project.projectId}`) } }}
						style={isMobile
							? `--card-index: ${i};`
							: `--card-index: ${i}; width: ${selected ? '824px' : '649px'}; background-color: ${selected ? 'var(--selected-color)' : '#f3e8d8'}; gap: ${selected ? '32px' : '0'}; transition: width var(--juice-duration) var(--juice-easing), background-color var(--selected-duration) ease, padding 0.3s ease;`}
					>
						<div class="flex flex-col gap-1 z-1 w-full">
							<p class="font-cook font-semibold text-black m-0 leading-[1.1] transition-[font-size_0.3s_ease] text-[28px] sm:text-[40px]" style={!isMobile && selected ? 'font-size: 64px;' : ''}>{project.projectTitle}</p>
							<p class="font-bricolage font-semibold text-black m-0 transition-[font-size_0.3s_ease] text-[16px] sm:text-[20px]" style={!isMobile && selected ? 'font-size: 32px;' : ''}>{project.description ?? ''}</p>
							<p class="font-bricolage font-semibold text-black m-0 transition-[font-size_0.3s_ease] text-[16px] sm:text-[20px]" style={!isMobile && selected ? 'font-size: 32px;' : ''}>{m.projects_list_hours_tracked({ hours: project.nowHackatimeHours ?? 0 })}</p>
						</div>

						<div
							class="z-1 hidden sm:grid"
							style="grid-template-rows: {selected ? '1fr' : '0fr'}; opacity: {selected ? 1 : 0}; transition: grid-template-rows 0.15s ease, opacity 0.15s ease;"
						>
							<div class="overflow-hidden flex items-center gap-2">
								<InputPrompt type="Enter" />

								<span class="font-bricolage text-2xl font-bold text-black">{m.projects_list_or()}</span>

								<InputPrompt type="click" />

								<span class="font-bricolage text-2xl font-bold text-black">{m.projects_list_to_view()}</span>
							</div>
						</div>

						{#if status}
							<span
								class="absolute top-4 right-4 font-bricolage text-sm font-bold px-3 py-1 rounded-full border-2 border-black z-1"
								style="background-color: {status === 'approved' ? '#ffa936' : status === 'pending' ? '#facc15' : status === 'rejected' ? '#e05632' : status === 'unsubmitted' ? '#d1d5db' : 'transparent'};"
							>
								{status.toUpperCase()}
							</span>
						{/if}

					</button>
				{/each}

				<!-- Create Project Card -->
				{@const createSelected = nav.selectedIndex === projects.length}
				<button
					class="project-card border-dashed bg-[#f3e8d8] border-4 border-black rounded-[20px] p-5 sm:p-7.5 shadow-[4px_4px_0px_0px_black] flex flex-col items-start overflow-hidden relative cursor-pointer text-left outline-none w-full"
					class:selected={createSelected}
					class:exiting={navigating}
					onpointerdown={() => { clickWasSelected = nav.selectedIndex === projects.length; }}
					onfocus={() => { if (!isMobile) { nav.selectedIndex = projects.length; updateScroll(); } }}
					onclick={() => { if (isMobile || clickWasSelected) { navigateTo('/app/projects/new'); } }}
					style={isMobile
						? `--card-index: ${projects.length};`
						: `--card-index: ${projects.length}; width: ${createSelected ? '824px' : '649px'}; background-color: ${createSelected ? 'var(--selected-color)' : '#f3e8d8'}; gap: ${createSelected ? '32px' : '0'}; transition: width var(--juice-duration) var(--juice-easing), background-color var(--selected-duration) ease, padding 0.3s ease;`}
				>
					<div class="flex flex-col gap-1 z-1 w-full">
						<p class="font-cook font-semibold text-black m-0 leading-[1.1] opacity-70 transition-[font-size_0.3s_ease] text-[28px] sm:text-[40px]" style={!isMobile && createSelected ? 'font-size: 64px;' : ''}>{m.projects_list_create_card()}</p>
					</div>

					<div
						class="z-1 hidden sm:grid"
						style="grid-template-rows: {createSelected ? '1fr' : '0fr'}; opacity: {createSelected ? 1 : 0}; transition: grid-template-rows 0.15s ease, opacity 0.15s ease;"
					>
						<div class="overflow-hidden flex items-center gap-2 whitespace-nowrap">
							<InputPrompt type="Enter" />

							<span class="font-bricolage text-2xl font-bold text-black">OR</span>

							<InputPrompt type="click" />

							<span class="font-bricolage text-2xl font-bold text-black">{m.projects_list_to_create()}</span>
						</div>
					</div>
				</button>
			{/if}
		</div>
	</div>

	<!-- Back button (desktop only — on mobile, /app redirects back here) -->
	<div class="hidden sm:block">
		<BackButton
			onclick={() => navigateTo('/app?noanimate', { exitBack: true })}
			exiting={backExiting}
			flyIn={page.url.searchParams.has('back')}
		/>
	</div>

	<div class="fade-wrap" class:entered class:exiting={navigating}>
		<NavigationHint
			segments={[
				{ type: 'text', value: m.projects_list_nav_use() },
				{ type: 'input', value: 'WS' },
				{ type: 'text', value: m.projects_list_nav_or() },
				{ type: 'input', value: 'mouse-scroll' },
				{ type: 'text', value: m.projects_list_nav_to_navigate() }
			]}
			position="bottom-right"
		/>
	</div>
</div>

<style>
	/* Per-card staggered entry */
	@keyframes card-enter {
		from { transform: translateX(-120vw); }
		to   { transform: translateX(0); }
	}
	.project-card {
		animation: card-enter var(--enter-duration) var(--enter-easing) both;
		animation-delay: calc(var(--card-index, 0) * 75ms);
	}

	/* Per-card staggered exit */
	@keyframes card-exit {
		from { transform: translateX(0); }
		to   { transform: translateX(-120vw); }
	}
	.project-card.exiting {
		animation: card-exit var(--exit-duration) var(--exit-easing) both;
		animation-delay: calc(var(--card-index, 0) * 75ms);
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
</style>
