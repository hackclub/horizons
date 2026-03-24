<script lang="ts">
	import { goto } from '$app/navigation';
	import HackatimeLinkButton from '$lib/components/HackatimeLinkButton.svelte';
	import { api, type components } from '$lib/api';
	import { FormField, FormTextarea, FormSelect, FileUpload, FormError, FormSubmitButton } from '$lib/components/form';
	import { invalidateAllProjectCaches } from '$lib/store/projectDetailCache';
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

	let title = $state('');
	let projectType = $state<ProjectType>('web_playable');
	let description = $state('');
	let submitting = $state(false);
	let errorMsg = $state<string | null>(null);
	let mediaUrl = $state<string | null>(null);
	let mediaPreview = $state<string | null>(null);
	let hackatimeLinked = $state(false);

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			goto('/app/projects');
		}
	}

	async function handleSubmit() {
		if (!title.trim() || !description.trim() || !hackatimeLinked) {
			errorMsg = 'Title, description, and Hackatime link are required';
			return;
		}

		submitting = true;
		errorMsg = null;

		const { data } = await api.POST('/api/projects/auth', {
			body: {
				projectTitle: title.trim(),
				projectType,
				projectDescription: description.trim(),
				screenshotUrl: mediaUrl || undefined,
			},
		});

		if (data) {
			// Invalidate all caches since we created a new project
			invalidateAllProjectCaches();
			goto(`/app/projects/${data.projectId}`);
		} else {
			errorMsg = 'Failed to create project. Please try again.';
		}

		submitting = false;
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="relative size-full">
	<!-- Project form card -->
	<div class="absolute left-1/2 top-1/2 -translate-x-[calc(50%+0.5px)] -translate-y-[calc(50%+0.5px)] w-[520px] bg-[#f3e8d8] border-4 border-black rounded-[20px] p-[30px] shadow-[4px_4px_0px_0px_black] flex flex-col justify-between overflow-clip z-[1]">
		<div class="flex flex-col gap-2 w-full">
			<h1 class="font-cook text-4xl font-semibold text-black m-0 leading-normal">Create New Project</h1>

			<FormField label="Title" id="title" placeholder="Horizons" bind:value={title} />
			<FormSelect label="Project Type" id="project-type" options={projectTypes} bind:value={projectType} />
			<FormTextarea label="Description" id="description" placeholder="Describe what your project does..." bind:value={description} />
			<FileUpload label="Screenshot" bind:mediaUrl bind:mediaPreview onerror={(msg) => errorMsg = msg} />

			<FormField label="Hackatime Link" id="hackatime-link">
				<HackatimeLinkButton bind:linked={hackatimeLinked} />
			</FormField>
		</div>

		<div class="flex flex-col gap-2 w-full mt-4">
			<FormError message={errorMsg} />
			<FormSubmitButton label="CREATE PROJECT" loadingLabel="CREATING..." onclick={handleSubmit} loading={submitting} />
		</div>
	</div>

	<BackButton onclick={() => goto('/app/projects')} />
</div>
