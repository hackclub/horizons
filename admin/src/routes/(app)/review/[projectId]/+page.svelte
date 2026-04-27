<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { page } from '$app/stores';

	import TopBar from '../components/TopBar.svelte';
	import UserInfo from '../components/UserInfo.svelte';
	import NotesSection from '../components/NotesSection.svelte';
	import ReviewHistory from '../components/ReviewHistory.svelte';
	import SubmissionsList from '../components/SubmissionsList.svelte';
	import DemoIframe from '../components/DemoIframe.svelte';
	import TabBar, { type Tab } from '../components/TabBar.svelte';
	import ReadmePanel from '../components/ReadmePanel.svelte';
	import ProjectCardPanel from '../components/ProjectCardPanel.svelte';
	import VerdictPanel from '../components/VerdictPanel.svelte';
	import GitHubPanel from '../components/GitHubPanel.svelte';
	import ReviewChecklist from '../components/ReviewChecklist.svelte';
	import ManifestLookup from '../components/ManifestLookup.svelte';
	import ClaimConflictModal from '../components/ClaimConflictModal.svelte';
	import { createClaimManager } from '../claimManager';
	import { api, type components } from '$lib/api';

	type QueueItem = components['schemas']['QueueItemResponse'];
	type SubmissionDetail = components['schemas']['SubmissionDetailResponse'];
	type GitHubRepo = components['schemas']['GitHubRepoResponse'];
	type ManifestLookupResponse = components['schemas']['ManifestLookupResponse'];
	type ClaimInfo = components['schemas']['ClaimInfoResponse'];

	let projectId = $derived(Number($page.params.projectId));

	// Queue state (for next/prev)
	let queue = $state<QueueItem[]>([]);
	let currentIndex = $state(0);
	let queueLength = $derived(queue.length);

	// Current submission detail + loading
	let currentSubmission = $state<SubmissionDetail | null>(null);
	let submissionLoading = $state(true);

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
	let manifestLookup = $state<ManifestLookupResponse | null>(null);
	let manifestLoading = $state(false);

	// Claim/lock state — keeps two reviewers from working the same submission.
	const claimManager = createClaimManager();
	let conflictClaim = $state<ClaimInfo | null>(null);
	let takingOver = $state(false);

	// Center tabs
	const centerTabs: Tab[] = [
		{ id: 'readme', label: 'Readme' },
		{ id: 'demo', label: 'Demo' },
		{ id: 'card', label: 'Project Card' },
		{ id: 'verdict', label: 'Verdict' },
	];
	let activeTab = $state('readme');

	onMount(async () => {
		// Load queue for next/prev navigation
		const { data: queueData } = await api.GET('/api/reviewer/queue');
		queue = queueData ?? [];

		// Honor ?submissionId=X so reviewers can deep-link to a specific
		// submission (e.g. an older resubmission) rather than always landing
		// on the latest.
		const queryParam = $page.url.searchParams.get('submissionId');
		if (queryParam) {
			const qId = Number(queryParam);
			if (!Number.isNaN(qId)) {
				const item = queue.find((q) => q.submissionId === qId);
				if (item) currentIndex = queue.indexOf(item);
				await loadSubmissionDetail(qId);
				return;
			}
		}

		const item = queue.find(q => q.projectId === projectId);
		if (item) {
			currentIndex = queue.indexOf(item);
			await loadSubmissionDetail(item.submissionId);
			return;
		}

		// Not in pending queue — fall back to past reviews so already-reviewed
		// projects remain viewable from the gallery.
		const { data: pastData } = await api.GET('/api/reviewer/past-reviews');
		const past = pastData?.reviews.find((r) => r.projectId === projectId);
		if (!past) {
			// Render the "not found" view rather than silently bouncing to the
			// gallery — a quiet redirect looks like a bug to reviewers.
			submissionLoading = false;
			return;
		}
		await loadSubmissionDetail(past.submissionId);
	});

	async function selectSubmission(submissionId: number) {
		if (submissionId === currentSubmission?.submissionId) return;
		// Keep the URL in sync without triggering a full navigation so in-memory
		// state (notes, checklist) reloads cleanly via loadSubmissionDetail.
		const url = new URL($page.url);
		url.searchParams.set('submissionId', String(submissionId));
		history.replaceState(history.state, '', url);
		await loadSubmissionDetail(submissionId);
	}

	async function attachClaim(submissionId: number) {
		conflictClaim = null;
		await claimManager.attach(submissionId, {
			onConflict: (claim) => {
				conflictClaim = claim;
			},
		});
	}

	async function takeOverClaim() {
		if (!currentSubmission) return;
		takingOver = true;
		try {
			const ok = await claimManager.takeover(currentSubmission.submissionId);
			if (ok) conflictClaim = null;
		} finally {
			takingOver = false;
		}
	}

	function dismissClaimConflict() {
		conflictClaim = null;
		goto(`${base}/review`);
	}

	onDestroy(() => {
		// Best-effort release on unmount. Tab-close won't await this; the backend's
		// stale timeout handles that path.
		void claimManager.release();
		claimManager.destroy();
	});

	async function loadSubmissionDetail(submissionId: number) {
		submissionLoading = true;
		currentSubmission = null;
		githubRepo = null;
		readmeMarkdown = '';
		manifestLookup = null;

		try {
			const { data, error } = await api.GET('/api/reviewer/submissions/{id}', {
				params: { path: { id: submissionId } },
			});
			if (error || !data) throw new Error(`Failed to fetch submission ${submissionId}`);
			currentSubmission = data;

			// Try to claim the submission. If another reviewer holds an active
			// claim, attachClaim sets conflictClaim and the modal handles it.
			void attachClaim(submissionId);

			const repoUrl = data.project.repoUrl || data.repoUrl;
			const promises: Promise<void>[] = [];

			if (repoUrl) {
				promises.push(loadGitHubData(repoUrl));
				promises.push(loadReadme(repoUrl));
			}

			promises.push(loadNotes(data.project.projectId, data.project.user.userId));
			promises.push(loadChecklist(submissionId));
			promises.push(loadManifestLookup(data.project.projectId));

			await Promise.all(promises);
		} catch (error) {
			console.error('Failed to load submission detail:', error);
		} finally {
			submissionLoading = false;
		}
	}

	async function loadManifestLookup(projectId: number) {
		manifestLoading = true;
		try {
			const { data } = await api.GET('/api/reviewer/projects/{id}/manifest-lookup', {
				params: { path: { id: projectId } },
			});
			manifestLookup = data ?? null;
		} catch {
			manifestLookup = null;
		} finally {
			manifestLoading = false;
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
		} catch {
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

	// Navigation
	function goBack() {
		goto(`${base}/review`);
	}

	async function navigateTo(index: number) {
		if (index < 0 || index >= queue.length) return;
		currentIndex = index;
		goto(`${base}/review/${queue[index].projectId}`);
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
		// Backend auto-releases on verdict; tell the local manager to stop
		// heartbeating so we don't ping a no-longer-ours claim.
		claimManager.destroy();
		if (currentIndex < queueLength - 1) {
			navigateNext();
		} else {
			goBack();
		}
	}
</script>

<svelte:head>
	<link
		href="https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Inter:wght@400;500;600;700&display=swap"
		rel="stylesheet"
	/>
	<title>Horizons — Review Project</title>
</svelte:head>

<div class="font-[Inter,sans-serif] bg-rv-bg text-rv-text h-screen flex flex-col overflow-hidden">
	{#if submissionLoading}
		<div class="flex flex-col items-center justify-center h-screen gap-2 text-rv-dim bg-rv-bg">
			<p>Loading submission...</p>
		</div>
	{:else if !currentSubmission}
		<div class="flex flex-col items-center justify-center h-screen gap-3 text-rv-dim bg-rv-bg px-6">
			<p class="text-rv-text text-[15px] m-0">Project #{projectId} isn't in the review system.</p>
			<p class="text-[12px] text-rv-dim max-w-105 text-center m-0">
				It has no pending submission, no past review, and you may have followed a stale link or mistyped the URL.
			</p>
			<button class="mt-3 bg-rv-surface2 border border-rv-border text-rv-text px-5 py-2 rounded-md cursor-pointer font-inherit hover:border-rv-accent" onclick={goBack}>← Back to Gallery</button>
		</div>
	{:else}
		<TopBar
			{currentIndex}
			totalCount={queueLength}
			onNext={navigateNext}
			onPrev={navigatePrev}
			onBackToGallery={goBack}
			reviewPassed={currentSubmission.reviewPassed}
		/>

		<div class="grid grid-cols-[300px_1fr_320px] flex-1 overflow-hidden">
			<!-- LEFT PANEL -->
			<div class="bg-rv-surface border-r border-rv-border overflow-y-auto">
				<UserInfo
					user={currentSubmission.project.user}
					repoUrl={currentSubmission.project.repoUrl ?? currentSubmission.repoUrl}
					playableUrl={currentSubmission.project.playableUrl ?? currentSubmission.playableUrl}
					readmeUrl={currentSubmission.project.readmeUrl}
					hackatimeHours={currentSubmission.hackatimeHours}
					hackatimeProjects={currentSubmission.project.nowHackatimeProjects ?? []}
					joeFraudPassed={currentSubmission.project.joeFraudPassed ?? null}
					joeTrustScore={currentSubmission.project.joeTrustScore ?? null}
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

				<ManifestLookup lookup={manifestLookup} loading={manifestLoading} />

				<hr class="border-none border-t border-rv-border m-0" />

				{#if currentSubmission.submissions && currentSubmission.submissions.length > 1}
					<SubmissionsList
						submissions={currentSubmission.submissions}
						activeSubmissionId={currentSubmission.submissionId}
						onSelect={selectSubmission}
					/>
					<hr class="border-none border-t border-rv-border m-0" />
				{/if}

				<ReviewHistory timeline={currentSubmission.timeline} />
			</div>

			<!-- CENTER PANEL -->
			<div class="flex flex-col overflow-hidden">
				<TabBar tabs={centerTabs} {activeTab} onTabChange={(id) => { activeTab = id; }} />

				<div class="flex-1 overflow-hidden relative">
					<div class="absolute inset-0" class:hidden={activeTab !== 'readme'}>
						<ReadmePanel markdown={readmeMarkdown} />
					</div>
					<div class="absolute inset-0 flex flex-col" class:hidden={activeTab !== 'demo'}>
						<DemoIframe
							demoUrl={currentSubmission.playableUrl ?? currentSubmission.project.playableUrl}
						/>
					</div>
					<div class="absolute inset-0" class:hidden={activeTab !== 'card'}>
						<ProjectCardPanel
							projectTitle={currentSubmission.project.projectTitle}
							projectDescription={currentSubmission.project.description}
							screenshotUrl={currentSubmission.screenshotUrl}
							projectType={currentSubmission.project.projectType}
							demoUrl={currentSubmission.playableUrl ?? currentSubmission.project.playableUrl}
							codeUrl={currentSubmission.repoUrl ?? currentSubmission.project.repoUrl}
							readmeUrl={currentSubmission.project.readmeUrl}
						/>
					</div>
					<div class="absolute inset-0" class:hidden={activeTab !== 'verdict'}>
						<VerdictPanel
							submissionId={currentSubmission.submissionId}
							hackatimeHours={currentSubmission.hackatimeHours}
							{editedHours}
							joeFraudPassed={currentSubmission.project.joeFraudPassed ?? null}
							reviewPassed={currentSubmission.reviewPassed}
							priorApprovedHours={currentSubmission.approvedHours}
							priorReviewerAnalysis={currentSubmission.reviewerAnalysis}
							priorUserFeedback={currentSubmission.userFeedback}
							onReviewComplete={handleReviewComplete}
						/>
					</div>
				</div>
			</div>

			<!-- RIGHT PANEL -->
			<div class="bg-rv-surface border-l border-rv-border flex flex-col overflow-hidden">
				<GitHubPanel
					repo={githubRepo}
					loading={githubLoading}
					error={githubError}
					repoUrl={currentSubmission.project.repoUrl ?? currentSubmission.repoUrl ?? null}
				/>

				<ReviewChecklist
					submissionId={currentSubmission.submissionId}
					bind:checkedItems
				/>
			</div>
		</div>
	{/if}

	{#if conflictClaim}
		<ClaimConflictModal
			claim={conflictClaim}
			taking={takingOver}
			onCancel={dismissClaimConflict}
			onTakeover={takeOverClaim}
		/>
	{/if}
</div>
