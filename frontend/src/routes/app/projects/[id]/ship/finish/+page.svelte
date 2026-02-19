<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import heroPlaceholder from '$lib/assets/projects/hero-placeholder.png';
	import { api } from '$lib/api';
	import TurbulentImage from '$lib/components/TurbulentImage.svelte';
	import { FormCard, BackButton, FormButtons, FormError } from '$lib/components/form';

	const projectId = $derived($page.params.id);

	let loading = $state(true);
	let submitting = $state(false);
	let errorMsg = $state<string | null>(null);
	let heroUrl = $state<string | null>(null);
	let projectTitle = $state('');

	async function fetchProject(id: string) {
		loading = true;
		const { data } = await api.GET('/api/projects/auth/{id}', {
			params: { path: { id: parseInt(id) } }
		});
		if (data) {
			const p = data as any;
			heroUrl = p.screenshotUrl ?? null;
			projectTitle = p.projectTitle ?? '';
		}
		loading = false;
	}

	$effect(() => {
		if (projectId) fetchProject(projectId);
	});

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			goto(`/app/projects/${projectId}`);
		}
	}

	async function handleSubmit() {
		submitting = true;
		errorMsg = null;

		const { error } = await api.POST('/api/projects/auth/submissions', {
			body: {
				projectId: Number(projectId),
			},
		});

		if (!error) {
			goto(`/app/projects/${projectId}`);
		} else {
			const e = error as any;
			errorMsg = e?.error ?? e?.message ?? 'Failed to submit project. Please try again.';
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
		<div class="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-[calc(50%+73px)] w-214 h-120.5 z-0 pointer-events-none">
			<TurbulentImage src={heroUrl || heroPlaceholder} alt={projectTitle} inset="0 0 0 0" filterId="hero-turbulence" />
		</div>

		<FormCard title="READY TO SUBMIT?" subtitle="Hit submit to submit your project. You won't be able to make any changes until your project is reviewed. You can resubmit your project once reviewed.">
			<FormError message={errorMsg} />
			<FormButtons
				onback={() => goto(`/app/projects/${projectId}/ship/project`)}
				onnext={handleSubmit}
				nextLabel="SUBMIT →"
				loadingLabel="SUBMITTING..."
				loading={submitting}
				blink
			/>
		</FormCard>
	{/if}

	<BackButton onclick={() => goto(`/app/projects/${projectId}`)} />
</div>
