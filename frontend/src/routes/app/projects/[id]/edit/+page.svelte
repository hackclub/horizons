<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { untrack } from 'svelte';
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
	let journalUrl = $state('');
	let submitting = $state(false);
	let mediaUrl = $state<string | null>(null);
	let mediaPreview = $state<string | null>(null);
	let selectedHackatimeNames = $state<Set<string>>(new Set());

	let isHardware = $derived(projectType === 'hardware');

	// Populate form from cached data (only once)
	let formPopulated = false;
	$effect(() => {
		if (editState.project && !formPopulated) {
			formPopulated = true;
			const p = editState.project as any;
			title = p.projectTitle ?? '';
			projectType = p.projectType ?? 'web_playable';
			description = p.description ?? '';
			demoUrl = p.playableUrl ?? '';
			codeUrl = p.repoUrl ?? '';
			readmeUrl = p.readmeUrl ?? '';
			mediaUrl = p.screenshotUrl ?? null;
			mediaPreview = p.screenshotUrl ?? null;
			// untrack to avoid making URL fields reactive dependencies of this effect
			// (otherwise typing in a URL field re-triggers this effect and resets all fields)
			untrack(() => {
				if (demoUrl) checkDemoUrl(demoUrl);
				if (codeUrl) checkCodeUrl(codeUrl);
				if (readmeUrl) checkReadmeUrl(readmeUrl);
			});
			journalUrl = p.journalUrl ?? '';
			if (demoUrl) checkDemoUrl(demoUrl);
			if (codeUrl) checkCodeUrl(codeUrl);
			if (readmeUrl) checkReadmeUrl(readmeUrl);
		}
	});

	$effect(() => {
		selectedHackatimeNames = new Set(editState.linkedHackatimeProjects ?? []);
	});

	let allHackatimeProjects = $derived(editState.allHackatimeProjects);

	// --- URL validation ---
	function isValidUrl(url: string): boolean {
		try {
			new URL(url);
			return true;
		} catch {
			return false;
		}
	}

	// Demo URL validation
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

	// Code URL validation
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
				if (codeUrlType === 'github' && !readmeUrl.trim()) {
					const repoBase = trimmed.replace(/\/$/, '');
					readmeUrl = `${repoBase}/blob/main/README.md`;
					checkReadmeUrl(readmeUrl);
				}
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

	// README URL validation
	let readmeUrlStatus = $state<'idle' | 'checking' | 'ok' | 'error'>('idle');
	let readmeUrlError = $state<string | null>(null);
	let readmeCheckTimeout: ReturnType<typeof setTimeout> | undefined;

	async function checkReadmeUrl(url: string) {
		const trimmed = url.trim();
		if (!trimmed || !isValidUrl(trimmed)) {
			readmeUrlStatus = 'idle';
			readmeUrlError = null;
			return;
		}

		readmeUrlStatus = 'checking';
		readmeUrlError = null;

		try {
			const { data } = await api.GET('/api/utils/check-url', {
				params: { query: { url: trimmed } },
			});

			if (data?.ok) {
				readmeUrlStatus = 'ok';
				readmeUrlError = null;
			} else {
				readmeUrlStatus = 'error';
				readmeUrlError = data?.error || `HTTP ${data?.status}`;
			}
		} catch {
			readmeUrlStatus = 'error';
			readmeUrlError = "Hmm, something's not right. We couldn't reach your README — please make sure the URL is correct and reachable.";
		}
	}

	function handleReadmeUrlBlur() {
		clearTimeout(readmeCheckTimeout);
		const url = readmeUrl.trim();
		if (url && !isValidUrl(url)) {
			readmeUrlStatus = 'error';
			readmeUrlError = 'Invalid URL format';
		} else {
			checkReadmeUrl(readmeUrl);
		}
	}

	function handleReadmeUrlInput() {
		clearTimeout(readmeCheckTimeout);
		readmeCheckTimeout = setTimeout(() => {
			const url = readmeUrl.trim();
			if (url && !isValidUrl(url)) {
				readmeUrlStatus = 'error';
				readmeUrlError = 'Invalid URL format';
			} else {
				checkReadmeUrl(readmeUrl);
			}
		}, 600);
	}

	let hasUrlErrors = $derived(
		demoUrlStatus === 'error' || codeUrlStatus === 'error' || readmeUrlStatus === 'error'
	);

	let urlsChecking = $derived(
		demoUrlStatus === 'checking' || codeUrlStatus === 'checking' || readmeUrlStatus === 'checking'
	);

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

		if (hasUrlErrors) {
			errorMsg = 'Please fix the URL errors before saving.';
			return;
		}

		if (urlsChecking) {
			errorMsg = 'Please wait for URL checks to finish.';
			return;
		}

		submitting = true;
		errorMsg = null;

		const [projectRes, hackatimeRes] = await Promise.all([
			api.PUT('/api/projects/auth/{id}', {
				params: { path: { id: Number(projectId) } },
				body: {
					projectTitle: title.trim(),
					projectType,
					description: description.trim(),
					playableUrl: demoUrl.trim() || undefined,
					repoUrl: codeUrl.trim() || undefined,
					readmeUrl: readmeUrl.trim() || undefined,
					screenshotUrl: mediaUrl || undefined,
					...(isHardware && journalUrl.trim() ? { journalUrl: journalUrl.trim() } : {}),
				},
			}),
			api.PUT('/api/projects/auth/{id}/hackatime-projects', {
				params: { path: { id: Number(projectId) } },
				body: { projectNames: Array.from(selectedHackatimeNames) },
			}),
		]);

		if (projectRes.data && hackatimeRes.data) {
			// Invalidate all caches so fresh data loads when navigating back
			// Clear project detail cache + edit cache for this project
			invalidateProjectCaches(projectId);
			// Also clear projects list cache since this project's info changed
			invalidateCache();
			goto(`/app/projects/${projectId}`);
		} else if (!projectRes.data) {
			const err = projectRes.error as any;
			errorMsg = err?.message ?? err?.error ?? 'Failed to update project. Please try again.';
		} else {
			const err = hackatimeRes.error as any;
			errorMsg = err?.message ?? err?.error ?? 'Failed to update Hackatime projects. Please try again.';
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
			<div class="flex flex-col sm:flex-row gap-4 w-full">
				<!-- Column 1 -->
				<div class="flex-1 flex flex-col gap-2 min-w-0">
					<FormField label="Title" id="title" placeholder="Horizons" bind:value={title} />
					<FormSelect label="Project Type" id="project-type" options={projectTypes} bind:value={projectType} />
					<FormTextarea label="Description" id="description" placeholder="Describe what your project does..." bind:value={description} />
					<FileUpload bind:mediaUrl bind:mediaPreview onerror={(msg) => errorMsg = msg} />
				</div>

				<!-- Column 2 -->
				<div class="flex-1 flex flex-col gap-2 min-w-0">
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
										<svg class="w-5 h-5 text-black" viewBox="0 0 24 24" fill="currentColor">
											<path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
										</svg>
									{:else if codeUrlStatus === 'ok' && codeUrlType === 'other'}
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
					<FormField
						label="README URL"
						id="readme-url"
						type="url"
						placeholder="https://github.com/username/myproject/blob/main/README.md"
						bind:value={readmeUrl}
						onblur={handleReadmeUrlBlur}
						oninput={handleReadmeUrlInput}
					>
						{#snippet children()}
							<div class="relative w-full">
								<input
									id="readme-url"
									class="border-2 border-black rounded-lg pl-4 pr-10 py-2 shadow-[2px_2px_0px_0px_black] font-bricolage text-base font-semibold w-full outline-none appearance-none text-black bg-[#f3e8d8] placeholder:text-black/50"
									type="url"
									placeholder="https://github.com/username/myproject/blob/main/README.md"
									bind:value={readmeUrl}
									onblur={handleReadmeUrlBlur}
									oninput={handleReadmeUrlInput}
								/>
								<div class="absolute right-3 top-1/2 -translate-y-1/2 flex items-center">
									{#if readmeUrlStatus === 'checking'}
										<div class="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin"></div>
									{:else if readmeUrlStatus === 'ok'}
										<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5 text-green-600">
											<path fill-rule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clip-rule="evenodd" />
										</svg>
									{:else if readmeUrlStatus === 'error'}
										<span title={readmeUrlError || 'URL unreachable'}>
											<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5 text-amber-500">
												<path fill-rule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clip-rule="evenodd" />
											</svg>
										</span>
									{/if}
								</div>
							</div>
							{#if readmeUrlStatus === 'error' && readmeUrlError}
								<p class="text-amber-600 text-xs font-semibold mt-1 m-0">{readmeUrlError}</p>
							{/if}
						{/snippet}
					</FormField>
					{#if isHardware}
						<FormField
							label="JOURNAL.md URL"
							id="journal-url"
							type="url"
							placeholder="https://github.com/username/repo/blob/main/JOURNAL.md"
							bind:value={journalUrl}
						/>
					{/if}
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
				disabled={hasUrlErrors || urlsChecking}
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
