<script lang="ts">
	import { goto } from '$app/navigation';
	import HackatimeLinkButton from '$lib/components/HackatimeLinkButton.svelte';
	import { api, type components } from '$lib/api';
	import { FormField, FormTextarea, FormSelect, FileUpload, FormError, FormSubmitButton } from '$lib/components/form';
	import { invalidateAllProjectCaches } from '$lib/store/projectDetailCache';
	import BackButton from '$lib/components/BackButton.svelte';
	import { m } from '$lib/paraglide/messages.js';

	type ProjectType = components['schemas']['CreateProjectDto']['projectType'];

	const projectTypes = [
		{ label: m.projects_new_type_windows_playable(), value: 'windows_playable' },
		{ label: m.projects_new_type_mac_playable(), value: 'mac_playable' },
		{ label: m.projects_new_type_linux_playable(), value: 'linux_playable' },
		{ label: m.projects_new_type_web_playable(), value: 'web_playable' },
		{ label: m.projects_new_type_cross_platform_playable(), value: 'cross_platform_playable' },
		{ label: m.projects_new_type_hardware(), value: 'hardware' },
		{ label: m.projects_new_type_mobile_app(), value: 'mobile_app' },
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
			errorMsg = m.projects_new_required_fields();
			return;
		}

		submitting = true;
		errorMsg = null;

		const { data, response } = await api.POST('/api/projects/auth', {
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
			let message = response.statusText || m.projects_new_unknown_error();
			try {
				const body = await response.json();
				if (body?.message) message = Array.isArray(body.message) ? body.message.join(', ') : body.message;
			} catch {}
			errorMsg = m.projects_new_create_failed({ message });
		}

		submitting = false;
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="relative size-full">
	<!-- Project form card -->
	<div class="relative w-[calc(100%-2rem)] max-w-130 mx-auto mt-20 mb-8 sm:absolute sm:left-1/2 sm:top-1/2 sm:-translate-x-[calc(50%+0.5px)] sm:-translate-y-[calc(50%+0.5px)] sm:w-130 sm:mt-0 sm:mb-0 bg-[#f3e8d8] border-4 border-black rounded-[20px] p-5 sm:p-7.5 shadow-[4px_4px_0px_0px_black] flex flex-col justify-between overflow-clip z-1">
		<div class="flex flex-col gap-2 w-full">
			<h1 class="font-cook text-2xl sm:text-4xl font-semibold text-black m-0 leading-normal">{m.projects_new_title()}</h1>

			<FormField label={m.projects_new_field_title()} id="title" placeholder="Horizons" maxlength={30} bind:value={title} />
			<FormSelect label={m.projects_new_field_project_type()} id="project-type" options={projectTypes} bind:value={projectType} />
			<FormTextarea label={m.projects_new_field_description()} id="description" placeholder={m.projects_new_description_placeholder()} maxlength={500} bind:value={description} />
			<FileUpload label={m.projects_new_field_screenshot()} bind:mediaUrl bind:mediaPreview onerror={(msg) => errorMsg = msg} />

			<FormField label={m.projects_new_field_hackatime_link()} id="hackatime-link">
				<HackatimeLinkButton bind:linked={hackatimeLinked} />
			</FormField>
		</div>

		<div class="flex flex-col gap-2 w-full mt-4">
			<FormError message={errorMsg} />
			<FormSubmitButton label={m.projects_new_submit()} loadingLabel={m.projects_new_submitting()} onclick={handleSubmit} loading={submitting} />
		</div>
	</div>

	<BackButton onclick={() => goto('/app/projects')} />
</div>
