<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { page } from '$app/stores';
	import { marked } from 'marked';
	import DOMPurify from 'dompurify';
	import { api, type components } from '$lib/api';
	import { timeAgo, formatDate } from '../../../review/utils';
	import { ExternalLink, RefreshCcw, ChevronUp, Monitor, Star, GitFork, CircleAlert, GitPullRequest } from 'lucide-svelte';
	import { Button, Tab, Accordion, IconButtonGroup, TextField } from '$lib/components';

	type QueueItem = components['schemas']['QueueItemResponse'];
	type SubmissionDetail = components['schemas']['SubmissionDetailResponse'];
	type GitHubRepo = components['schemas']['GitHubRepoResponse'];

	let projectId = $derived(Number($page.params.projectId));

	// ── Queue state (for next/prev navigation) ──
	let queue = $state<QueueItem[]>([]);
	let currentIndex = $state(0);
	let queueLength = $derived(queue.length);

	// ── Current submission ──
	let currentSubmission = $state<SubmissionDetail | null>(null);
	let submissionLoading = $state(true);

	// ── GitHub data ──
	let githubRepo = $state<GitHubRepo | null>(null);
	let githubLoading = $state(false);
	let githubError = $state<string | null>(null);

	// ── Review data ──
	let readmeMarkdown = $state('');
	let projectNote = $state('');
	let userNote = $state('');
	let checkedItems = $state<number[]>([]);

	// ── UI toggles ──
	let reviewPanelOpen = $state(true);
	let userNotesOpen = $state(false);
	let checklistOpen = $state(false);

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

	// ── Derived ──
	let demoUrl = $derived(currentSubmission?.playableUrl ?? currentSubmission?.project.playableUrl ?? null);
	let repoUrl = $derived(currentSubmission?.project.repoUrl ?? currentSubmission?.repoUrl ?? null);
	let sanitizedReadme = $derived(readmeMarkdown ? DOMPurify.sanitize(marked.parse(readmeMarkdown) as string) : '');
	let userNoteCount = $derived(userNote.trim().length > 0 ? 1 : 0);
	let hackatimeProjects = $derived(currentSubmission?.project.nowHackatimeProjects ?? []);
	let airlockUrl = $derived(repoUrl ? `https://airlock.hackclub.com/?r=${encodeURIComponent(repoUrl)}` : null);

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
		// Load queue for next/prev navigation
		const { data: queueData } = await api.GET('/api/reviewer/queue');
		queue = queueData ?? [];

		// Find the submission for this project
		const item = queue.find(q => q.projectId === projectId);
		if (!item) {
			// Project not in queue, go back
			goto(`${base}/review2`);
			return;
		}
		currentIndex = queue.indexOf(item);
		await loadSubmissionDetail(item.submissionId);
	});

	// Reset form on submission change
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
	function goBack() {
		history.back();
	}

	async function navigateNext() {
		if (currentIndex < queueLength - 1) {
			currentIndex++;
			goto(`${base}/review2/${queue[currentIndex].projectId}`);
		}
	}

	// ── Iframe controls ──
	function loadDemo() { if (demoUrl) iframeLoaded = true; }
	function reloadDemo() { if (iframeElement) iframeElement.src = iframeElement.src; }
	function openExternal() { if (demoUrl) window.open(demoUrl, '_blank'); }

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
			// Navigate to next project or back to gallery
			if (currentIndex < queueLength - 1) {
				navigateNext();
			} else {
				goBack();
			}
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
			if (currentIndex < queueLength - 1) {
				navigateNext();
			} else {
				goBack();
			}
		} catch (e) {
			alert(`Review failed: ${e instanceof Error ? e.message : 'Unknown error'}`);
		} finally { submitting = false; }
	}
</script>

<svelte:head>
	<title>Horizons — Review Project</title>
</svelte:head>

{#if submissionLoading}
	<div class="flex items-center justify-center h-full font-dm text-ds-text-placeholder">
		<p>Loading submission...</p>
	</div>
{:else if !currentSubmission}
	<div class="flex flex-col items-center justify-center h-full gap-2 font-dm text-ds-text-placeholder">
		<p>Project not found in review queue.</p>
		<Button class="mt-3" onclick={goBack}>← Back to Gallery</Button>
	</div>
{:else}
	<!-- ═══ REVIEW DETAIL ═══ -->
	<div class="flex flex-col h-full font-dm text-ds-text overflow-hidden">

		<!-- ── TOP BAR ── -->
		<div class="flex items-center justify-between p-2 h-12 bg-ds-bg border-b border-ds-border-divider shrink-0">
			<Button onclick={goBack}>← Gallery</Button>

			<div class="flex items-center gap-2">
				<span class="text-xs text-ds-text-tertiary">
					Reviewing <strong class="text-ds-text">{currentIndex + 1}</strong> of <strong class="text-ds-text">{queueLength}</strong> pending
				</span>
				<Button onclick={navigateNext} disabled={currentIndex >= queueLength - 1}>Skip</Button>
			</div>
		</div>

		<!-- ── MAIN 2-COLUMN LAYOUT ── -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="flex flex-1 overflow-hidden" class:cursor-col-resize={resizing} class:select-none={resizing} bind:this={splitContainer}>

			<!-- ═══ LEFT: DEMO IFRAME ═══ -->
			<div class="flex flex-col" style="width: {splitPercent}%">
				<!-- URL toolbar -->
				<div class="flex gap-2 items-center p-2 bg-ds-zone-warm border-b border-ds-border-divider shrink-0">
					<TextField
						value={demoUrl ?? 'No demo URL'}
						readonly
						class="flex-1 bg-ds-surface-inactive! p-2! text-xs! text-ds-text-placeholder! font-medium overflow-hidden text-ellipsis whitespace-nowrap shadow-(--color-ds-shadow)"
					/>
					{#if airlockUrl}
						<a href={airlockUrl} target="_blank" rel="noopener noreferrer">
							<Button class="bg-ds-tag-active no-underline shrink-0">Airlock</Button>
						</a>
					{/if}
					{#snippet externalLinkIcon()}<ExternalLink size={12} />{/snippet}
					{#snippet refreshIcon()}<RefreshCcw size={12} />{/snippet}
					<IconButtonGroup buttons={[
						{ icon: externalLinkIcon, onclick: openExternal, disabled: !demoUrl, title: 'Open in new tab' },
						{ icon: refreshIcon, onclick: reloadDemo, disabled: !iframeLoaded, title: 'Reload' },
					] as any} />
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
							class="flex flex-col items-center gap-3 text-ds-text-placeholder cursor-pointer bg-transparent border-none hover:text-ds-text-secondary"
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
				class="w-1 shrink-0 bg-ds-border cursor-col-resize hover:bg-ds-border-strong active:bg-ds-border-strong transition-colors relative group"
				onmousedown={startResize}
			>
				<div class="absolute inset-y-0 -left-1 -right-1"></div>
			</div>

			<!-- ═══ RIGHT: INFO + REVIEW ═══ -->
			<div class="flex flex-col overflow-hidden" style="width: {100 - splitPercent}%">

				<!-- Right top toolbar -->
				<div class="flex items-center justify-end gap-2 px-2 h-[51px] box-border bg-ds-zone-cool border-b border-ds-border-divider shrink-0">
					<button
						class="bg-ds-zone-cool-btn border border-ds-border rounded-lg p-2 text-xs font-medium cursor-pointer shadow-[var(--color-ds-shadow)] flex items-center gap-1 hover:opacity-80"
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
									&middot; <a href="https://hackclub.slack.com/team/{currentSubmission.project.user.slackUserId}" target="_blank" rel="noopener noreferrer" class="text-ds-link underline hover:text-ds-text">Slack DM</a>
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
												<span class="text-[10px] text-ds-text-tertiary shrink-0">{timeAgo(commit.date)}</span>
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
										{event.type === 'submitted' ? 'Submitted' : 'Re-submitted'} with <strong class="text-ds-text">{event.hours ?? '?'}h</strong>
										<span class="border-b border-dotted border-ds-border" title={formatDate(event.timestamp)}>{timeAgo(event.timestamp)}</span>
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
				</div>

				<!-- ── REVIEW PANEL (bottom) ── -->
				<div class="bg-ds-zone-pink-body shrink-0">
					<!-- Review header -->
					<div class="flex items-center gap-1 p-2 bg-ds-zone-pink border-y border-ds-border-divider">
						<button
							class="flex items-center gap-1 cursor-pointer text-xs font-medium text-ds-text bg-transparent border-none p-0 hover:opacity-70"
							onclick={() => (reviewPanelOpen = !reviewPanelOpen)}
						>
							Review
							<ChevronUp size={16} class="transition-transform {reviewPanelOpen ? '' : 'rotate-180'}" />
						</button>
						<div class="ml-auto">
							<button
								class="bg-ds-zone-pink-btn border border-ds-border rounded-lg p-2 text-xs font-medium cursor-pointer shadow-[var(--color-ds-shadow)] flex items-center gap-1 hover:opacity-80"
								onclick={() => (checklistOpen = !checklistOpen)}
							>
								Project Checklist
								<span class="text-ds-text-placeholder">({checkedItems.length}/{CHECKLIST_ITEMS.length})</span>
							</button>
						</div>
					</div>

					<div class="review-panel-body" class:review-panel-open={reviewPanelOpen}>
						<div class="overflow-hidden">
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
											<label class="text-xs font-medium" for="rv-hours">Approved Hours</label>
											<TextField
												id="rv-hours"
												type="number"
												step="0.5"
												min="0"
												bind:value={approvedHours}
												class="w-20! mt-1 p-1.5! font-bold"
											/>
										</div>
										<div class="flex-1">
											<label class="text-xs font-medium" for="rv-justify">Hours Justification</label>
											<TextField
												multiline
												id="rv-justify"
												bind:value={hoursJustification}
												maxlength={500}
												placeholder="Why approve these hours?"
												class="mt-1 p-2! text-xs! resize-y min-h-9"
											/>
										</div>
									</div>
									<div class="mt-3">
										<label class="text-xs font-medium" for="rv-feedback">User Feedback</label>
										<TextField
											multiline
											id="rv-feedback"
											bind:value={approveComment}
											maxlength={500}
											placeholder="Comment shown to user (optional)"
											class="mt-1 p-2! text-xs! resize-y min-h-9"
										/>
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
										<label class="text-xs font-medium" for="rv-changes">What needs to change?</label>
										<TextField
											multiline
											id="rv-changes"
											bind:value={changesComment}
											maxlength={500}
											placeholder="Describe what the user needs to fix..."
											class="mt-1 p-2! text-xs! resize-y min-h-12"
										/>
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
						</div>
					</div>
				</div>
			</div>
		</div>

		<!-- ── FLOATING USER NOTES WINDOW ── -->
		{#if userNotesOpen}
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				class="fixed z-50 w-[320px] bg-ds-zone-cool-body border border-ds-border rounded-lg shadow-lg font-dm flex flex-col"
				style="left: {notesPosX}px; top: {notesPosY}px;"
			>
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					class="flex items-center justify-between px-3 py-2 bg-ds-zone-cool border-b border-ds-border rounded-t-lg cursor-grab active:cursor-grabbing select-none"
					onmousedown={startDrag('notes')}
				>
					<span class="text-xs font-medium">User Notes</span>
					<div class="flex items-center gap-2">
						<button
							class="text-[10px] text-ds-text-placeholder border border-ds-border rounded px-1.5 py-0.5 cursor-pointer bg-ds-surface hover:bg-ds-bg-secondary"
							onclick={saveUserNote}
							disabled={userNoteSaving}
						>
							{userNoteSaving ? 'Saving...' : 'Save'}
						</button>
						<button
							class="text-ds-text-placeholder hover:text-ds-text cursor-pointer bg-transparent border-none text-sm leading-none p-0"
							onclick={() => (userNotesOpen = false)}
						>×</button>
					</div>
				</div>
				<div class="p-3">
					<TextField
						multiline
						bind:value={userNote}
						maxlength={1000}
						placeholder="Notes about this user..."
						class="p-2! text-xs! resize-y min-h-20"
					/>
				</div>
			</div>
		{/if}

		<!-- ── FLOATING PROJECT CHECKLIST WINDOW ── -->
		{#if checklistOpen}
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				class="fixed z-50 w-[360px] bg-ds-zone-pink-body border border-ds-border rounded-lg shadow-lg font-dm flex flex-col"
				style="left: {checklistPosX}px; top: {checklistPosY}px;"
			>
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					class="flex items-center justify-between px-3 py-2 bg-ds-zone-pink border-b border-ds-border rounded-t-lg cursor-grab active:cursor-grabbing select-none"
					onmousedown={startDrag('checklist')}
				>
					<span class="text-xs font-medium">Project Checklist & Notes</span>
					<button
						class="text-ds-text-placeholder hover:text-ds-text cursor-pointer bg-transparent border-none text-sm leading-none p-0"
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
							<button class="text-[10px] text-ds-text-placeholder border border-ds-border rounded px-1.5 py-0.5 cursor-pointer bg-ds-surface hover:bg-ds-bg-secondary" onclick={saveProjectNote} disabled={projectNoteSaving}>
								{projectNoteSaving ? '...' : 'Save'}
							</button>
						</div>
						<TextField
							multiline
							bind:value={projectNote}
							maxlength={1000}
							placeholder="Notes about this project..."
							class="p-2! text-xs! resize-y min-h-20"
						/>
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
	:global(.readme-content code) { background: var(--color-ds-bg-secondary); padding: 2px 5px; border-radius: 3px; font-size: 12px; }
	:global(.readme-content pre) { background: var(--color-ds-bg-secondary); border: 1px solid var(--color-ds-border); border-radius: 6px; padding: 10px; margin-bottom: 10px; overflow-x: auto; }
	:global(.readme-content pre code) { background: none; padding: 0; }
	:global(.readme-content ul) { padding-left: 20px; margin-bottom: 8px; }
	:global(.readme-content li) { margin-bottom: 4px; }
	:global(.readme-content a) { color: var(--color-ds-link); }
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
</style>
