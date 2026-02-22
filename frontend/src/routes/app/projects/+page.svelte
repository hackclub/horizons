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
	import { preloadProjectDetail } from '$lib/store/projectDetailCache';
	import type { components } from '$lib/api';
	import { EXIT_DURATION } from '$lib';
	import BackButton from '$lib/components/BackButton.svelte';

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

	let scrollOffset = $state(0);
	let listEl: HTMLDivElement;
	let clickWasSelected = false;

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

	// Preload selected project details and routes
	$effect(() => {
		if (selectedProject?.projectId) {
			preloadProjectDetail(String(selectedProject.projectId));
			// Preload routes for selected project
			preloadRoute(`/app/projects/${selectedProject.projectId}/edit`);
			preloadRoute(`/app/projects/${selectedProject.projectId}/ship/presubmit`);
		}
	});

	// Preload all projects in background
	$effect(() => {
		if (projects.length > 0) {
			// Stagger preloading to avoid network congestion
			projects.forEach((project, index) => {
				setTimeout(() => {
					if (project.projectId) {
						preloadProjectDetail(String(project.projectId));
					}
				}, index * 200); // 200ms between preloads
			});
		}
	});
</script>

<svelte:window onkeydown={nav.handleKeydown} onwheel={nav.handleWheel} />

<div class="relative size-full">
	<!-- Hero image -->
	<div style="opacity: {navigating || !entered ? 0 : selectedProject ? 1 : 0}; transition: opacity 0.4s ease;">
		<TurbulentImage
			src={selectedProject?.screenshotUrl ?? heroPlaceholder}
			alt={selectedProject?.projectTitle ?? 'New Project'}
			inset="0 -40% 0 40%"
			zIndex={0}
		/>
	</div>

	<!-- Scrollable project list -->
	<div class="absolute left-10.5 top-45 bottom-10 w-215 overflow-visible z-2" role="listbox" tabindex="-1">
		<div class="flex flex-col gap-7.5" bind:this={listEl} style="transform: translateY({scrollOffset}px); transition: transform var(--juice-duration) var(--juice-easing);">
			{#if loading}
				<div class="project-card bg-[#f3e8d8] border-4 border-black rounded-[20px] p-7.5 shadow-[4px_4px_0px_0px_black] flex items-center justify-center" style="width: 649px;">
					<p class="font-cook font-semibold text-black text-[40px] m-0 opacity-50">LOADING...</p>
				</div>
			{:else if error}
				<div class="project-card bg-[#f3e8d8] border-4 border-black rounded-[20px] p-7.5 shadow-[4px_4px_0px_0px_black] flex items-center justify-center" style="width: 649px;">
					<p class="font-cook font-semibold text-black text-[40px] m-0 opacity-50">{error}</p>
				</div>
			{:else}
				{#each projects as project, i (project.projectId)}
					{@const selected = i === nav.selectedIndex}
					<button
						class="project-card bg-[#f3e8d8] border-4 border-black rounded-[20px] p-7.5 shadow-[4px_4px_0px_0px_black] flex flex-col items-start overflow-hidden relative cursor-pointer text-left outline-none"
						class:selected
						class:exiting={navigating}
						onpointerdown={() => { clickWasSelected = nav.selectedIndex === i; }}
						onfocus={() => { nav.selectedIndex = i; updateScroll(); }}
						onclick={() => { if (clickWasSelected) { navigateTo(`/app/projects/${project.projectId}`) } }}
						style="--card-index: {i}; width: {selected ? '824px' : '649px'}; background-color: {selected ? 'var(--selected-color)' : '#f3e8d8'}; gap: {selected ? '32px' : '0'}; transition: width var(--juice-duration) var(--juice-easing), background-color var(--selected-duration) ease, padding 0.3s ease;"
					>
						<div class="flex flex-col gap-1 z-1 w-full">
							<p class="font-cook font-semibold text-black m-0 leading-[1.1] transition-[font-size_0.3s_ease]" style="font-size: {selected ? '64px' : '40px'};">{project.projectTitle}</p>
							<p class="font-bricolage font-semibold text-black m-0 transition-[font-size_0.3s_ease]" style="font-size: {selected ? '32px' : '20px'};">{project.description ?? ''}</p>
							<p class="font-bricolage font-semibold text-black m-0 transition-[font-size_0.3s_ease]" style="font-size: {selected ? '32px' : '20px'};">{project.approvedHours ?? 0} hours approved</p>
						</div>

						{#if selected}
							<div class="flex items-center gap-2 z-1">
								<InputPrompt type="Enter" />

								<span class="font-bricolage text-2xl font-bold text-black">OR</span>

								<InputPrompt type="click" />

								<span class="font-bricolage text-2xl font-bold text-black">TO VIEW</span>
							</div>
						{/if}

					</button>
				{/each}

				<!-- Create Project Card -->
				<button
					class="project-card border-dashed bg-[#f3e8d8] border-4 border-black rounded-[20px] p-7.5 shadow-[4px_4px_0px_0px_black] flex flex-col items-start overflow-hidden relative cursor-pointer text-left outline-none"
					class:selected={nav.selectedIndex === projects.length}
					class:exiting={navigating}
					onpointerdown={() => { clickWasSelected = nav.selectedIndex === projects.length; }}
					onfocus={() => { nav.selectedIndex = projects.length; updateScroll(); }}
					onclick={() => { if (clickWasSelected) { navigateTo('/app/projects/new'); } }}
					style="--card-index: {projects.length}; width: {nav.selectedIndex === projects.length ? '824px' : '649px'}; background-color: {nav.selectedIndex === projects.length ? 'var(--selected-color)' : '#f3e8d8'}; gap: {nav.selectedIndex === projects.length ? '32px' : '0'}; transition: width var(--juice-duration) var(--juice-easing), background-color var(--selected-duration) ease, padding 0.3s ease;"
				>
					<div class="flex flex-col gap-1 z-1 w-full">
						<p class="font-cook font-semibold text-black m-0 leading-[1.1] opacity-70 transition-[font-size_0.3s_ease]" style="font-size: {nav.selectedIndex === projects.length ? '64px' : '40px'};">+ CREATE PROJECT</p>
					</div>

					{#if nav.selectedIndex === projects.length}
						<div class="flex items-center gap-2 z-1">
							<InputPrompt type="Enter" />

							<span class="font-bricolage text-2xl font-bold text-black">OR</span>

							<InputPrompt type="click" />

							<span class="font-bricolage text-2xl font-bold text-black">TO CREATE</span>
						</div>
					{/if}
				</button>
			{/if}
		</div>
	</div>

	<!-- Back button -->
	<BackButton
		onclick={() => navigateTo('/app?noanimate', { exitBack: true })}
		exiting={backExiting}
		flyIn={page.url.searchParams.has('back')}
	/>

	<div class="fade-wrap" class:entered class:exiting={navigating}>
		<NavigationHint
			segments={[
				{ type: 'text', value: 'USE' },
				{ type: 'input', value: 'WS' },
				{ type: 'text', value: 'OR' },
				{ type: 'input', value: 'mouse-scroll' },
				{ type: 'text', value: 'TO NAVIGATE' }
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
