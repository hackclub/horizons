<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import heroPlaceholder from '$lib/assets/projects/hero-placeholder.png';
	import { api, type components } from '$lib/api';
	import TurbulentImage from '$lib/components/TurbulentImage.svelte';
	import { FormField, FormTextarea, FormSelect, FileUpload, FormCard, BackButton, FormButtons, FormError, HackatimeSelect } from '$lib/components/form';

	type ProjectType = components['schemas']['CreateProjectDto']['projectType'];

	const projectTypes = [
		{ label: 'Windows Playable', value: 'windows_playable' },
		{ label: 'Mac Playable', value: 'mac_playable' },
		{ label: 'Linux Playable', value: 'linux_playable' },
		{ label: 'Web Playable', value: 'web_playable' },
		{ label: 'Cross-Platform Playable', value: 'cross_platform_playable' },
	];

	const projectId = $derived(page.params.id);

	let loading = $state(true);
	let title = $state('');
	let projectType = $state<ProjectType>('web_playable');
	let description = $state('');
	let demoUrl = $state('');
	let codeUrl = $state('');
	let readmeUrl = $state('');
	let submitting = $state(false);
	let errorMsg = $state<string | null>(null);
	let mediaUrl = $state<string | null>(null);
	let mediaPreview = $state<string | null>(null);

	let allHackatimeProjects = $state<{ name: string; total_seconds?: number }[]>([]);
	let selectedHackatimeNames = $state<Set<string>>(new Set());
	let hackatimeLoading = $state(true);

	let allFilled = $derived(
		!!title.trim() && !!description.trim() && !!demoUrl.trim() && !!codeUrl.trim() && !!readmeUrl.trim() && !!mediaUrl && selectedHackatimeNames.size > 0
	);

	let missingFields = $state<Set<string>>(new Set());

	function isValidUrl(url: string): boolean {
		try {
			new URL(url);
			return true;
		} catch {
			return false;
		}
	}

	function handleFieldBlur(fieldId: string) {
		const next = new Set(missingFields);
		
		if (fieldId === 'title' && title.trim()) {
			next.delete('title');
		}
		if (fieldId === 'description' && description.trim()) {
			next.delete('description');
		}
		if (fieldId === 'demo-url' && demoUrl.trim()) {
			if (isValidUrl(demoUrl.trim())) {
				next.delete('demo-url');
			}
		}
		if (fieldId === 'code-url' && codeUrl.trim()) {
			if (isValidUrl(codeUrl.trim())) {
				next.delete('code-url');
			}
		}
		if (fieldId === 'readme-url' && readmeUrl.trim()) {
			if (isValidUrl(readmeUrl.trim())) {
				next.delete('readme-url');
			}
		}
		if (fieldId === 'media' && mediaUrl) {
			next.delete('media');
		}
		if (fieldId === 'hackatime' && selectedHackatimeNames.size > 0) {
			next.delete('hackatime');
		}
		
		missingFields = next;
	}

	async function fetchProject(id: string) {
		loading = true;
		hackatimeLoading = true;
		errorMsg = null;

		const [projectRes, allHackatimeRes, linkedHackatimeRes] = await Promise.all([
			api.GET('/api/projects/auth/{id}', { params: { path: { id: parseInt(id) } } }),
			api.GET('/api/hackatime/projects/all'),
			api.GET('/api/projects/auth/{id}/hackatime-projects', { params: { path: { id: parseInt(id) } } })
		]);

		if (projectRes.data) {
			const p = projectRes.data as any;
			title = p.projectTitle ?? '';
			projectType = p.projectType ?? 'web_playable';
			description = p.description ?? '';
			demoUrl = p.playableUrl ?? '';
			codeUrl = p.repoUrl ?? '';
			readmeUrl = p.readmeUrl ?? '';
			mediaUrl = p.screenshotUrl ?? null;
			mediaPreview = p.screenshotUrl ?? null;
		} else {
			errorMsg = 'Failed to load project';
		}

		if (allHackatimeRes.data) {
			allHackatimeProjects = allHackatimeRes.data.projects;
		}

		if (linkedHackatimeRes.data) {
			selectedHackatimeNames = new Set(linkedHackatimeRes.data.hackatimeProjects ?? []);
		}

		loading = false;
		hackatimeLoading = false;
	}

	$effect(() => {
		if (projectId) fetchProject(projectId);
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

	async function handleNext() {
		const missing = new Set<string>();
		const missingLabels: string[] = [];
		
		if (!title.trim()) {
			missing.add('title');
			missingLabels.push('Title');
		}
		if (!description.trim()) {
			missing.add('description');
			missingLabels.push('Description');
		}
		if (!demoUrl.trim()) {
			missing.add('demo-url');
			missingLabels.push('Demo URL');
		}
		if (!codeUrl.trim()) {
			missing.add('code-url');
			missingLabels.push('Code URL');
		}
		if (!readmeUrl.trim()) {
			missing.add('readme-url');
			missingLabels.push('README URL');
		}
		if (!mediaUrl) {
			missing.add('media');
			missingLabels.push('Screenshot/Video');
		}
		if (selectedHackatimeNames.size === 0) {
			missing.add('hackatime');
			missingLabels.push('Hackatime Project');
		}

		if (missing.size > 0) {
			missingFields = missing;
			errorMsg = `Required: ${missingLabels.join(', ')}`;
			return;
		}
		
		missingFields.clear();

		submitting = true;
		errorMsg = null;

		const [projectRes, hackatimeRes] = await Promise.all([
			api.PUT('/api/projects/auth/{id}', {
				params: { path: { id: Number(projectId) } },
				body: {
					projectTitle: title.trim(),
					description: description.trim(),
					playableUrl: demoUrl.trim(),
					repoUrl: codeUrl.trim(),
					readmeUrl: readmeUrl.trim(),
					screenshotUrl: mediaUrl!,
				},
			}),
			api.PUT('/api/projects/auth/{id}/hackatime-projects', {
				params: { path: { id: Number(projectId) } },
				body: { projectNames: Array.from(selectedHackatimeNames) },
			}),
		]);

		if (projectRes.data) {
			goto(`/app/projects/${projectId}/ship/finish`);
		} else {
			errorMsg = 'Failed to save project. Please try again.';
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
			<TurbulentImage src={mediaPreview || heroPlaceholder} alt={title} inset="0 0 0 0" filterId="hero-turbulence" />
		</div>

		<FormCard title="READY TO SUBMIT?" subtitle="Fill out this information and make sure it looks correct">
			<div class="flex gap-4 w-full">
				<div class="flex-1 flex flex-col gap-2 min-w-0">
					<div class={missingFields.has('title') ? 'error-wrapper' : ''}>
						<FormField 
							label="Title" 
							id="title" 
							placeholder="Horizons" 
							bind:value={title}
							onblur={() => handleFieldBlur('title')}
						/>
						{#if missingFields.has('title')}
							<span class="text-red-600 text-sm font-semibold absolute right-0 top-0">Fill me out!</span>
						{/if}
					</div>
					<FormSelect label="Project Type" id="project-type" options={projectTypes} bind:value={projectType} />
					<div class={missingFields.has('description') ? 'error-wrapper' : ''}>
						<FormTextarea 
							label="Description" 
							id="description" 
							placeholder="Describe what your project does..." 
							bind:value={description}
							onblur={() => handleFieldBlur('description')}
						/>
						{#if missingFields.has('description')}
							<span class="text-red-600 text-sm font-semibold absolute right-0 top-0">Fill me out!</span>
						{/if}
					</div>
					<div class={missingFields.has('media') ? 'error-wrapper' : ''}>
						<FileUpload 
							bind:mediaUrl 
							bind:mediaPreview 
							onerror={(msg) => errorMsg = msg}
							onupload={() => handleFieldBlur('media')}
						/>
						{#if missingFields.has('media')}
							<span class="text-red-600 text-sm font-semibold absolute right-0 top-0">Fill me out!</span>
						{/if}
					</div>
				</div>
				<div class="flex-1 flex flex-col gap-2 min-w-0">
					<div class={missingFields.has('demo-url') ? 'error-wrapper' : ''}>
						<FormField 
							label="Demo URL" 
							id="demo-url" 
							type="url" 
							placeholder="https://username.itch.io/mygame" 
							bind:value={demoUrl}
							onblur={() => handleFieldBlur('demo-url')}
						/>
						{#if missingFields.has('demo-url')}
							<span class="text-red-600 text-sm font-semibold absolute right-0 top-0">Fill me out!</span>
						{/if}
					</div>
					<div class={missingFields.has('code-url') ? 'error-wrapper' : ''}>
						<FormField 
							label="Code URL" 
							id="code-url" 
							type="url" 
							placeholder="https://username.itch.io/mygame" 
							bind:value={codeUrl}
							onblur={() => handleFieldBlur('code-url')}
						/>
						{#if missingFields.has('code-url')}
							<span class="text-red-600 text-sm font-semibold absolute right-0 top-0">Fill me out!</span>
						{/if}
					</div>
					<div class={missingFields.has('readme-url') ? 'error-wrapper' : ''}>
						<FormField 
							label="README URL" 
							id="readme-url" 
							type="url" 
							placeholder="https://username.itch.io/mygame" 
							bind:value={readmeUrl}
							onblur={() => handleFieldBlur('readme-url')}
						/>
						{#if missingFields.has('readme-url')}
							<span class="text-red-600 text-sm font-semibold absolute right-0 top-0">Fill me out!</span>
						{/if}
					</div>
					<div class={missingFields.has('hackatime') ? 'error-wrapper' : ''}>
						<HackatimeSelect
							projects={allHackatimeProjects}
							selectedNames={selectedHackatimeNames}
							onToggle={(name) => {
								toggleHackatimeProject(name);
								handleFieldBlur('hackatime');
							}}
							loading={hackatimeLoading}
						/>
						{#if missingFields.has('hackatime')}
							<span class="text-red-600 text-sm font-semibold absolute right-0 top-0">Fill me out!</span>
						{/if}
					</div>
				</div>
			</div>

			<FormError message={errorMsg} />
			<FormButtons
				onback={() => goto(`/app/projects/${projectId}/ship/presubmit`)}
				onnext={handleNext}
				loading={submitting}
				blink={allFilled}
			/>
		</FormCard>
	{/if}

	<BackButton onclick={() => goto(`/app/projects/${projectId}`)} />
</div>

<style>
	:global(.error-wrapper) {
		position: relative;
	}

	:global(.error-wrapper input),
	:global(.error-wrapper textarea),
	:global(.error-wrapper .form-select-trigger),
	:global(.error-wrapper .hackatime-trigger),
	:global(.error-wrapper .hover-juice-bg) {
		border-color: rgb(220, 38, 38) !important;
		border-width: 2px !important;
		box-shadow: 2px 2px 0px 0px rgb(220, 38, 38) !important;
	}

	:global(.error-wrapper) span {
		color: rgb(107, 114, 128) !important;
	}
</style>
