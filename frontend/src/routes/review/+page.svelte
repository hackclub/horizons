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
	import type { QueueItem, SubmissionDetail, GitHubRepo } from './api';
	import {
		fetchQueue,
		fetchSubmissionDetail,
		fetchGitHubRepo,
		fetchReadmeContent,
		fetchNote,
		fetchChecklist,
	} from './api';

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
			queue = await fetchQueue();
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
			const detail = await fetchSubmissionDetail(submissionId);
			currentSubmission = detail;

			const repoUrl = detail.project.repoUrl || detail.repoUrl;
			const promises: Promise<void>[] = [];

			if (repoUrl) {
				promises.push(loadGitHubData(repoUrl));
				promises.push(loadReadme(repoUrl));
			}

			promises.push(loadNotes(detail.project.projectId, detail.project.user.userId));
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
			const result = await fetchGitHubRepo(repoUrl);
			githubRepo = result.data;
			if (result.error) githubError = result.error;
		} catch (error) {
			console.error('GitHub data fetch failed:', error);
			githubError = 'Failed to load GitHub data';
		} finally {
			githubLoading = false;
		}
	}

	async function loadReadme(repoUrl: string) {
		try {
			readmeMarkdown = (await fetchReadmeContent(repoUrl)) ?? '';
		} catch (error) {
			console.error('README fetch failed:', error);
			readmeMarkdown = '';
		}
	}

	async function loadNotes(projectId: number, userId: number) {
		try {
			const [projNote, usrNote] = await Promise.all([
				fetchNote('project', projectId),
				fetchNote('user', userId),
			]);
			projectNote = projNote.content;
			userNote = usrNote.content;
		} catch (error) {
			console.error('Notes fetch failed:', error);
			projectNote = '';
			userNote = '';
		}
	}

	async function loadChecklist(submissionId: number) {
		try {
			const result = await fetchChecklist(submissionId);
			checkedItems = result.checkedItems;
		} catch (error) {
			console.error('Checklist fetch failed:', error);
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

<div class="review-root">
	{#if queueLoading}
		<div class="loading-screen">
			<p>Loading review queue...</p>
		</div>
	{:else if queueError}
		<div class="loading-screen error">
			<p>Failed to load review queue</p>
			<p class="error-detail">{queueError}</p>
			<button onclick={() => loadQueue()}>Retry</button>
		</div>
	{:else if queueLength === 0}
		<div class="loading-screen">
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

		<div class="main">
			<!-- LEFT PANEL -->
			<div class="left">
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

					<hr class="section-divider" />

					<NotesSection
						title="Notes — Project"
						targetType="project"
						targetId={currentSubmission.project.projectId}
						bind:content={projectNote}
					/>

					<hr class="section-divider" />

					<NotesSection
						title="Notes — User"
						targetType="user"
						targetId={currentSubmission.project.user.userId}
						bind:content={userNote}
					/>

					<hr class="section-divider" />

					<ReviewHistory timeline={currentSubmission.timeline} />
				{:else if submissionLoading}
					<div class="panel-loading">Loading...</div>
				{/if}
			</div>

			<!-- CENTER PANEL -->
			<div class="center">
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
					<div class="panel-loading">Loading submission...</div>
				{/if}
			</div>

			<!-- RIGHT PANEL -->
			<div class="right">
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

<style>
	/* CSS custom properties scoped to the review UI — dark theme */
	:global(:root) {
		--bg: #1c1c1c;
		--surface: #242424;
		--surface2: #2e2e2e;
		--border: #3a3a3a;
		--text: #e0e0e0;
		--text-dim: #8892a4;
		--accent: #f5a623;
		--green: #4caf50;
		--green-bg: rgba(76, 175, 80, 0.12);
		--red: #ef5350;
		--red-bg: rgba(239, 83, 80, 0.12);
		--blue: #42a5f5;
		--tag-bg: rgba(245, 166, 35, 0.15);
		--divider: rgba(255, 255, 255, 0.06);
	}

	.review-root {
		font-family: 'Inter', sans-serif;
		background: var(--bg);
		color: var(--text);
		height: 100vh;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.main {
		display: grid;
		grid-template-columns: 300px 1fr 320px;
		flex: 1;
		overflow: hidden;
	}

	.left {
		background: var(--surface);
		border-right: 1px solid var(--border);
		overflow-y: auto;
	}

	.center {
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.right {
		background: var(--surface);
		border-left: 1px solid var(--border);
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.section-divider {
		border: none;
		border-top: 1px solid var(--border);
		margin: 0;
	}

	.loading-screen {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		height: 100vh;
		gap: 8px;
		font-family: 'Inter', sans-serif;
		color: var(--text-dim);
		background: var(--bg);
	}

	.loading-screen.error {
		color: var(--red);
	}

	.error-detail {
		font-size: 12px;
		color: var(--text-dim);
		max-width: 400px;
		text-align: center;
	}

	.loading-screen button {
		margin-top: 12px;
		background: var(--surface2);
		border: 1px solid var(--border);
		color: var(--text);
		padding: 8px 20px;
		border-radius: 6px;
		cursor: pointer;
		font-family: inherit;
	}

	.panel-loading {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 40px;
		color: var(--text-dim);
		font-size: 13px;
	}
</style>
