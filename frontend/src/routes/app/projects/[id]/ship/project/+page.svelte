<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import heroPlaceholder from '$lib/assets/projects/hero-placeholder.png';
	import { api, type components } from '$lib/api';
	import TurbulentImage from '$lib/components/TurbulentImage.svelte';
	import { FormField, FormTextarea, FormSelect, FileUpload, FormCard, FormButtons, FormError, HackatimeSelect } from '$lib/components/form';
	import BackButton from '$lib/components/BackButton.svelte';

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

	let demoUrlStatus = $state<'idle' | 'checking' | 'ok' | 'error'>('idle');
	let demoUrlError = $state<string | null>(null);
	let demoUrlFavicon = $state<string | null>(null);

	let demoCheckTimeout: ReturnType<typeof setTimeout> | undefined;

	async function checkDemoUrl(url: string) {
		if (!url.trim() || !isValidUrl(url.trim())) {
			demoUrlStatus = 'idle';
			demoUrlError = null;
			demoUrlFavicon = null;
			return;
		}

		demoUrlStatus = 'checking';
		demoUrlError = null;
		demoUrlFavicon = null;

		try {
			const { data } = await api.GET('/api/utils/check-url', {
				params: { query: { url: url.trim() } },
			});

			if (data?.ok) {
				demoUrlStatus = 'ok';
				demoUrlError = null;
				demoUrlFavicon = data?.favicon ?? null;
			} else {
				demoUrlStatus = 'error';
				demoUrlError = data?.error || `HTTP ${data?.status}`;
				demoUrlFavicon = null;
			}
		} catch {
			demoUrlStatus = 'error';
			demoUrlError = "Hmm, something's not right. We couldn't reach your site — please make sure the URL is correct and reachable.";
			demoUrlFavicon = null;
		}
	}

	function handleDemoUrlBlur() {
		handleFieldBlur('demo-url');
		clearTimeout(demoCheckTimeout);
		const url = demoUrl.trim();
		if (url && !isValidUrl(url)) {
			demoUrlStatus = 'error';
			demoUrlError = 'Invalid URL format';
			demoUrlFavicon = null;
		} else {
			checkDemoUrl(demoUrl);
		}
	}

	function handleDemoUrlInput() {
		clearTimeout(demoCheckTimeout);
		demoCheckTimeout = setTimeout(() => {
			const url = demoUrl.trim();
			if (url && !isValidUrl(url)) {
				demoUrlStatus = 'error';
				demoUrlError = 'Invalid URL format';
				demoUrlFavicon = null;
			} else {
				checkDemoUrl(demoUrl);
			}
		}, 600);
	}

	let codeUrlStatus = $state<'idle' | 'checking' | 'ok' | 'error'>('idle');
	let codeUrlError = $state<string | null>(null);
	let codeUrlType = $state<'github' | 'other' | null>(null);

	let codeCheckTimeout: ReturnType<typeof setTimeout> | undefined;

	const githubRepoRegex = /^https?:\/\/(www\.)?github\.com\/[^/]+\/[^/]+\/?$/;

	function isGitHubUrl(url: string): boolean {
		try {
			const { hostname } = new URL(url);
			return hostname === 'github.com' || hostname === 'www.github.com';
		} catch {
			return false;
		}
	}

	function validateCodeUrlFormat(url: string): string | null {
		if (!isValidUrl(url)) return 'Invalid URL format';
		if (isGitHubUrl(url) && !githubRepoRegex.test(url.trim())) return 'GitHub URL should point to the repository root (e.g. https://github.com/user/repo), not a specific file or page.';
		return null;
	}

	async function checkCodeUrl(url: string) {
		const trimmed = url.trim();
		if (!trimmed || !isValidUrl(trimmed)) {
			codeUrlStatus = 'idle';
			codeUrlError = null;
			codeUrlType = null;
			return;
		}

		const formatError = validateCodeUrlFormat(trimmed);
		if (formatError) {
			codeUrlStatus = 'error';
			codeUrlError = formatError;
			codeUrlType = null;
			return;
		}

		codeUrlStatus = 'checking';
		codeUrlError = null;
		codeUrlType = isGitHubUrl(trimmed) ? 'github' : 'other';

		try {
			const { data } = await api.GET('/api/utils/check-url', {
				params: { query: { url: trimmed, type: 'repo' } },
			});

			if (data?.ok) {
				codeUrlStatus = 'ok';
				codeUrlError = null;
			} else {
				codeUrlStatus = 'error';
				codeUrlError = data?.error || `HTTP ${data?.status}`;
				codeUrlType = null;
			}
		} catch {
			codeUrlStatus = 'error';
			codeUrlError = "Hmm, something's not right. We couldn't reach your repository — please make sure it's public and the URL is correct.";
			codeUrlType = null;
		}
	}

	function handleCodeUrlBlur() {
		handleFieldBlur('code-url');
		clearTimeout(codeCheckTimeout);
		const url = codeUrl.trim();
		if (url && !isValidUrl(url)) {
			codeUrlStatus = 'error';
			codeUrlError = 'Invalid URL format';
			codeUrlType = null;
		} else {
			checkCodeUrl(codeUrl);
		}
	}

	function handleCodeUrlInput() {
		clearTimeout(codeCheckTimeout);
		codeCheckTimeout = setTimeout(() => {
			const url = codeUrl.trim();
			if (url && !isValidUrl(url)) {
				codeUrlStatus = 'error';
				codeUrlError = 'Invalid URL format';
				codeUrlType = null;
			} else {
				checkCodeUrl(codeUrl);
			}
		}, 600);
	}

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
			if (demoUrl) checkDemoUrl(demoUrl);
			if (codeUrl) checkCodeUrl(codeUrl);
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

		const [projectRes, _hackatimeRes] = await Promise.all([
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
			goto(`/app/projects/${projectId}/ship/personal`);
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
							onblur={handleDemoUrlBlur}
							oninput={handleDemoUrlInput}
						>
							{#snippet children()}
								<div class="relative w-full">
									<input
										id="demo-url"
										class="border-2 border-black rounded-lg pl-4 pr-10 py-2 shadow-[2px_2px_0px_0px_black] font-bricolage text-base font-semibold w-full outline-none appearance-none text-black bg-[#f3e8d8] placeholder:text-black/50"
										type="url"
										placeholder="https://username.itch.io/mygame"
										bind:value={demoUrl}
										onblur={handleDemoUrlBlur}
										oninput={handleDemoUrlInput}
									/>
									<div class="absolute right-3 top-1/2 -translate-y-1/2 flex items-center">
										{#if demoUrlStatus === 'checking'}
											<div class="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin"></div>
										{:else if demoUrlStatus === 'ok' && demoUrlFavicon}
											<img src={demoUrlFavicon} alt="Site favicon" class="w-5 h-5" />
										{:else if demoUrlStatus === 'error'}
											<span class="demo-url-warning" title={demoUrlError || 'URL unreachable'}>
												<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5 text-amber-500">
													<path fill-rule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clip-rule="evenodd" />
												</svg>
											</span>
										{/if}
									</div>
								</div>
								{#if demoUrlStatus === 'error' && demoUrlError}
									<p class="text-amber-600 text-xs font-semibold mt-1 m-0">{demoUrlError}</p>
								{/if}
							{/snippet}
						</FormField>
						{#if missingFields.has('demo-url')}
							<span class="text-red-600 text-sm font-semibold absolute right-0 top-0">Fill me out!</span>
						{/if}
					</div>
					<div class={missingFields.has('code-url') ? 'error-wrapper' : ''}>
						<FormField
							label="Code URL"
							id="code-url"
							type="url"
							placeholder="https://github.com/username/myproject"
							bind:value={codeUrl}
							onblur={handleCodeUrlBlur}
							oninput={handleCodeUrlInput}
						>
							{#snippet children()}
								<div class="relative w-full">
									<input
										id="code-url"
										class="border-2 border-black rounded-lg pl-4 pr-10 py-2 shadow-[2px_2px_0px_0px_black] font-bricolage text-base font-semibold w-full outline-none appearance-none text-black bg-[#f3e8d8] placeholder:text-black/50"
										type="url"
										placeholder="https://github.com/username/myproject"
										bind:value={codeUrl}
										onblur={handleCodeUrlBlur}
										oninput={handleCodeUrlInput}
									/>
									<div class="absolute right-3 top-1/2 -translate-y-1/2 flex items-center">
										{#if codeUrlStatus === 'checking'}
											<div class="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin"></div>
										{:else if codeUrlStatus === 'ok' && codeUrlType === 'github'}
											<!-- GitHub icon -->
											<svg class="w-5 h-5 text-black" viewBox="0 0 24 24" fill="currentColor">
												<path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
											</svg>
										{:else if codeUrlStatus === 'ok' && codeUrlType === 'other'}
											<!-- Git icon -->
											<svg class="w-5 h-5 text-[#F05032]" viewBox="0 0 24 24" fill="currentColor">
												<path d="M23.546 10.93L13.067.452c-.604-.603-1.582-.603-2.188 0L8.708 2.627l2.76 2.76c.645-.215 1.379-.07 1.889.441.516.515.658 1.258.438 1.9l2.66 2.66c.645-.222 1.387-.078 1.9.435.721.72.721 1.884 0 2.604-.72.719-1.885.719-2.604 0-.54-.541-.674-1.337-.404-1.996L12.86 8.955v6.525c.176.086.342.203.488.348.713.721.713 1.883 0 2.6-.713.721-1.88.721-2.593 0-.713-.717-.713-1.879 0-2.6.182-.18.387-.316.605-.406V8.835c-.217-.091-.424-.222-.6-.401-.545-.545-.676-1.342-.396-2.009L7.636 3.7.45 10.881c-.6.605-.6 1.584 0 2.189l10.48 10.477c.604.604 1.582.604 2.186 0l10.43-10.43c.605-.603.605-1.582 0-2.187"/>
											</svg>
										{:else if codeUrlStatus === 'error'}
											<span title={codeUrlError || 'URL unreachable'}>
												<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5 text-amber-500">
													<path fill-rule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clip-rule="evenodd" />
												</svg>
											</span>
										{/if}
									</div>
								</div>
								{#if codeUrlStatus === 'error' && codeUrlError}
									<p class="text-amber-600 text-xs font-semibold mt-1 m-0">{codeUrlError}</p>
								{/if}
							{/snippet}
						</FormField>
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
