<script lang="ts">
	import { onMount } from 'svelte';
	import TopBar from './components/TopBar.svelte';
	import UserInfo from './components/UserInfo.svelte';
	import NotesSection from './components/NotesSection.svelte';
	import ReviewHistory from './components/ReviewHistory.svelte';
	import DemoIframe from './components/DemoIframe.svelte';
	import ReadmeDrawer from './components/ReadmeDrawer.svelte';
	import ActionBar from './components/ActionBar.svelte';
	import GitHubPanel from './components/GitHubPanel.svelte';
	import ReviewChecklist from './components/ReviewChecklist.svelte';
	import ProjectGallery from './components/ProjectGallery.svelte';
	import { api, type components } from '$lib/api';

	type QueueItem = components['schemas']['QueueItemResponse'];
	type SubmissionDetail = components['schemas']['SubmissionDetailResponse'];
	type GitHubRepo = components['schemas']['GitHubRepoResponse'];

	// Queue state
	let queue = $state<QueueItem[]>([]);
	let queueLoading = $state(true);
	let queueError = $state<string | null>(null);

	// Navigation
	let galleryMode = $state(true);
	let currentIndex = $state(0);
	let queueLength = $derived(queue.length);

	// Current submission detail + loading
	let currentSubmission = $state<SubmissionDetail | null>(null);
	let submissionLoading = $state(false);

	// GitHub data
	let githubRepo = $state<GitHubRepo | null>(null);
	let githubLoading = $state(false);
	let githubError = $state<string | null>(null);

	// Sidebar data
	let readmeMarkdown = $state('');
	let projectNote = $state('');
	let userNote = $state('');
	let checkedItems = $state<number[]>([]);
	let editedHours = $state<number | null>(null);

	onMount(() => {
		loadQueue();
	});

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

			const repoUrl = data.project.repoUrl || data.repoUrl;
			const promises: Promise<void>[] = [];

			if (repoUrl) {
				promises.push(loadGitHubData(repoUrl));
				promises.push(loadReadme(repoUrl));
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

	async function loadGitHubData(repoUrl: string) {
		githubLoading = true;
		githubError = null;
		try {
			const { data, error } = await api.GET('/api/github/repo', {
				params: { query: { url: repoUrl } },
			});
			if (error || !data) {
				githubError = 'Failed to load GitHub data';
				return;
			}
			githubRepo = data.data ?? null;
			if (data.error) githubError = data.error;
		} catch (error) {
			console.error('GitHub data fetch failed:', error);
			githubError = 'Failed to load GitHub data';
		} finally {
			githubLoading = false;
		}
	}

	async function loadReadme(repoUrl: string) {
		try {
			const { data } = await api.GET('/api/github/readme', {
				params: { query: { url: repoUrl } },
			});
			readmeMarkdown = data?.content ?? '';
		} catch {
			readmeMarkdown = '';
		}
	}

	async function loadNotes(projectId: number, userId: number) {
		try {
			const [projRes, userRes] = await Promise.all([
				api.GET('/api/reviewer/projects/{id}/notes', { params: { path: { id: projectId } } }),
				api.GET('/api/reviewer/users/{id}/notes', { params: { path: { id: userId } } }),
			]);
			projectNote = projRes.data?.content ?? '';
			userNote = userRes.data?.content ?? '';
		} catch {
			projectNote = '';
			userNote = '';
		}
	}

	async function loadChecklist(submissionId: number) {
		try {
			const { data } = await api.GET('/api/reviewer/submissions/{id}/checklist', {
				params: { path: { id: submissionId } },
			});
			checkedItems = data?.checkedItems ?? [];
		} catch {
			checkedItems = [];
		}
	}

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

	async function navigateTo(index: number) {
		if (index < 0 || index >= queue.length) return;
		currentIndex = index;
		await loadSubmissionDetail(queue[index].submissionId);
	}

	async function navigateNext() {
		if (currentIndex < queueLength - 1) {
			await navigateTo(currentIndex + 1);
		}
	}

	async function navigatePrev() {
		if (currentIndex > 0) {
			await navigateTo(currentIndex - 1);
		}
	}

	function handleHoursChange(hours: number) {
		editedHours = hours;
	}

	function handleReviewComplete() {
		loadQueue();
	}
</script>

<svelte:head>
	<link
		href="https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Inter:wght@400;500;600;700&display=swap"
		rel="stylesheet"
	/>
	<title>Horizons — Project Review</title>
</svelte:head>

<div class="font-[Inter,sans-serif] bg-rv-bg text-rv-text h-screen flex flex-col overflow-hidden">
	{#if queueLoading}
		<div class="flex flex-col items-center justify-center h-screen gap-2 font-[Inter,sans-serif] text-rv-dim bg-rv-bg">
			<p>Loading review queue...</p>
		</div>
	{:else if queueError}
		<div class="flex flex-col items-center justify-center h-screen gap-2 font-[Inter,sans-serif] text-rv-red bg-rv-bg">
			<p>Failed to load review queue</p>
			<p class="text-xs text-rv-dim max-w-[400px] text-center">{queueError}</p>
			<button class="mt-3 bg-rv-surface2 border border-rv-border text-rv-text px-5 py-2 rounded-md cursor-pointer font-inherit" onclick={() => loadQueue()}>Retry</button>
		</div>
	{:else if queueLength === 0}
		<div class="flex flex-col items-center justify-center h-screen gap-2 font-[Inter,sans-serif] text-rv-dim bg-rv-bg">
			<p>No pending submissions to review.</p>
		</div>
	{:else if galleryMode}
		<ProjectGallery items={queue} onSelect={selectFromGallery} />
	{:else}
		<TopBar
			{currentIndex}
			totalCount={queueLength}
			onPrev={navigatePrev}
			onNext={navigateNext}
			onBackToGallery={returnToGallery}
		/>

		<div class="grid grid-cols-[300px_1fr_320px] flex-1 overflow-hidden">
			<!-- LEFT PANEL -->
			<div class="bg-rv-surface border-r border-rv-border overflow-y-auto">
				{#if currentSubmission}
					<UserInfo
						user={currentSubmission.project.user}
						repoUrl={currentSubmission.project.repoUrl ?? currentSubmission.repoUrl}
						playableUrl={currentSubmission.project.playableUrl ?? currentSubmission.playableUrl}
						readmeUrl={currentSubmission.project.readmeUrl}
						hackatimeHours={currentSubmission.hackatimeHours}
						hackatimeProjects={currentSubmission.project.nowHackatimeProjects ?? []}
						onHoursChange={handleHoursChange}
					/>

					<hr class="border-none border-t border-rv-border m-0" />

					<NotesSection
						title="Notes — Project"
						targetType="project"
						targetId={currentSubmission.project.projectId}
						bind:content={projectNote}
					/>

					<hr class="border-none border-t border-rv-border m-0" />

					<NotesSection
						title="Notes — User"
						targetType="user"
						targetId={currentSubmission.project.user.userId}
						bind:content={userNote}
					/>

					<hr class="border-none border-t border-rv-border m-0" />

					<ReviewHistory timeline={currentSubmission.timeline} />
				{:else if submissionLoading}
					<div class="flex items-center justify-center p-10 text-rv-dim text-[13px]">Loading...</div>
				{/if}
			</div>

			<!-- CENTER PANEL -->
			<div class="flex flex-col overflow-hidden">
				{#if currentSubmission}
					<DemoIframe
						demoUrl={currentSubmission.playableUrl ?? currentSubmission.project.playableUrl}
					/>

					<ReadmeDrawer markdown={readmeMarkdown} />

					<ActionBar
						submissionId={currentSubmission.submissionId}
						hackatimeHours={currentSubmission.hackatimeHours}
						{editedHours}
						projectTitle={currentSubmission.project.projectTitle}
						projectDescription={currentSubmission.project.description}
						screenshotUrl={currentSubmission.screenshotUrl}
						onReviewComplete={handleReviewComplete}
					/>
				{:else if submissionLoading}
					<div class="flex items-center justify-center p-10 text-rv-dim text-[13px]">Loading submission...</div>
				{/if}
			</div>

			<!-- RIGHT PANEL -->
			<div class="bg-rv-surface border-l border-rv-border flex flex-col overflow-hidden">
				<GitHubPanel
					repo={githubRepo}
					loading={githubLoading}
					error={githubError}
					repoUrl={currentSubmission?.project.repoUrl ?? currentSubmission?.repoUrl ?? null}
				/>

				{#if currentSubmission}
					<ReviewChecklist
						submissionId={currentSubmission.submissionId}
						bind:checkedItems
					/>
				{/if}
			</div>
		</div>
	{/if}
</div>
