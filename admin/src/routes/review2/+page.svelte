<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { marked } from 'marked';
	import DOMPurify from 'dompurify';
	import { api, type components } from '$lib/api';
	import { timeAgo, formatDate, parseGitHubUrl } from '../review/utils';
	import { ExternalLink, RefreshCcw, ChevronUp, Monitor, Star, GitFork, CircleAlert, GitPullRequest, Moon, Sun } from 'lucide-svelte';
	import { Button, Tab, FilterTag, Accordion } from '$lib/components';
	import { theme, toggleTheme } from '$lib/themeStore';

	type QueueItem = components['schemas']['QueueItemResponse'];
	type SubmissionDetail = components['schemas']['SubmissionDetailResponse'];
	type GitHubRepo = components['schemas']['GitHubRepoResponse'];
	type TimelineEntry = components['schemas']['TimelineEntryResponse'];

	// ── Queue state ──
	let queue = $state<QueueItem[]>([]);
	let queueLoading = $state(true);
	let queueError = $state<string | null>(null);

	// ── Navigation ──
	let galleryMode = $state(true);
	let currentIndex = $state(0);
	let queueLength = $derived(queue.length);

	// ── Current submission ──
	let currentSubmission = $state<SubmissionDetail | null>(null);
	let submissionLoading = $state(false);

	// ── GitHub data ──
	let githubRepo = $state<GitHubRepo | null>(null);
	let githubLoading = $state(false);
	let githubError = $state<string | null>(null);

	// ── Sidebar / review data ──
	let readmeMarkdown = $state('');
	let projectNote = $state('');
	let userNote = $state('');
	let checkedItems = $state<number[]>([]);
	let editedHours = $state<number | null>(null);

	// ── UI toggles ──
	let reviewPanelOpen = $state(true);
	let userNotesOpen = $state(false);
	let checklistOpen = $state(false);
	let darkMode = $derived($theme === 'dark');

	// ── Panel resize ──
	let splitPercent = $state(50);
	let resizing = $state(false);
	let splitContainer: HTMLDivElement | undefined = $state();

	function startResize(e: MouseEvent) {
		resizing = true;
		e.preventDefault();
	}

	// ── Demo iframe ──
	let iframeLoaded = $state(false);
	let iframeElement: HTMLIFrameElement | undefined = $state();

	// ── Draggable popout windows ──
	let notesPosX = $state(24);
	let notesPosY = $state(Infinity);
	let checklistPosX = $state(Infinity);
	let checklistPosY = $state(Infinity);

	let dragging: 'notes' | 'checklist' | null = $state(null);
	let dragOffsetX = 0;
	let dragOffsetY = 0;

	function startDrag(target: 'notes' | 'checklist') {
		return (e: MouseEvent) => {
			dragging = target;
			const posX = target === 'notes' ? notesPosX : checklistPosX;
			const posY = target === 'notes' ? notesPosY : checklistPosY;
			dragOffsetX = e.clientX - posX;
			dragOffsetY = e.clientY - posY;
			e.preventDefault();
		};
	}

	function onMouseMove(e: MouseEvent) {
		if (resizing && splitContainer) {
			const rect = splitContainer.getBoundingClientRect();
			const pct = ((e.clientX - rect.left) / rect.width) * 100;
			splitPercent = Math.max(20, Math.min(80, pct));
			return;
		}
		if (!dragging) return;
		if (dragging === 'notes') {
			notesPosX = e.clientX - dragOffsetX;
			notesPosY = e.clientY - dragOffsetY;
		} else {
			checklistPosX = e.clientX - dragOffsetX;
			checklistPosY = e.clientY - dragOffsetY;
		}
	}

	function onMouseUp() {
		dragging = null;
		resizing = false;
	}

	$effect(() => {
		if (typeof window === 'undefined') return;
		if (notesPosY === Infinity) notesPosY = window.innerHeight - 260;
		if (checklistPosX === Infinity) checklistPosX = window.innerWidth / 2 - 180;
		if (checklistPosY === Infinity) checklistPosY = window.innerHeight - 400;
	});

	// ── Review form ──
	let activeForm: 'approve' | 'changes' = $state('approve');
	let submitting = $state(false);
	let approvedHours = $state(0);
	let hoursJustification = $state('');
	let approveComment = $state('');
	let sendEmail = $state(false);
	let changesComment = $state('');
	let rejectSendEmail = $state(false);

	// ── Gallery filter ──
	let searchQuery = $state('');

	const PROJECT_TYPES = [
		'windows_playable', 'mac_playable', 'linux_playable',
		'web_playable', 'cross_platform_playable', 'hardware',
	];
	let selectedTypes = $state<Set<string>>(new Set());

	let filteredItems = $derived(
		queue
			.map((item, index) => ({ item, index }))
			.filter(({ item }) => {
				const matchesType = selectedTypes.size === 0 || selectedTypes.has(item.project.projectType);
				const matchesSearch = searchQuery === '' ||
					item.project.projectTitle.toLowerCase().includes(searchQuery.toLowerCase()) ||
					`${item.project.user.firstName} ${item.project.user.lastName}`.toLowerCase().includes(searchQuery.toLowerCase());
				return matchesType && matchesSearch;
			}),
	);

	// ── Derived ──
	let demoUrl = $derived(currentSubmission?.playableUrl ?? currentSubmission?.project.playableUrl ?? null);
	let repoUrl = $derived(currentSubmission?.project.repoUrl ?? currentSubmission?.repoUrl ?? null);
	let sanitizedReadme = $derived(readmeMarkdown ? DOMPurify.sanitize(marked.parse(readmeMarkdown) as string) : '');
	let userNoteCount = $derived(userNote.trim().length > 0 ? 1 : 0);
	let hackatimeProjects = $derived(currentSubmission?.project.nowHackatimeProjects ?? []);

	const CHECKLIST_ITEMS = [
		'README exists and has setup instructions',
		'Demo link works and is accessible',
		'Code is original (not a tutorial clone)',
		'Hours claimed match Hackatime logs',
		'Commits show meaningful progress over time',
		'Project is publicly shipped / deployed',
		'No red flags in code or dependencies',
	];

	// ── Lifecycle ──
	onMount(async () => {
		const { data, error } = await api.GET('/api/user/auth/me');
		if (error || !data) { goto('/login'); return; }
		if (data.role !== 'admin' && data.role !== 'reviewer') { goto('/app/projects'); return; }
		loadQueue();
	});

	// Reset iframe on submission change
	$effect(() => {
		if (currentSubmission) {
			iframeLoaded = false;
			activeForm = 'approve';
			approvedHours = currentSubmission.hackatimeHours ?? 0;
			hoursJustification = '';
			approveComment = '';
			sendEmail = false;
			changesComment = '';
			rejectSendEmail = false;
		}
	});

	// ── Data loading ──
	async function loadQueue() {
		queueLoading = true;
		queueError = null;
		galleryMode = true;
		try {
			const { data, error } = await api.GET('/api/reviewer/queue');
			if (error) throw new Error('Failed to fetch review queue');
			queue = data ?? [];
			currentIndex = 0;
		} catch (error) {
			queueError = error instanceof Error ? error.message : 'Failed to load review queue';
		} finally {
			queueLoading = false;
		}
	}

	async function loadSubmissionDetail(submissionId: number) {
		submissionLoading = true;
		currentSubmission = null;
		githubRepo = null;
		readmeMarkdown = '';
		try {
			const { data, error } = await api.GET('/api/reviewer/submissions/{id}', {
				params: { path: { id: submissionId } },
			});
			if (error || !data) throw new Error(`Failed to fetch submission ${submissionId}`);
			currentSubmission = data;

			const repo = data.project.repoUrl || data.repoUrl;
			const promises: Promise<void>[] = [];
			if (repo) {
				promises.push(loadGitHubData(repo));
				promises.push(loadReadme(repo));
			}
			promises.push(loadNotes(data.project.projectId, data.project.user.userId));
			promises.push(loadChecklist(submissionId));
			await Promise.all(promises);
		} catch (error) {
			console.error('Failed to load submission detail:', error);
		} finally {
			submissionLoading = false;
		}
	}

	async function loadGitHubData(url: string) {
		githubLoading = true;
		githubError = null;
		try {
			const { data, error } = await api.GET('/api/github/repo', { params: { query: { url } } });
			if (error || !data) { githubError = 'Failed to load GitHub data'; return; }
			githubRepo = data.data ?? null;
			if (data.error) githubError = data.error;
		} catch { githubError = 'Failed to load GitHub data'; }
		finally { githubLoading = false; }
	}

	async function loadReadme(url: string) {
		try {
			const { data } = await api.GET('/api/github/readme', { params: { query: { url } } });
			readmeMarkdown = data?.content ?? '';
		} catch { readmeMarkdown = ''; }
	}

	async function loadNotes(projectId: number, userId: number) {
		try {
			const [projRes, userRes] = await Promise.all([
				api.GET('/api/reviewer/projects/{id}/notes', { params: { path: { id: projectId } } }),
				api.GET('/api/reviewer/users/{id}/notes', { params: { path: { id: userId } } }),
			]);
			projectNote = projRes.data?.content ?? '';
			userNote = userRes.data?.content ?? '';
		} catch { projectNote = ''; userNote = ''; }
	}

	async function loadChecklist(submissionId: number) {
		try {
			const { data } = await api.GET('/api/reviewer/submissions/{id}/checklist', {
				params: { path: { id: submissionId } },
			});
			checkedItems = data?.checkedItems ?? [];
		} catch { checkedItems = []; }
	}

	// ── Navigation ──
	async function selectFromGallery(index: number) {
		if (index < 0 || index >= queue.length) return;
		currentIndex = index;
		galleryMode = false;
		await loadSubmissionDetail(queue[index].submissionId);
	}

	function returnToGallery() {
		galleryMode = true;
		currentSubmission = null;
	}

	async function navigateNext() {
		if (currentIndex < queueLength - 1) {
			currentIndex++;
			await loadSubmissionDetail(queue[currentIndex].submissionId);
		}
	}

	// ── Iframe controls ──
	function loadDemo() { if (demoUrl) iframeLoaded = true; }

	function reloadDemo() {
		if (iframeElement) iframeElement.src = iframeElement.src;
	}

	function openExternal() {
		if (demoUrl) window.open(demoUrl, '_blank');
	}

	// ── Airlock ──
	let airlockUrl = $derived(repoUrl ? `https://airlock.hackclub.com/?r=${encodeURIComponent(repoUrl)}` : null);

	// ── Checklist ──
	function toggleChecklist(index: number) {
		if (checkedItems.includes(index)) {
			checkedItems = checkedItems.filter((i) => i !== index);
		} else {
			checkedItems = [...checkedItems, index];
		}
		if (currentSubmission) {
			api.PUT('/api/reviewer/submissions/{id}/checklist', {
				params: { path: { id: currentSubmission.submissionId } },
				body: { checkedItems },
			});
		}
	}

	// ── Notes save ──
	let projectNoteSaving = $state(false);
	let userNoteSaving = $state(false);

	async function saveProjectNote() {
		if (!currentSubmission) return;
		projectNoteSaving = true;
		try {
			await api.PUT('/api/reviewer/projects/{id}/notes', {
				params: { path: { id: currentSubmission.project.projectId } },
				body: { content: projectNote },
			});
		} catch (e) { console.error('Failed to save project note:', e); }
		finally { projectNoteSaving = false; }
	}

	async function saveUserNote() {
		if (!currentSubmission) return;
		userNoteSaving = true;
		try {
			await api.PUT('/api/reviewer/users/{id}/notes', {
				params: { path: { id: currentSubmission.project.user.userId } },
				body: { content: userNote },
			});
		} catch (e) { console.error('Failed to save user note:', e); }
		finally { userNoteSaving = false; }
	}

	// ── Review actions ──
	async function submitApproval() {
		if (!currentSubmission) return;
		submitting = true;
		try {
			const { error } = await api.PUT('/api/reviewer/submissions/{id}/review', {
				params: { path: { id: currentSubmission.submissionId } },
				body: {
					approvalStatus: 'approved',
					approvedHours,
					hoursJustification: hoursJustification || undefined,
					userFeedback: approveComment || undefined,
					sendEmail,
				},
			});
			if (error) throw new Error('Failed to approve');
			loadQueue();
		} catch (e) {
			alert(`Approval failed: ${e instanceof Error ? e.message : 'Unknown error'}`);
		} finally { submitting = false; }
	}

	async function submitChangesNeeded() {
		if (!currentSubmission || !changesComment.trim()) {
			alert('Please describe what needs to change.');
			return;
		}
		submitting = true;
		try {
			const { error } = await api.PUT('/api/reviewer/submissions/{id}/review', {
				params: { path: { id: currentSubmission.submissionId } },
				body: {
					approvalStatus: 'rejected',
					userFeedback: changesComment,
					sendEmail: rejectSendEmail,
				},
			});
			if (error) throw new Error('Failed to reject');
			loadQueue();
		} catch (e) {
			alert(`Review failed: ${e instanceof Error ? e.message : 'Unknown error'}`);
		} finally { submitting = false; }
	}

	function formatTypeName(type: string): string {
		return type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
	}
</script>

<svelte:head>
	<title>Horizons — Project Review</title>
</svelte:head>

{#if queueLoading}
	<div class="rv2-theme flex items-center justify-center h-screen bg-white font-dm text-ds-text-placeholder" class:rv2-dark={darkMode}>
		<p>Loading review queue...</p>
	</div>
{:else if queueError}
	<div class="rv2-theme flex flex-col items-center justify-center h-screen gap-2 bg-white font-dm text-[#e90000]" class:rv2-dark={darkMode}>
		<p>Failed to load review queue</p>
		<p class="text-xs text-ds-text-placeholder max-w-[400px] text-center">{queueError}</p>
		<Button class="mt-3 px-5 py-2 text-sm" onclick={() => loadQueue()}>Retry</Button>
	</div>
{:else if queueLength === 0}
	<div class="rv2-theme flex items-center justify-center h-screen bg-white font-dm text-ds-text-placeholder" class:rv2-dark={darkMode}>
		<p>No pending submissions to review.</p>
	</div>
{:else if galleryMode}
	<!-- ═══ GALLERY MODE ═══ -->
	<div class="rv2-theme flex flex-col h-screen bg-white font-dm" class:rv2-dark={darkMode}>
		<div class="flex items-center justify-between px-6 py-3 bg-ds-bg border-b border-ds-border-divider shrink-0">
			<img src="/admin/logos/horizons.svg" alt="Horizons" class="h-5" />
			<div class="flex items-center gap-3">
				<p class="text-xs text-ds-text-tertiary m-0">{filteredItems.length} of {queue.length} projects</p>
				<Button class="p-1.5" onclick={() => toggleTheme()} title="Toggle dark mode">
					{#if darkMode}<Sun size={14} />{:else}<Moon size={14} />{/if}
				</Button>
			</div>
		</div>

		<div class="flex flex-col gap-3 px-6 py-4 bg-ds-bg-secondary border-b border-ds-border-divider shrink-0">
			<input
				type="text"
				class="w-full py-2 px-3 bg-white border border-ds-border rounded-lg text-black text-sm font-dm outline-none placeholder:text-ds-text-placeholder focus:border-ds-border-strong"
				placeholder="Search by project or author name..."
				bind:value={searchQuery}
			/>
			<div class="flex flex-wrap gap-2 items-center">
				{#each PROJECT_TYPES as type}
					<FilterTag
						active={selectedTypes.has(type)}
						onclick={() => {
							const next = new Set(selectedTypes);
							if (next.has(type)) next.delete(type); else next.add(type);
							selectedTypes = next;
						}}
					>
						{formatTypeName(type)}
					</FilterTag>
				{/each}
				{#if selectedTypes.size > 0}
					<FilterTag class="underline hover:text-black" onclick={() => (selectedTypes = new Set())}>Clear</FilterTag>
				{/if}
			</div>
		</div>

		<div class="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] content-start gap-4 p-6 overflow-y-auto flex-1">
			{#each filteredItems as { item, index } (item.submissionId)}
				<button class="flex flex-col gap-1.5 p-5 bg-white border border-ds-border rounded-lg cursor-pointer transition-all duration-150 text-left font-dm shadow-sm hover:border-ds-border-strong hover:shadow-md" onclick={() => selectFromGallery(index)}>
					<p class="text-[15px] font-medium text-black m-0">{item.project.projectTitle}</p>
					<p class="text-[13px] text-ds-text-placeholder m-0">{item.project.user.firstName} {item.project.user.lastName}</p>
					<span class="inline-block mt-1 py-0.5 px-2.5 bg-ds-tag-active text-black rounded-full text-xs font-medium self-start">{formatTypeName(item.project.projectType)}</span>
				</button>
			{:else}
				<p class="col-span-full text-center text-ds-text-placeholder py-10 text-sm">No projects match your filters.</p>
			{/each}
		</div>
	</div>
{:else}
	<!-- ═══ REVIEW DETAIL MODE ═══ -->
	<div class="rv2-theme flex flex-col h-screen bg-white font-dm text-black overflow-hidden" class:rv2-dark={darkMode}>

		<!-- ── TOP BAR ── -->
		<div class="flex items-center justify-between p-2 h-12 bg-ds-bg border-b border-ds-border-divider shrink-0 relative">
			<Button onclick={returnToGallery}>← Gallery</Button>

			<img src="/admin/logos/horizons.svg" alt="Horizons" class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-5" />

			<div class="flex items-center gap-2">
				<span class="text-xs text-ds-text-tertiary">
					Reviewing <strong class="text-black">{currentIndex + 1}</strong> of <strong class="text-black">{queueLength}</strong> pending
				</span>
				<Button onclick={navigateNext} disabled={currentIndex >= queueLength - 1}>Skip</Button>
				<Button class="p-1.5" onclick={() => toggleTheme()} title="Toggle dark mode">
					{#if darkMode}<Sun size={14} />{:else}<Moon size={14} />{/if}
				</Button>
			</div>
		</div>

		<!-- ── MAIN 2-COLUMN LAYOUT ── -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="flex flex-1 overflow-hidden split-container" class:cursor-col-resize={resizing} class:select-none={resizing} bind:this={splitContainer}>

			<!-- ═══ LEFT: DEMO IFRAME ═══ -->
			<div class="flex flex-col" style="width: {splitPercent}%">
				<!-- URL toolbar -->
				<div class="flex gap-2 items-center p-2 bg-ds-zone-warm border-b border-ds-border-divider shrink-0">
					<div class="flex-1 bg-ds-surface-inactive border border-ds-border rounded-lg p-2 text-xs text-ds-text-placeholder font-medium overflow-hidden text-ellipsis whitespace-nowrap shadow-[var(--color-ds-shadow)]">
						{demoUrl ?? 'No demo URL'}
					</div>
					{#if airlockUrl}
						<a href={airlockUrl} target="_blank" rel="noopener noreferrer">
							<Button class="bg-ds-tag-active hover:bg-[#f5d4a8] no-underline shrink-0">Airlock</Button>
						</a>
					{/if}
					<div class="flex self-stretch shrink-0 shadow-[var(--color-ds-shadow)] rounded-lg">
						<button
							class="bg-white border border-ds-border rounded-l-lg px-2 flex items-center justify-center -mr-px cursor-pointer hover:bg-ds-bg-secondary"
							onclick={openExternal}
							disabled={!demoUrl}
							title="Open in new tab"
						><ExternalLink size={12} /></button>
						<button
							class="bg-white border border-ds-border rounded-r-lg px-2 flex items-center justify-center cursor-pointer hover:bg-ds-bg-secondary"
							onclick={reloadDemo}
							disabled={!iframeLoaded}
							title="Reload"
						><RefreshCcw size={12} /></button>
					</div>
				</div>

				<!-- IFrame area -->
				<div class="flex-1 bg-ds-zone-warm-body flex items-center justify-center overflow-hidden">
					{#if iframeLoaded && demoUrl}
						<iframe
							class="w-full h-full border-none"
							bind:this={iframeElement}
							src={demoUrl}
							title="Demo preview"
							sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
						></iframe>
					{:else}
						<button
							class="flex flex-col items-center gap-3 text-[#8a7560] cursor-pointer bg-transparent border-none hover:text-[#5c4e3e]"
							onclick={loadDemo}
							disabled={!demoUrl}
						>
							<Monitor size={64} class="opacity-40" />
							<span class="text-base font-medium">Click to load demo</span>
							{#if demoUrl}
								<span class="text-xs opacity-60">{demoUrl}</span>
							{/if}
						</button>
					{/if}
				</div>
			</div>

			<!-- ═══ RESIZE HANDLE ═══ -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				class="w-1 shrink-0 bg-[#b3b3b3] cursor-col-resize hover:bg-[#808080] active:bg-[#666] transition-colors relative group"
				onmousedown={startResize}
			>
				<div class="absolute inset-y-0 -left-1 -right-1"></div>
			</div>

			<!-- ═══ RIGHT: INFO + REVIEW ═══ -->
			<div class="flex flex-col overflow-hidden" style="width: {100 - splitPercent}%">

				<!-- Right top toolbar -->
				<div class="flex items-center justify-end gap-2 px-2 h-[51px] box-border bg-ds-zone-cool border-b border-ds-border-divider shrink-0">
					<!-- "Flagged as Sus" indicator would show here if the user is flagged -->
					<button
						class="bg-ds-zone-cool-btn border border-[#a7a7c8] rounded-lg p-2 text-xs font-medium cursor-pointer shadow-[var(--color-ds-shadow)] flex items-center gap-1 hover:bg-[#aaafda]"
						onclick={() => (userNotesOpen = !userNotesOpen)}
					>
						User Notes
						{#if userNoteCount > 0}
							<span class="bg-[#e90000] text-white text-[10px] font-medium rounded-full p-0.5 size-3 flex items-center justify-center">{userNoteCount}</span>
						{/if}
					</button>
				</div>

				<!-- Content area -->
				<div class="flex-1 bg-ds-zone-cool-body overflow-y-auto">
					{#if submissionLoading}
						<div class="flex items-center justify-center h-full text-[#6b71a0] text-xs">Loading submission...</div>
					{:else if currentSubmission}
						<div class="p-4">
							<!-- User + Project Info -->
							<div class="mb-3">
								<h2 class="text-2xl font-medium m-0 mb-0.5">
									{currentSubmission.project.projectTitle ?? 'Untitled'}
								</h2>
								<p class="text-xs text-ds-link m-0">
									by {currentSubmission.project.user.firstName} {currentSubmission.project.user.lastName}
									{#if currentSubmission.project.user.age != null}
										<span class="opacity-80">({currentSubmission.project.user.age}yo)</span>
									{/if}
									{#if currentSubmission.project.user.slackUserId}
										&middot; <a href="https://hackclub.slack.com/team/{currentSubmission.project.user.slackUserId}" target="_blank" rel="noopener noreferrer" class="text-ds-link underline hover:text-black">Slack DM</a>
									{/if}
								</p>
								{#if currentSubmission.hackatimeHours != null}
									<p class="text-xs text-ds-link m-0 mt-0.5">
										<strong>{currentSubmission.hackatimeHours.toFixed(1)}h</strong> Hackatime hours
									</p>
								{/if}
								{#if currentSubmission.project.description}
									<p class="text-xs text-ds-link m-0 mt-1">{currentSubmission.project.description}</p>
								{/if}
							</div>

							<!-- Accordion: Readme -->
							<Accordion title="Readme" class="mb-2" contentClass="readme-content leading-relaxed max-h-[400px] overflow-y-auto">
								{#if sanitizedReadme}
									{@html sanitizedReadme}
								{:else}
									<p class="text-ds-text-placeholder italic">No README content available.</p>
								{/if}
							</Accordion>

							<!-- Accordion: Github -->
							<Accordion title="Github" class="mb-2">
									{#if githubLoading}
										<p class="text-ds-text-placeholder">Loading GitHub data...</p>
									{:else if githubError}
										<p class="text-[#e90000]">{githubError}</p>
									{:else if githubRepo}
										<div class="flex items-center gap-3 mb-3">
											<a class="font-bold text-ds-link no-underline hover:underline" href={repoUrl} target="_blank" rel="noopener noreferrer">
												{githubRepo.fullName} ↗
											</a>
											{#if githubRepo.language}
												<span class="bg-ds-zone-warm-body text-xs font-medium px-2 py-0.5 rounded">{githubRepo.language}</span>
											{/if}
										</div>
										<div class="flex gap-4 text-xs text-ds-text-placeholder mb-3">
											<span class="flex items-center gap-1"><Star size={12} /> {githubRepo.stars}</span>
											<span class="flex items-center gap-1"><GitFork size={12} /> {githubRepo.forks}</span>
											<span class="flex items-center gap-1"><CircleAlert size={12} /> {githubRepo.openIssues} issues</span>
											<span class="flex items-center gap-1"><GitPullRequest size={12} /> {githubRepo.pullRequests} PRs</span>
										</div>
										<div class="flex gap-4 text-xs text-ds-text-placeholder mb-3">
											<span>Created {timeAgo(githubRepo.createdAt)}</span>
											<span>Pushed {timeAgo(githubRepo.pushedAt)}</span>
										</div>
										{#if githubRepo.commits.length > 0}
											<div class="border-t border-ds-border-light pt-2 mt-2">
												<p class="text-xs font-medium text-ds-text-placeholder mb-1">Recent commits</p>
												{#each githubRepo.commits.slice(0, 5) as commit}
													<div class="flex items-start gap-2 py-1 text-xs">
														<a href={commit.url} target="_blank" rel="noopener noreferrer" class="text-ds-link font-mono shrink-0">{commit.sha.slice(0, 7)}</a>
														<span class="text-ds-text-placeholder truncate flex-1">{commit.message.split('\n')[0]}</span>
														<span class="text-[10px] text-[#aaa] shrink-0">{timeAgo(commit.date)}</span>
													</div>
												{/each}
											</div>
										{/if}
									{:else}
										<p class="text-ds-text-placeholder">No GitHub data available.</p>
									{/if}
							</Accordion>

							<!-- Accordion: Review History -->
							<Accordion title="Review History" class="mb-2">
									{#if currentSubmission.timeline.length === 0}
										<p class="text-ds-text-placeholder italic">No review history yet.</p>
									{/if}
									{#each currentSubmission.timeline as event, i}
										{#if i > 0}<hr class="border-none border-t border-ds-border-light my-2" />{/if}
										{#if event.type === 'submitted' || event.type === 'resubmitted'}
											<div class="flex items-center gap-2 text-xs text-ds-text-placeholder">
												<span class="w-1.5 h-1.5 rounded-full shrink-0 {event.type === 'submitted' ? 'bg-[#42a5f5]' : 'bg-[#f5a623]'}"></span>
												{event.type === 'submitted' ? 'Submitted' : 'Re-submitted'} with <strong class="text-black">{event.hours ?? '?'}h</strong>
												<span class="border-b border-dotted border-[#808080]" title={formatDate(event.timestamp)}>{timeAgo(event.timestamp)}</span>
											</div>
										{:else if event.type === 'approved'}
											<div>
												<span class="inline-block text-[10px] font-bold px-1.5 py-0.5 rounded bg-ds-green-bg text-ds-green mb-1">✓ Approved</span>
												{#if event.approvedHours != null && event.submittedHours != null && event.approvedHours !== event.submittedHours}
													<span class="inline-block text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#fff3e0] text-[#ff9800] ml-1">{event.submittedHours}h → {event.approvedHours}h</span>
												{/if}
												{#if event.userFeedback}<p class="text-xs mt-1 mb-0">{event.userFeedback}</p>{/if}
												<p class="text-xs text-ds-text-placeholder mt-1 mb-0">by @{event.reviewerName} · <span title={formatDate(event.timestamp)}>{timeAgo(event.timestamp)}</span></p>
												{#if event.hoursJustification}
													<div class="bg-[#fdf8f0] border-l-2 border-[#f5a623] rounded-r px-2 py-1.5 mt-1.5">
														<p class="text-[10px] font-bold text-[#f5a623] uppercase mb-0.5">Justification</p>
														<p class="text-xs m-0">{event.hoursJustification}</p>
													</div>
												{/if}
											</div>
										{:else if event.type === 'rejected'}
											<div>
												<span class="inline-block text-[10px] font-bold px-1.5 py-0.5 rounded bg-ds-red-bg text-ds-red mb-1">↻ Changes Needed</span>
												{#if event.userFeedback}<p class="text-xs mt-1 mb-0">{event.userFeedback}</p>{/if}
												<p class="text-xs text-ds-text-placeholder mt-1 mb-0">by @{event.reviewerName} · <span title={formatDate(event.timestamp)}>{timeAgo(event.timestamp)}</span></p>
											</div>
										{/if}
									{/each}
							</Accordion>

								<!-- Accordion: Hours Breakdown -->
								{#if currentSubmission.hackatimeHours != null}
									<Accordion title="Hours Breakdown" class="mb-2">
										{#snippet trailing()}<span class="text-ds-text-placeholder">{currentSubmission?.hackatimeHours?.toFixed(1)}h total</span>{/snippet}
											{#if hackatimeProjects.length > 1}
												<p class="text-xs font-medium mb-2">Per-project hours</p>
												{#each hackatimeProjects as project}
													<div class="flex items-center gap-2 mb-1.5">
														<span class="text-ds-text-placeholder truncate flex-1">{project}</span>
														<span class="font-bold">{(currentSubmission.hackatimeHours / hackatimeProjects.length).toFixed(1)}h</span>
													</div>
												{/each}
												<div class="flex items-center gap-2 pt-2 mt-2 border-t border-ds-border">
													<span class="font-medium">Total</span>
													<span class="font-bold ml-auto">{currentSubmission.hackatimeHours.toFixed(1)}h</span>
												</div>
											{:else if hackatimeProjects.length === 1}
												<div class="flex items-center gap-2">
													<span class="text-ds-text-placeholder">{hackatimeProjects[0]}</span>
													<span class="font-bold ml-auto">{currentSubmission.hackatimeHours.toFixed(1)}h</span>
												</div>
											{:else}
												<p class="text-ds-text-placeholder">No linked Hackatime projects.</p>
											{/if}
									</Accordion>
								{/if}

								<!-- Accordion: Project Card -->
								<Accordion title="Project Card" class="mb-2" contentClass="p-0">
										{#if currentSubmission.screenshotUrl}
											<img
												class="w-full max-h-[200px] object-cover block border-b border-ds-border"
												src={currentSubmission.screenshotUrl}
												alt="{currentSubmission.project.projectTitle ?? 'Project'} screenshot"
											/>
										{:else}
											<div class="w-full h-[100px] flex items-center justify-center text-ds-text-placeholder text-xs bg-ds-bg-secondary border-b border-ds-border">No screenshot</div>
										{/if}
										<div class="p-3">
											<h4 class="text-[15px] font-bold m-0 mb-1.5">{currentSubmission.project.projectTitle ?? 'Untitled Project'}</h4>
											<p class="text-xs text-ds-text-placeholder m-0 leading-relaxed whitespace-pre-wrap">
												{currentSubmission.project.description ?? 'No description provided.'}
											</p>
										</div>
								</Accordion>
						</div>
					{/if}
				</div>

				<!-- ── REVIEW PANEL (bottom) ── -->
				<div class="bg-ds-zone-pink-body shrink-0">
					<!-- Review header -->
					<div class="flex items-center gap-1 p-2 bg-ds-zone-pink border-y border-ds-border-divider">
						<button
							class="flex items-center gap-1 cursor-pointer text-xs font-medium text-black bg-transparent border-none p-0 hover:opacity-70"
							onclick={() => (reviewPanelOpen = !reviewPanelOpen)}
						>
							Review
							<ChevronUp size={16} class="transition-transform {reviewPanelOpen ? '' : 'rotate-180'}" />
						</button>
						<div class="ml-auto">
							<button
								class="bg-ds-zone-pink-btn border border-[#c8a7b3] rounded-lg p-2 text-xs font-medium cursor-pointer shadow-[var(--color-ds-shadow)] flex items-center gap-1 hover:bg-[#d4aebb]"
								onclick={() => (checklistOpen = !checklistOpen)}
							>
								Project Checklist
								<span class="text-ds-text-placeholder">({checkedItems.length}/{CHECKLIST_ITEMS.length})</span>
							</button>
						</div>
					</div>

					<div class="review-panel-body" class:review-panel-open={reviewPanelOpen && !!currentSubmission}><div class="overflow-hidden">
						<!-- Tabs -->
						<Tab
							items={[{ label: 'Approve', value: 'approve' }, { label: 'Changes Needed', value: 'changes' }]}
							bind:value={activeForm}
							variant="approve-reject"
							class="mx-4 mt-3"
						/>

						<!-- Tab content -->
						{#key activeForm}
						<div class="p-4 tab-content min-h-85">
							{#if activeForm === 'approve'}
								<div class="flex gap-4">
									<div class="flex-1">
										<label class="text-xs font-medium" for="rv2-hours">Approved Hours</label>
										<input
											id="rv2-hours"
											type="number"
											step="0.5"
											min="0"
											bind:value={approvedHours}
											class="block w-[80px] mt-1 bg-white border border-ds-border-divider rounded-lg p-1.5 text-sm font-bold outline-none focus:border-ds-border-strong"
										/>
									</div>
									<div class="flex-1">
										<label class="text-xs font-medium" for="rv2-justify">Hours Justification</label>
										<textarea
											id="rv2-justify"
											bind:value={hoursJustification}
											maxlength={500}
											placeholder="Why approve these hours?"
											class="block w-full mt-1 bg-white border border-ds-border-divider rounded-lg p-2 text-xs text-black font-dm resize-y min-h-9 outline-none focus:border-ds-border-strong"
										></textarea>
									</div>
								</div>
								<div class="mt-3">
									<label class="text-xs font-medium" for="rv2-feedback">User Feedback</label>
									<textarea
										id="rv2-feedback"
										bind:value={approveComment}
										maxlength={500}
										placeholder="Comment shown to user (optional)"
										class="block w-full mt-1 bg-white border border-ds-border-divider rounded-lg p-2 text-xs text-black font-dm resize-y min-h-9 outline-none focus:border-ds-border-strong"
									></textarea>
								</div>
								<div class="flex items-center gap-2 mt-3">
									<label class="flex items-center gap-1 text-[10px] text-ds-text-placeholder cursor-pointer">
										<input type="checkbox" bind:checked={sendEmail} class="accent-[#4caf50]" />
										Send email
									</label>
									<Button variant="approve" class="ml-auto" onclick={submitApproval} disabled={submitting}>
										{submitting ? '...' : 'Submit Approval'}
									</Button>
								</div>
							{:else}
								<div>
									<label class="text-xs font-medium" for="rv2-changes">What needs to change?</label>
									<textarea
										id="rv2-changes"
										bind:value={changesComment}
										maxlength={500}
										placeholder="Describe what the user needs to fix..."
										class="block w-full mt-1 bg-white border border-ds-border-divider rounded-lg p-2 text-xs text-black font-dm resize-y min-h-12 outline-none focus:border-ds-border-strong"
									></textarea>
								</div>
								<div class="flex items-center gap-2 mt-3">
									<label class="flex items-center gap-1 text-[10px] text-ds-text-placeholder cursor-pointer">
										<input type="checkbox" bind:checked={rejectSendEmail} class="accent-[#ef5350]" />
										Send email
									</label>
									<Button variant="reject" class="ml-auto" onclick={submitChangesNeeded} disabled={submitting}>
										{submitting ? '...' : 'Submit Changes Needed'}
									</Button>
								</div>
							{/if}
						</div>
						{/key}
					</div></div>
				</div>
			</div>
		</div>

		<!-- ── FLOATING USER NOTES WINDOW ── -->
		{#if userNotesOpen}
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				class="fixed z-50 w-[320px] bg-ds-zone-cool-body border border-ds-border rounded-lg shadow-[var(--color-ds-shadow-popout)] font-dm flex flex-col"
				style="left: {notesPosX}px; top: {notesPosY}px;"
			>
				<!-- Drag handle / title bar -->
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					class="flex items-center justify-between px-3 py-2 bg-ds-zone-cool border-b border-ds-border rounded-t-lg cursor-grab active:cursor-grabbing select-none"
					onmousedown={startDrag('notes')}
				>
					<span class="text-xs font-medium text-black">User Notes</span>
					<div class="flex items-center gap-2">
						<button
							class="text-[10px] text-ds-text-placeholder border border-ds-border rounded px-1.5 py-0.5 cursor-pointer bg-white hover:bg-ds-bg-secondary"
							onclick={saveUserNote}
							disabled={userNoteSaving}
						>
							{userNoteSaving ? 'Saving...' : 'Save'}
						</button>
						<button
							class="text-ds-text-placeholder hover:text-black cursor-pointer bg-transparent border-none text-sm leading-none p-0"
							onclick={() => (userNotesOpen = false)}
						>×</button>
					</div>
				</div>
				<!-- Content -->
				<div class="p-3">
					<textarea
						class="w-full bg-ds-bg-secondary border border-ds-border rounded-lg p-2 text-xs text-black font-dm resize-y min-h-[80px] outline-none focus:border-ds-border-strong"
						bind:value={userNote}
						maxlength={1000}
						placeholder="Notes about this user..."
					></textarea>
				</div>
			</div>
		{/if}

		<!-- ── FLOATING PROJECT CHECKLIST WINDOW ── -->
		{#if checklistOpen && currentSubmission}
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				class="fixed z-50 w-[360px] bg-ds-zone-pink-body border border-ds-border rounded-lg shadow-[var(--color-ds-shadow-popout)] font-dm flex flex-col"
				style="left: {checklistPosX}px; top: {checklistPosY}px;"
			>
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					class="flex items-center justify-between px-3 py-2 bg-ds-zone-pink border-b border-ds-border rounded-t-lg cursor-grab active:cursor-grabbing select-none"
					onmousedown={startDrag('checklist')}
				>
					<span class="text-xs font-medium text-black">Project Checklist & Notes</span>
					<button
						class="text-ds-text-placeholder hover:text-black cursor-pointer bg-transparent border-none text-sm leading-none p-0"
						onclick={() => (checklistOpen = false)}
					>×</button>
				</div>
				<div class="p-3 max-h-[400px] overflow-y-auto">
					<p class="text-xs font-medium mb-2">Checklist <span class="text-ds-text-placeholder">({checkedItems.length}/{CHECKLIST_ITEMS.length})</span></p>
					{#each CHECKLIST_ITEMS as item, idx}
						<label class="flex items-start gap-1.5 text-xs mb-1 cursor-pointer">
							<input type="checkbox" checked={checkedItems.includes(idx)} onchange={() => toggleChecklist(idx)} class="mt-px accent-[#4caf50] shrink-0" />
							<span class={checkedItems.includes(idx) ? 'line-through text-ds-text-placeholder' : ''}>{item}</span>
						</label>
					{/each}

					<div class="mt-3">
						<div class="flex items-center justify-between mb-1">
							<p class="text-xs font-medium m-0">Project Notes</p>
							<button class="text-[10px] text-ds-text-placeholder border border-ds-border rounded px-1.5 py-0.5 cursor-pointer bg-white hover:bg-ds-bg-secondary" onclick={saveProjectNote} disabled={projectNoteSaving}>
								{projectNoteSaving ? '...' : 'Save'}
							</button>
						</div>
						<textarea
							class="w-full bg-ds-bg-secondary border border-ds-border rounded-lg p-2 text-xs text-black font-dm resize-y min-h-[80px] outline-none focus:border-ds-border-strong"
							bind:value={projectNote}
							maxlength={1000}
							placeholder="Notes about this project..."
						></textarea>
					</div>
				</div>
			</div>
		{/if}
	</div>
{/if}

<!-- Global mouse listeners for drag -->
<svelte:window onmousemove={onMouseMove} onmouseup={onMouseUp} />

<style>
	:global(.readme-content h1) { font-size: 20px; font-weight: 700; margin-bottom: 8px; }
	:global(.readme-content h2) { font-size: 16px; font-weight: 700; margin-top: 14px; margin-bottom: 6px; }
	:global(.readme-content p) { margin-bottom: 8px; }
	:global(.readme-content code) { background: #f0f0f0; padding: 2px 5px; border-radius: 3px; font-size: 12px; }
	:global(.readme-content pre) { background: #f5f5f5; border: 1px solid #e0e0e0; border-radius: 6px; padding: 10px; margin-bottom: 10px; overflow-x: auto; }
	:global(.readme-content pre code) { background: none; padding: 0; }
	:global(.readme-content ul) { padding-left: 20px; margin-bottom: 8px; }
	:global(.readme-content li) { margin-bottom: 4px; }
	:global(.readme-content a) { color: #3a3a6a; }
	:global(.readme-content img) { max-width: 100%; }

	/* Review panel collapse animation */
	.review-panel-body {
		display: grid;
		grid-template-rows: 0fr;
		transition: grid-template-rows 0.25s ease;
	}
	.review-panel-body > :global(div) {
		opacity: 0;
		transition: opacity 0.15s ease;
	}
	.review-panel-open {
		grid-template-rows: 1fr;
	}
	.review-panel-open > :global(div) {
		opacity: 1;
		transition: opacity 0.2s ease 0.1s;
	}

	/* Readme dark mode */
	:global(.rv2-dark .readme-content code) { background: #2a2a2a; color: #e0e0e0; }
	:global(.rv2-dark .readme-content pre) { background: #222; border-color: #3a3a3a; }
	:global(.rv2-dark .readme-content a) { color: #8a8ac8; }
	:global(.rv2-dark .readme-content h1),
	:global(.rv2-dark .readme-content h2),
	:global(.rv2-dark .readme-content h3),
	:global(.rv2-dark .readme-content p),
	:global(.rv2-dark .readme-content li),
	:global(.rv2-dark .readme-content td),
	:global(.rv2-dark .readme-content th),
	:global(.rv2-dark .readme-content blockquote) { color: #d0d0d0; }
	:global(.rv2-dark .readme-content hr) { border-color: #3a3a3a; }
	:global(.rv2-dark .readme-content table) { border-color: #3a3a3a; }
	:global(.rv2-dark .readme-content th) { background: #2a2a2a; }

	/* ── Dark mode overrides ── */
	:global(.rv2-dark) {
		color-scheme: dark;
	}
	:global(.rv2-dark),
	:global(.rv2-dark *) {
		border-color: #3a3a3a;
	}
	/* Backgrounds */
	:global(.rv2-dark.bg-white),
	:global(.rv2-dark .bg-white) { background-color: #1a1a1a !important; }
	:global(.rv2-dark .bg-\[\#eaeaea\]) { background-color: #222 !important; }
	:global(.rv2-dark .bg-\[\#f5f5f5\]) { background-color: #252525 !important; }
	:global(.rv2-dark .bg-\[\#eee1d2\]) { background-color: #2e2822 !important; } /* body - lighter */
	:global(.rv2-dark .bg-\[\#d5d5d5\]) { background-color: #333 !important; }
	:global(.rv2-dark .bg-\[\#d8bfa1\]) { background-color: #221e18 !important; } /* header - darker */
	:global(.rv2-dark .bg-\[\#a1a8d8\]) { background-color: #1a1c38 !important; } /* header - darker */
	:global(.rv2-dark .bg-\[\#d2d5ee\]) { background-color: #252840 !important; } /* body - lighter */
	:global(.rv2-dark .bg-\[\#d8a1b4\]) { background-color: #241a20 !important; } /* header - darker */
	:global(.rv2-dark .bg-\[\#eed2dc\]) { background-color: #302028 !important; } /* body - lighter */
	:global(.rv2-dark .bg-\[\#eaebf8\]) { background-color: #2a2b40 !important; }
	:global(.rv2-dark .bg-\[\#fce3c5\]) { background-color: #3a3020 !important; }
	:global(.rv2-dark .bg-\[\#fdd25e\]) { background-color: #4a3d10 !important; }
	:global(.rv2-dark .bg-\[\#e8f5e9\]) { background-color: #1a2e1a !important; }
	:global(.rv2-dark .bg-\[\#ffebee\]) { background-color: #2e1a1a !important; }
	:global(.rv2-dark .bg-\[\#4caf50\]) { background-color: #2e7d32 !important; }
	:global(.rv2-dark .bg-\[\#ef5350\]) { background-color: #c62828 !important; }
	/* Text */
	:global(.rv2-dark .text-black),
	:global(.rv2-dark.text-black) { color: #e0e0e0 !important; }
	:global(.rv2-dark .text-\[\#808080\]) { color: #888 !important; }
	:global(.rv2-dark .text-\[\#999\]) { color: #777 !important; }
	:global(.rv2-dark .text-\[\#3a3a6a\]) { color: #8a8ac8 !important; }
	:global(.rv2-dark .text-\[\#4c4c4c\]) { color: #ccc !important; }
	:global(.rv2-dark .text-\[\#8a7560\]) { color: #a09080 !important; }
	:global(.rv2-dark strong.text-black) { color: #e0e0e0 !important; }
	/* Borders */
	:global(.rv2-dark .border-\[\#a7a7a7\]),
	:global(.rv2-dark .border-\[\#b3b3b3\]) { border-color: #3a3a3a !important; }
	:global(.rv2-dark .border-\[\#cabc96\]) { border-color: #4a4020 !important; }
	/* Inputs & textareas */
	:global(.rv2-dark) input,
	:global(.rv2-dark) textarea {
		background-color: #252525 !important;
		color: #e0e0e0 !important;
		border-color: #3a3a3a !important;
	}
	:global(.rv2-dark) input::placeholder,
	:global(.rv2-dark) textarea::placeholder {
		color: #666 !important;
	}
	/* Hover — brighten all buttons uniformly */
	:global(.rv2-dark) button:hover,
	:global(.rv2-dark) a[href]:hover {
		filter: brightness(1.15);
	}
	:global(.rv2-dark) summary:hover,
	:global(.rv2-dark .dark-hover):hover {
		filter: brightness(1.5);
		background-color: rgba(255, 255, 255, 0.08) !important;
	}
	/* Shadow adjustments */
	:global(.rv2-dark .shadow-\[0_1px_4px_rgba\(0\,0\,0\,0\.1\)\]),
	:global(.rv2-dark .shadow-\[0px_1px_4px_0px_rgba\(0\,0\,0\,0\.1\)\]) {
		box-shadow: 0 1px 4px rgba(0,0,0,0.4) !important;
	}
	/* Popouts */
	:global(.rv2-dark .shadow-\[0_4px_20px_rgba\(0\,0\,0\,0\.2\)\]) {
		box-shadow: 0 4px 20px rgba(0,0,0,0.6) !important;
	}
	/* Popout & button colors — headers darker than bodies */
	:global(.rv2-dark .bg-\[\#bfc3e6\]) { background-color: #202440 !important; } /* user notes button */
	:global(.rv2-dark .bg-\[\#aaafda\]) { background-color: #1a1e38 !important; } /* user notes button hover */
	:global(.rv2-dark .bg-\[\#e0bcc9\]) { background-color: #2a1e24 !important; } /* checklist button */
	:global(.rv2-dark .bg-\[\#d4aebb\]) { background-color: #221a20 !important; } /* checklist button hover */
	/* Resize handle */
	:global(.rv2-dark .bg-\[\#b3b3b3\]) { background-color: #3a3a3a !important; }
	:global(.rv2-dark .hover\:bg-\[\#808080\]):hover { background-color: #555 !important; }
	/* Logo invert */
	:global(.rv2-dark) img[alt="Horizons"] {
		filter: invert(1);
	}
	/* Scrollbar */
	:global(.rv2-dark) ::-webkit-scrollbar { background: #1a1a1a; }
	:global(.rv2-dark) ::-webkit-scrollbar-thumb { background: #444; border-radius: 4px; }
</style>
