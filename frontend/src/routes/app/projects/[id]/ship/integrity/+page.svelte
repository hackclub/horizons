<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import heroPlaceholder from '$lib/assets/projects/hero-placeholder.png';
	import { api } from '$lib/api';
	import TurbulentImage from '$lib/components/TurbulentImage.svelte';
	import { FormCard, FormButtons } from '$lib/components/form';
	import BackButton from '$lib/components/BackButton.svelte';
	import { m } from '$lib/paraglide/messages.js';

	const projectId = $derived(page.params.id);

	let loading = $state(true);
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
			goto(`/app/projects/${projectId}/ship/project`);
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="relative size-full">
	{#if loading}
		<div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
			<p class="font-cook text-[36px] font-semibold text-black m-0">{m.projects_ship_integrity_loading()}</p>
		</div>
	{:else}
		<div class="hidden sm:block absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-[calc(50%+73px)] w-214 h-120.5 z-0 pointer-events-none">
			<TurbulentImage src={heroUrl || heroPlaceholder} alt={projectTitle} inset="0 0 0 0" filterId="hero-turbulence" />
		</div>

		<FormCard title={m.projects_ship_integrity_title()}>
			<div class="bg-white/50 rounded-lg p-2 w-full">
				<p class="font-bricolage text-[20px] leading-normal tracking-[-0.22px] text-black m-0">
					{m.projects_ship_integrity_warning()}
				</p>
			</div>
			<p class="font-bricolage text-[20px] leading-normal tracking-[-0.22px] text-black m-0">
				{m.projects_ship_integrity_agree_blurb()}
			</p>
			<FormButtons
				onback={() => goto(`/app/projects/${projectId}/ship/project`)}
				onnext={() => goto(`/app/projects/${projectId}/ship/finish`)}
				nextLabel={m.projects_ship_integrity_agree_button()}
				blink
			/>
		</FormCard>
	{/if}

	<BackButton onclick={() => goto(`/app/projects/${projectId}/ship/project`)} />
</div>
