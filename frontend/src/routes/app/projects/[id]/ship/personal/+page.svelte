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
	let reauthing = $state(false);
	let heroUrl = $state<string | null>(null);
	let projectTitle = $state('');

	async function init(id: string) {
		loading = true;

		const [projectRes, userRes] = await Promise.all([
			api.GET('/api/projects/auth/{id}', { params: { path: { id: parseInt(id) } } }),
			api.GET('/api/user/auth/me'),
		]);

		if (projectRes.data) {
			const p = projectRes.data as any;
			heroUrl = p.screenshotUrl ?? null;
			projectTitle = p.projectTitle ?? '';
		}

		if (userRes.data) {
			const user = userRes.data as any;
			if (user.hasAddress) {
				goto(`/app/projects/${id}/ship/integrity`);
				return;
			}
		}

		loading = false;
	}

	$effect(() => {
		if (projectId) init(projectId);
	});

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			goto(`/app/projects/${projectId}/ship/project`);
		}
	}

	async function handleReauth() {
		reauthing = true;
		const { data } = await api.POST('/api/user/auth/sync', {
			body: { redirectPath: window.location.pathname },
		});
		if (data) {
			window.location.href = (data as any).url;
		}
		reauthing = false;
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="relative size-full">
	{#if loading}
		<div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
			<p class="font-cook text-[36px] font-semibold text-black m-0">{m.projects_ship_personal_loading()}</p>
		</div>
	{:else}
		<div class="hidden sm:block absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-[calc(50%+73px)] w-214 h-120.5 z-0 pointer-events-none">
			<TurbulentImage src={heroUrl || heroPlaceholder} alt={projectTitle} inset="0 0 0 0" filterId="hero-turbulence" />
		</div>

		<FormCard title={m.projects_ship_personal_title()}>
			<p class="font-bricolage text-[20px] leading-normal tracking-[-0.22px] text-black m-0">
				{m.projects_ship_personal_intro()}<br />
				{m.projects_ship_personal_address_item()}<br />
                {m.projects_ship_personal_and_or()} <br />
				{@html m.projects_ship_personal_id_item_html()}
				<br /><br />
				<a href="https://auth.hackclub.com/" target="_blank" rel="noopener noreferrer" class="underline">{m.projects_ship_personal_setup_link()}</a> {m.projects_ship_personal_after_setup()}
			</p>
			<FormButtons
				onback={() => goto(`/app/projects/${projectId}/ship/project`)}
				onnext={handleReauth}
				nextLabel={m.projects_ship_personal_reauth()}
				loadingLabel={m.projects_ship_personal_redirecting()}
				loading={reauthing}
			/>
		</FormCard>
	{/if}

	<BackButton onclick={() => goto(`/app/projects/${projectId}/ship/project`)} />
</div>
