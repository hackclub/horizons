<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import heroPlaceholder from '$lib/assets/projects/hero-placeholder.png';
	import { api, type components } from '$lib/api';
	import TurbulentImage from '$lib/components/TurbulentImage.svelte';
	import NavigationHint from '$lib/components/NavigationHint.svelte';
	import { FormField, FormTextarea, FormSelect, FileUpload, FormCard, FormError, FormSubmitButton, HackatimeSelect } from '$lib/components/form';
	import { editDataStore, fetchEditData, invalidateProjectCaches } from '$lib/store/projectDetailCache';
	import { invalidateCache } from '$lib/store/projectCache';
	import BackButton from '$lib/components/BackButton.svelte';

	type ProjectType = components['schemas']['CreateProjectDto']['projectType'];

	const projectTypes = [
		{ label: 'Windows Playable', value: 'windows_playable' },
		{ label: 'Mac Playable', value: 'mac_playable' },
		{ label: 'Linux Playable', value: 'linux_playable' },
		{ label: 'Web Playable', value: 'web_playable' },
		{ label: 'Cross-Platform Playable', value: 'cross_platform_playable' },
		{ label: 'Hardware', value: 'hardware' },
	];

	const projectId = $derived(page.params.id!);

	type ProjectResponse = components['schemas']['ProjectResponse'];
	let editState = $state<{
		project: ProjectResponse | null;
		allHackatimeProjects: any[];
		linkedHackatimeProjects: string[];
		loading: boolean;
		hackatimeLoading: boolean;
		error: string | null;
	}>({ project: null, allHackatimeProjects: [], linkedHackatimeProjects: [], loading: true, hackatimeLoading: true, error: null });
	let unsubscribe: (() => void) | null = null;

	$effect(() => {
		// Subscribe to store updates
		unsubscribe = editDataStore.subscribe(state => {
			editState = state;
		});

		// Fetch edit data on mount
		fetchEditData(projectId).catch(() => {
			// Error is already in store
		});

		return () => {
			unsubscribe?.();
		};
	});

	let loading = $derived(editState.loading);
	let hackatimeLoading = $derived(editState.hackatimeLoading);
	let errorMsg = $state<string | null>(null);

	let title = $state('');
	let projectType = $state<ProjectType>('web_playable');
	let description = $state('');
	let demoUrl = $state('');
	let codeUrl = $state('');
	let readmeUrl = $state('');
	let submitting = $state(false);
	let mediaUrl = $state<string | null>(null);
	let mediaPreview = $state<string | null>(null);
	let selectedHackatimeNames = $state<Set<string>>(new Set());

	// Populate form from cached data
	$effect(() => {
		if (editState.project) {
			const p = editState.project as any;
			title = p.projectTitle ?? '';
			projectType = p.projectType ?? 'web_playable';
			description = p.description ?? '';
			demoUrl = p.playableUrl ?? '';
			codeUrl = p.repoUrl ?? '';
			readmeUrl = p.readmeUrl ?? '';
			mediaUrl = p.screenshotUrl ?? null;
			mediaPreview = p.screenshotUrl ?? null;
		}
	});

	$effect(() => {
		selectedHackatimeNames = new Set(editState.linkedHackatimeProjects ?? []);
	});

	let allHackatimeProjects = $derived(editState.allHackatimeProjects);

	function toggleHackatimeProject(name: string) {
		const next = new Set(selectedHackatimeNames);
		if (next.has(name)) {
			next.delete(name);
		} else {
			next.add(name);
		}
		selectedHackatimeNames = next;
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			goto(`/app/projects/${projectId}`);
		}
	}

	async function handleSubmit() {
		if (!title.trim() || !description.trim()) {
			errorMsg = 'Title and description are required';
			return;
		}

		submitting = true;
		errorMsg = null;

		const [projectRes] = await Promise.all([
			api.PUT('/api/projects/auth/{id}', {
				params: { path: { id: Number(projectId) } },
				body: {
					projectTitle: title.trim(),
					description: description.trim(),
					playableUrl: demoUrl.trim() || undefined,
					repoUrl: codeUrl.trim() || undefined,
					readmeUrl: readmeUrl.trim() || undefined,
					screenshotUrl: mediaUrl || undefined,
				},
			}),
			api.PUT('/api/projects/auth/{id}/hackatime-projects', {
				params: { path: { id: Number(projectId) } },
				body: { projectNames: Array.from(selectedHackatimeNames) },
			}),
		]);

		if (projectRes.data) {
			// Invalidate all caches so fresh data loads when navigating back
			// Clear project detail cache + edit cache for this project
			invalidateProjectCaches(projectId);
			// Also clear projects list cache since this project's info changed
			invalidateCache();
			goto(`/app/projects/${projectId}`);
		} else {
			const err = projectRes.error as any;
			errorMsg = err?.message ?? err?.error ?? 'Failed to update project. Please try again.';
		}

		submitting = false;
	}

	let focusedButtonIndex = $state(0);
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="relative size-full">
	{#if loading}
		<div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
			<p class="font-cook text-[36px] font-semibold text-black m-0">LOADING...</p>
		</div>
	{:else}
		<div class="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-[calc(50%+73px)] w-214 h-120.5 z-0 pointer-events-none">
			<TurbulentImage src={mediaPreview || heroPlaceholder} alt={title} inset="0 0 0 0" filterId="hero-turbulence" />
		</div>

		<FormCard title="Edit Project" subtitle="Update your project details below.">
			<div class="flex gap-4 w-full">
				<!-- Column 1 -->
				<div class="flex-1 flex flex-col gap-2 min-w-0">
					<FormField label="Title" id="title" placeholder="Horizons" bind:value={title} />
					<FormSelect label="Project Type" id="project-type" options={projectTypes} bind:value={projectType} />
					<FormTextarea label="Description" id="description" placeholder="Describe what your project does..." bind:value={description} />
					<FileUpload bind:mediaUrl bind:mediaPreview onerror={(msg) => errorMsg = msg} />
				</div>

				<!-- Column 2 -->
				<div class="flex-1 flex flex-col gap-2 min-w-0">
					<FormField label="Demo URL" id="demo-url" type="url" placeholder="https://username.itch.io/mygame" bind:value={demoUrl} />
					<FormField label="Code URL" id="code-url" type="url" placeholder="https://username.itch.io/mygame" bind:value={codeUrl} />
					<FormField label="README URL" id="readme-url" type="url" placeholder="https://username.itch.io/mygame" bind:value={readmeUrl} />
					<HackatimeSelect
						projects={allHackatimeProjects}
						selectedNames={selectedHackatimeNames}
						onToggle={toggleHackatimeProject}
						loading={hackatimeLoading}
					/>
				</div>
			</div>

			<FormError message={errorMsg} />
			<FormSubmitButton
				class="submit-btn {focusedButtonIndex === 0 ? 'selected' : ''}"
				label="SAVE CHANGES"
				loadingLabel="SAVING..."
				onclick={handleSubmit}
				loading={submitting}
				onfocus={() => focusedButtonIndex = 0}
			/>
		</FormCard>
	{/if}

	<BackButton onclick={() => goto(`/app/projects/${projectId}`)} />

	<NavigationHint
		segments={[
			{ type: 'input', value: 'click' },
			{ type: 'text', value: 'TO FILL FIELDS' }
		]}
		position="bottom-right"
	/>
</div>

<style>
	:global(.submit-btn) {
		background-color: #f3e8d8;
		transition:
			background-color var(--selected-duration) ease,
			transform var(--juice-duration) var(--juice-easing),
			font-size var(--juice-duration) var(--juice-easing);
	}

	:global(.submit-btn.selected) {
		background-color: #ffa936;
		transform: scale(var(--juice-scale));
		font-size: 1.125rem;
	}

	:global(.submit-btn:hover:not(.selected)) {
		background-color: #f3e8d8;
	}
</style>
