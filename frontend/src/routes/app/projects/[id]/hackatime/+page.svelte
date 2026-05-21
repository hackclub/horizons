<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { api } from '$lib/api';
	import { FormCard, FormError, FormSubmitButton, HackatimeSelect } from '$lib/components/form';
	import { editDataStore, fetchEditData, invalidateProjectCaches } from '$lib/store/projectDetailCache';
	import { invalidateCache } from '$lib/store/projectCache';
	import BackButton from '$lib/components/BackButton.svelte';

	const projectId = $derived(page.params.id!);

	let editState = $state<{
		project: any;
		allHackatimeProjects: any[];
		linkedHackatimeProjects: string[];
		loading: boolean;
		hackatimeLoading: boolean;
		error: string | null;
	}>({ project: null, allHackatimeProjects: [], linkedHackatimeProjects: [], loading: true, hackatimeLoading: true, error: null });
	let unsubscribe: (() => void) | null = null;

	$effect(() => {
		unsubscribe = editDataStore.subscribe(state => {
			editState = state;
		});

		fetchEditData(projectId).catch(() => {
			// Error is already in store
		});

		return () => {
			unsubscribe?.();
		};
	});

	let loading = $derived(editState.loading);
	let hackatimeLoading = $derived(editState.hackatimeLoading);
	let allHackatimeProjects = $derived(editState.allHackatimeProjects);
	let errorMsg = $state<string | null>(null);
	let submitting = $state(false);
	let refreshing = $state(false);
	let selectedHackatimeNames = $state<Set<string>>(new Set());

	async function refreshHackatimeProjects() {
		if (refreshing || hackatimeLoading) return;
		refreshing = true;
		try {
			await fetchEditData(projectId, true);
		} catch {
			// Error is already surfaced in the store; keep the existing list visible.
		} finally {
			refreshing = false;
		}
	}

	$effect(() => {
		selectedHackatimeNames = new Set(editState.linkedHackatimeProjects ?? []);
	});

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
		if (selectedHackatimeNames.size === 0) {
			errorMsg = 'Pick at least one Hackatime project to link.';
			return;
		}

		submitting = true;
		errorMsg = null;

		const { data, error } = await api.PUT('/api/projects/auth/{id}/hackatime-projects', {
			params: { path: { id: Number(projectId) } },
			body: { projectNames: Array.from(selectedHackatimeNames) },
		});

		if (data) {
			invalidateProjectCaches(projectId);
			invalidateCache();
			goto(`/app/projects/${projectId}`);
		} else {
			const err = error as any;
			errorMsg = err?.message ?? err?.error ?? 'Failed to link Hackatime projects. Please try again.';
		}

		submitting = false;
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="relative size-full">
	{#if loading}
		<div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
			<p class="font-cook text-[36px] font-semibold text-black m-0">LOADING...</p>
		</div>
	{:else}
		<FormCard title="Link Hackatime" subtitle="Pick the Hackatime projects that track time for this project.">
			<HackatimeSelect
				projects={allHackatimeProjects}
				selectedNames={selectedHackatimeNames}
				onToggle={toggleHackatimeProject}
				loading={hackatimeLoading}
				variant="inline"
				onRefresh={refreshHackatimeProjects}
				{refreshing}
			/>

			{@const linkDisabled = hackatimeLoading || selectedHackatimeNames.size === 0}
			<FormError message={errorMsg} />
			<FormSubmitButton
				label="LINK HACKATIME"
				loadingLabel="LINKING..."
				onclick={handleSubmit}
				loading={submitting}
				disabled={linkDisabled}
				blink={!linkDisabled && !submitting}
			/>
		</FormCard>
	{/if}

	<BackButton onclick={() => goto(`/app/projects/${projectId}`)} />
</div>
