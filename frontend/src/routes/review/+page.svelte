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
	import {
		queue,
		queueLoading,
		queueError,
		currentIndex,
		currentSubmission,
		submissionLoading,
		githubRepo,
		githubLoading,
		readmeHtml,
		projectNote,
		userNote,
		checkedItems,
		queueLength,
		loadQueue,
		navigateNext,
		navigatePrev,
	} from './store';

	let editedHours = $state<number | null>(null);

	onMount(() => {
		loadQueue();
	});

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
	{#if $queueLoading}
		<div class="loading-screen">
			<p>Loading review queue...</p>
		</div>
	{:else if $queueError}
		<div class="loading-screen error">
			<p>Failed to load review queue</p>
			<p class="error-detail">{$queueError}</p>
			<button onclick={() => loadQueue()}>Retry</button>
		</div>
	{:else if $queueLength === 0}
		<div class="loading-screen">
			<p>No pending submissions to review.</p>
		</div>
	{:else}
		<TopBar
			currentIndex={$currentIndex}
			totalCount={$queueLength}
			onPrev={navigatePrev}
			onNext={navigateNext}
		/>

		<div class="main">
			<!-- LEFT PANEL -->
			<div class="left">
				{#if $currentSubmission}
					<UserInfo
						user={$currentSubmission.project.user}
						repoUrl={$currentSubmission.project.repoUrl ?? $currentSubmission.repoUrl}
						playableUrl={$currentSubmission.project.playableUrl ?? $currentSubmission.playableUrl}
						readmeUrl={$currentSubmission.project.readmeUrl}
						hackatimeHours={$currentSubmission.hackatimeHours}
						hackatimeProjects={$currentSubmission.project.nowHackatimeProjects ?? []}
						onHoursChange={handleHoursChange}
					/>

					<hr class="section-divider" />

					<NotesSection
						title="Notes — Project"
						targetType="project"
						targetId={$currentSubmission.project.projectId}
						bind:content={$projectNote}
					/>

					<hr class="section-divider" />

					<NotesSection
						title="Notes — User"
						targetType="user"
						targetId={$currentSubmission.project.user.userId}
						bind:content={$userNote}
					/>

					<hr class="section-divider" />

					<ReviewHistory timeline={$currentSubmission.timeline} />
				{:else if $submissionLoading}
					<div class="panel-loading">Loading...</div>
				{/if}
			</div>

			<!-- CENTER PANEL -->
			<div class="center">
				{#if $currentSubmission}
					<DemoIframe
						demoUrl={$currentSubmission.playableUrl ?? $currentSubmission.project.playableUrl}
					/>

					<ReadmeDrawer readmeHtml={$readmeHtml} />

					<ActionBar
						submissionId={$currentSubmission.submissionId}
						hackatimeHours={$currentSubmission.hackatimeHours}
						{editedHours}
						onReviewComplete={handleReviewComplete}
					/>
				{:else if $submissionLoading}
					<div class="panel-loading">Loading submission...</div>
				{/if}
			</div>

			<!-- RIGHT PANEL -->
			<div class="right">
				<GitHubPanel
					repo={$githubRepo}
					loading={$githubLoading}
					repoUrl={$currentSubmission?.project.repoUrl ?? $currentSubmission?.repoUrl ?? null}
				/>

				{#if $currentSubmission}
					<ReviewChecklist
						submissionId={$currentSubmission.submissionId}
						bind:checkedItems={$checkedItems}
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
