<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { goto, beforeNavigate } from '$app/navigation';
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
	import ProjectHourBreakdown from '../components/ProjectHourBreakdown.svelte';
	import VerdictPanel from '../components/VerdictPanel.svelte';
	import GitHubPanel from '../components/GitHubPanel.svelte';
	import ReviewChecklist from '../components/ReviewChecklist.svelte';
	import ManifestLookup from '../components/ManifestLookup.svelte';
	import ClaimConflictModal from '../components/ClaimConflictModal.svelte';
	import { createClaimManager } from '../claimManager';
	import { api, type components } from '$lib/api';
	import confetti from 'canvas-confetti';

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

	// Projects this reviewer has already voted on (any submission). Used to
	// skip them in next/prev so reviewers don't re-encounter resubmissions or
	// projects they've finalized in the same session.
	let seenProjectIds = $state<Set<number>>(new Set());

	// Projects this reviewer Skipped this tab session. Persisted in
	// sessionStorage because this page remounts on each navigation between
	// projects — without persistence, hitting Skip would bounce between two
	// projects since each lands on the longest-wait candidate that excludes
	// only the current one.
	const SKIP_STORAGE_KEY = 'horizons-review-skipped-projects';
	let sessionSkippedProjectIds = $state<Set<number>>(new Set());

	function loadSkippedFromStorage(): Set<number> {
		try {
			const raw = sessionStorage.getItem(SKIP_STORAGE_KEY);
			if (!raw) return new Set();
			const parsed = JSON.parse(raw);
			if (!Array.isArray(parsed)) return new Set();
			return new Set(parsed.filter((n): n is number => typeof n === 'number'));
		} catch {
			return new Set();
		}
	}

	function persistSkipped(set: Set<number>): void {
		try {
			sessionStorage.setItem(SKIP_STORAGE_KEY, JSON.stringify([...set]));
		} catch {
			// sessionStorage can throw (private mode, quota); the in-memory set
			// still works for the rest of the page lifecycle.
		}
	}

	// Next jumps to the longest-waiting project this reviewer hasn't already
	// voted on, isn't actively claimed by someone else, and hasn't been
	// Skipped this session — so reviewers triage the most-stale submissions
	// instead of getting whichever one happens to be next in queue order.
	// Previous deliberately allows revisiting a reviewed project (e.g. to
	// double-check or amend a verdict). Stale claims fall through — the next
	// reviewer takes them over.
	function isActivelyClaimedByOther(item: QueueItem): boolean {
		return !!(item.claim && !item.claim.isMine && !item.claim.isStale);
	}

	// Backend returns queue ordered by submission.createdAt asc, so the first
	// eligible match in the array is the project that's been waiting longest.
	function findLongestWaitingIndex(): number {
		for (let i = 0; i < queue.length; i++) {
			const item = queue[i];
			if (item.projectId === projectId) continue;
			if (seenProjectIds.has(item.projectId)) continue;
			if (sessionSkippedProjectIds.has(item.projectId)) continue;
			if (isActivelyClaimedByOther(item)) continue;
			return i;
		}
		return -1;
	}

	let hasNextProject = $derived(findLongestWaitingIndex() !== -1);

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
	// Real per-Hackatime-project hours (live-fetched). Null until loaded; the
	// HoursBreakdown component falls back to an even split while we wait.
	let hackatimeProjectHours = $state<Record<string, number> | null>(null);
	// AI vs non-AI hour breakdown (aggregate + per-project), live-fetched.
	type HourBreakdown = {
		totalHours: number;
		aiHours: number;
		nonAiHours: number;
		perProject: { name: string; totalHours: number; aiHours: number; nonAiHours: number }[];
	};
	let hourBreakdown = $state<HourBreakdown | null>(null);
	let hourBreakdownLoading = $state(false);

	// Claim/lock state — keeps two reviewers from working the same submission.
	const claimManager = createClaimManager();
	let conflictClaim = $state<ClaimInfo | null>(null);
	let takingOver = $state(false);
	// Set when the reviewer chose to view a claimed submission without taking
	// over. We don't hold a claim, can't submit a verdict, and notes/checklist
	// can't be edited — but the project is fully visible so reviewers can take
	// a pass without disrupting whoever is actively reviewing.
	let readOnlyMode = $state(false);
	let readOnlyClaim = $state<ClaimInfo | null>(null);

	// Center tabs
	const centerTabs: Tab[] = [
		{ id: 'readme', label: 'Readme' },
		{ id: 'demo', label: 'Demo' },
		{ id: 'card', label: 'Project Card' },
		{ id: 'verdict', label: 'Verdict' },
	];
	let activeTab = $state('readme');

	// Fraud projects (silentReject=true OR Joe-flagged with joeFraudPassed=false)
	// render a dedicated full-page state instead of the review UI — no point
	// loading the whole reviewer surface for a project we already know is fraud.
	// Confetti + audio play once per submission so the verdict is unmissable.
	let isFraudProject = $derived(
		!!currentSubmission &&
			(currentSubmission.silentReject ||
				currentSubmission.project.joeFraudPassed === false),
	);
	let fraudCelebrationFiredFor = $state<number | null>(null);
	let fraudAudio: HTMLAudioElement | null = null;
	// When autoplay is blocked (no recent user gesture, Safari, etc.) the
	// fraud page surfaces a "click to hear" button so the reviewer can still
	// trigger the audio with an explicit click.
	let fraudAudioBlocked = $state(false);

	function playFraudAudio() {
		if (!fraudAudio) fraudAudio = new Audio(`${base}/wholikestofraudy.mp3`);
		void fraudAudio.play().then(
			() => { fraudAudioBlocked = false; },
			() => { fraudAudioBlocked = true; },
		);
	}

	$effect(() => {
		if (!currentSubmission) return;
		if (!isFraudProject) return;
		if (fraudCelebrationFiredFor === currentSubmission.submissionId) return;
		fraudCelebrationFiredFor = currentSubmission.submissionId;

		fraudAudio = new Audio(`${base}/wholikestofraudy.mp3`);
		// Browsers block autoplay without a recent user gesture. Try anyway —
		// the navigation click usually counts — and on failure surface a
		// "click to hear" button on the fraud page so reviewers can opt in.
		void fraudAudio.play().then(
			() => { fraudAudioBlocked = false; },
			() => { fraudAudioBlocked = true; },
		);

		const burst = () => {
			confetti({ particleCount: 120, spread: 70, origin: { x: 0.2, y: 0.5 } });
			confetti({ particleCount: 120, spread: 70, origin: { x: 0.8, y: 0.5 } });
		};
		burst();
		setTimeout(burst, 350);
		setTimeout(burst, 700);
	});

	onDestroy(() => {
		if (fraudAudio) {
			fraudAudio.pause();
			fraudAudio = null;
		}
	});

	onMount(async () => {
		sessionSkippedProjectIds = loadSkippedFromStorage();

		// Load queue + past reviews + fraud-rejected in parallel. Past reviews
		// powers two things: (1) the seenProjectIds set that drives next/prev
		// skip-already-reviewed, and (2) the deep-link fallback when a project
		// isn't in the pending queue. Fraud-rejected is a separate fallback
		// because silentReject submissions have no human reviewer and so don't
		// appear in past-reviews — without it, opening a fraud-killed project
		// from the gallery shows "not in the review system".
		const [queueRes, pastRes, fraudRes] = await Promise.all([
			api.GET('/api/reviewer/queue'),
			api.GET('/api/reviewer/past-reviews'),
			api.GET('/api/reviewer/fraud-rejected'),
		]);
		queue = queueRes.data ?? [];

		if (pastRes.data) {
			const myId = String(pastRes.data.currentReviewerId);
			seenProjectIds = new Set(
				pastRes.data.reviews
					.filter((r) => r.reviewerId === myId)
					.map((r) => r.projectId),
			);
		}

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
		const past = pastRes.data?.reviews.find((r) => r.projectId === projectId);
		if (past) {
			await loadSubmissionDetail(past.submissionId);
			return;
		}

		// Fraud-killed submissions have no reviewer, so past-reviews misses them.
		// Pick the newest fraud-rejected submission for this project.
		const fraud = fraudRes.data?.find((f) => f.projectId === projectId);
		if (fraud) {
			await loadSubmissionDetail(fraud.submissionId);
			return;
		}

		// Render the "not found" view rather than silently bouncing to the
		// gallery — a quiet redirect looks like a bug to reviewers.
		submissionLoading = false;
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
			if (ok) {
				conflictClaim = null;
				// Successful takeover means the previous holder lost their claim;
				// we own it now and edits are safe again.
				readOnlyMode = false;
				readOnlyClaim = null;
			}
		} finally {
			takingOver = false;
		}
	}

	function viewReadOnly() {
		// Stash who's actively reviewing for the banner, then close the modal.
		// We deliberately don't claim or heartbeat — let the active reviewer
		// keep their session intact while we read along.
		readOnlyClaim = conflictClaim;
		readOnlyMode = true;
		conflictClaim = null;
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

	// Skip the leave-prompt for navigations the page itself triggers after a
	// completed verdict (handleReviewComplete) — those are deliberate.
	let skipLeavePrompt = $state(false);

	// Always confirm before navigating off the review page. Reviewers can have
	// unsaved drafts (notes, verdict text, hours edits) that aren't tracked
	// individually, so we prompt unconditionally rather than guess.
	const LEAVE_PROMPT_MESSAGE = 'Are you sure you want to leave this page? Any unsaved changes will be lost.';

	beforeNavigate(({ cancel, to }) => {
		if (skipLeavePrompt) return;
		// Same-page param-only changes (e.g. ?submissionId=…) shouldn't prompt.
		if (to && to.url.pathname === $page.url.pathname) return;
		if (!confirm(LEAVE_PROMPT_MESSAGE)) cancel();
	});

	$effect(() => {
		const handler = (event: BeforeUnloadEvent) => {
			if (skipLeavePrompt) return;
			event.preventDefault();
			// Modern browsers ignore the message text and show their own dialog,
			// but returnValue must be set for the prompt to trigger.
			event.returnValue = LEAVE_PROMPT_MESSAGE;
			return LEAVE_PROMPT_MESSAGE;
		};
		window.addEventListener('beforeunload', handler);
		return () => window.removeEventListener('beforeunload', handler);
	});

	async function loadSubmissionDetail(submissionId: number) {
		submissionLoading = true;
		currentSubmission = null;
		githubRepo = null;
		readmeMarkdown = '';
		manifestLookup = null;
		hackatimeProjectHours = null;
		hourBreakdown = null;
		// Read-only mode is per-submission — switching submissions resets it
		// (attachClaim below decides whether to surface a fresh conflict).
		readOnlyMode = false;
		readOnlyClaim = null;

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
			promises.push(loadHackatimeBreakdown(data.project.projectId));
			promises.push(loadHourBreakdown(data.project.projectId));

			await Promise.all(promises);
		} catch (error) {
			console.error('Failed to load submission detail:', error);
		} finally {
			submissionLoading = false;
		}
	}

	async function loadHackatimeBreakdown(projectId: number) {
		try {
			const { data } = await api.GET(
				'/api/reviewer/projects/{id}/hackatime-breakdown',
				{ params: { path: { id: projectId } } },
			);
			if (!data) return;
			const map: Record<string, number> = {};
			for (const entry of data) map[entry.name] = entry.hours;
			hackatimeProjectHours = map;
		} catch {
			hackatimeProjectHours = null;
		}
	}

	async function loadHourBreakdown(projectId: number) {
		hourBreakdownLoading = true;
		try {
			const { data } = await api.GET(
				'/api/reviewer/projects/{id}/hour-breakdown',
				{ params: { path: { id: projectId } } },
			);
			hourBreakdown = (data as HourBreakdown | undefined) ?? null;
		} catch {
			hourBreakdown = null;
		} finally {
			hourBreakdownLoading = false;
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
		// Mark the current project as skipped before picking the next one;
		// otherwise the next pick would be the longest-waiter excluding only
		// the current project, and a second Skip would bounce right back to it.
		if (currentSubmission) {
			const next = new Set(sessionSkippedProjectIds);
			next.add(currentSubmission.project.projectId);
			sessionSkippedProjectIds = next;
			persistSkipped(next);
		}
		const idx = findLongestWaitingIndex();
		if (idx !== -1) await navigateTo(idx);
	}

	async function navigatePrev() {
		if (currentIndex > 0) {
			await navigateTo(currentIndex - 1);
		}
	}

	function handleHoursChange(hours: number) {
		editedHours = hours;
	}

	function handleReviewComplete(approved: boolean) {
		// Backend auto-releases on verdict; tell the local manager to stop
		// heartbeating so we don't ping a no-longer-ours claim.
		claimManager.destroy();
		// Verdict is saved — don't prompt on subsequent navigations from this view.
		skipLeavePrompt = true;
		// Mark this project seen so navigateNext skips past it (and any future
		// resubmission of the same project) for the rest of the session.
		if (currentSubmission) {
			seenProjectIds = new Set([
				...seenProjectIds,
				currentSubmission.project.projectId,
			]);
			// Reflect the new verdict locally so TopBar shows "Already Approved/Rejected"
			// without a refetch.
			currentSubmission = { ...currentSubmission, reviewPassed: approved };
		}
		// Surface the project card after a verdict so the reviewer sees what they
		// just decided on rather than the now-stale verdict form.
		activeTab = 'card';
	}
</script>

<svelte:head>
	<link
		href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
		rel="stylesheet"
	/>
	<title>Horizons — Review Project</title>
</svelte:head>

<div class="font-[Inter,sans-serif] bg-rv-bg text-rv-text h-screen flex flex-col overflow-hidden">
	{#if !submissionLoading && !currentSubmission}
		<div class="flex flex-col items-center justify-center h-screen gap-3 text-rv-dim bg-rv-bg px-6">
			<p class="text-rv-text text-[15px] m-0">Project #{projectId} isn't in the review system.</p>
			<p class="text-[12px] text-rv-dim max-w-105 text-center m-0">
				It has no pending submission, no past review, and you may have followed a stale link or mistyped the URL.
			</p>
			<button class="mt-3 bg-rv-surface2 border border-rv-border text-rv-text px-5 py-2 rounded-md cursor-pointer font-inherit hover:border-rv-accent" onclick={goBack}>← Back to Gallery</button>
		</div>
	{:else if isFraudProject}
		<div class="flex flex-col items-center justify-center h-screen gap-4 text-rv-dim bg-rv-bg px-6">
			<div
				class="text-7xl font-extrabold text-center"
				style="background-image: linear-gradient(90deg, #ff4d4d, #ffae00, #ffe600, #4dff88, #4dd0ff, #b14dff, #ff4dd0); -webkit-background-clip: text; background-clip: text; color: transparent;"
			>
				This project is fraud :D
			</div>
			<p class="text-[12px] text-rv-dim max-w-105 text-center m-0">
				Fraud has flagged Project #{projectId} — no review needed. The user sees this submission as still pending so they get no feedback.
			</p>
			{#if fraudAudioBlocked}
				<button
					class="mt-1 bg-rv-tag-bg border border-rv-accent text-rv-accent px-5 py-2 rounded-md cursor-pointer font-inherit font-semibold hover:bg-rv-accent hover:text-rv-bg"
					onclick={playFraudAudio}
				>
					🔊 Click to hear the verdict
				</button>
			{/if}
			<button class="mt-3 bg-rv-surface2 border border-rv-border text-rv-text px-5 py-2 rounded-md cursor-pointer font-inherit hover:border-rv-accent" onclick={goBack}>← Back to Gallery</button>
		</div>
	{:else}
		{#if readOnlyMode}
			<div class="flex items-center justify-between gap-3 px-5 py-2 bg-yellow-500/15 border-b border-yellow-500/40 text-yellow-700 dark:text-yellow-400 text-[12px] shrink-0">
				<span>
					<strong class="font-semibold">Read-only:</strong>
					{#if readOnlyClaim}
						{readOnlyClaim.firstName} {readOnlyClaim.lastName} is reviewing this project — you can look but can't edit notes, checklist, or submit a verdict.
					{:else}
						You can look but can't edit notes, checklist, or submit a verdict.
					{/if}
				</span>
				{#if readOnlyClaim}
					<button
						class="px-3 py-1 rounded-md text-[11px] font-semibold border border-yellow-500/60 bg-yellow-500/20 hover:bg-yellow-500/30 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
						onclick={() => { conflictClaim = readOnlyClaim; }}
					>
						Take Over
					</button>
				{/if}
			</div>
		{/if}
		<TopBar
			{currentIndex}
			totalCount={queueLength}
			onNext={navigateNext}
			onPrev={navigatePrev}
			onBackToGallery={goBack}
			reviewPassed={currentSubmission?.reviewPassed ?? null}
			nextDisabled={!hasNextProject}
		/>

		<div class="grid grid-cols-[300px_1fr_320px] flex-1 overflow-hidden">
			<!-- LEFT PANEL -->
			<div class="bg-rv-surface border-r border-rv-border overflow-y-auto">
				<UserInfo
					user={currentSubmission?.project.user}
					repoUrl={currentSubmission?.project.repoUrl ?? currentSubmission?.repoUrl ?? null}
					playableUrl={currentSubmission?.project.playableUrl ?? currentSubmission?.playableUrl ?? null}
					readmeUrl={currentSubmission?.project.readmeUrl ?? null}
					hackatimeHours={currentSubmission?.hackatimeHours ?? null}
					hackatimeProjects={currentSubmission?.project.nowHackatimeProjects ?? []}
					hackatimeProjectHours={hackatimeProjectHours}
					joeFraudPassed={currentSubmission?.project.joeFraudPassed ?? null}
					joeTrustScore={currentSubmission?.project.joeTrustScore ?? null}
					onHoursChange={handleHoursChange}
					loading={submissionLoading}
				/>

				<ProjectHourBreakdown
					totalHours={hourBreakdown?.totalHours ?? null}
					aiHours={hourBreakdown?.aiHours ?? null}
					nonAiHours={hourBreakdown?.nonAiHours ?? null}
					perProject={hourBreakdown?.perProject ?? []}
					loading={hourBreakdownLoading || submissionLoading}
				/>

				<NotesSection
					title="Notes — Project"
					targetType="project"
					targetId={currentSubmission?.project.projectId ?? 0}
					bind:content={projectNote}
					loading={submissionLoading}
					readOnly={readOnlyMode}
				/>

				<hr class="border-none border-t border-rv-border m-0" />

				<NotesSection
					title="Notes — User"
					targetType="user"
					targetId={currentSubmission?.project.user.userId ?? 0}
					bind:content={userNote}
					loading={submissionLoading}
					readOnly={readOnlyMode}
				/>

				<hr class="border-none border-t border-rv-border m-0" />

				<ManifestLookup lookup={manifestLookup} loading={manifestLoading || submissionLoading} />

				<hr class="border-none border-t border-rv-border m-0" />

				{#if currentSubmission && currentSubmission.submissions && currentSubmission.submissions.length > 1}
					<SubmissionsList
						submissions={currentSubmission.submissions}
						activeSubmissionId={currentSubmission.submissionId}
						onSelect={selectSubmission}
					/>
					<hr class="border-none border-t border-rv-border m-0" />
				{/if}

				<ReviewHistory timeline={currentSubmission?.timeline ?? []} loading={submissionLoading} />
			</div>

			<!-- CENTER PANEL -->
			<div class="flex flex-col overflow-hidden">
				<TabBar tabs={centerTabs} {activeTab} onTabChange={(id) => { activeTab = id; }} />

				<div class="flex-1 overflow-hidden relative">
					<div class="absolute inset-0" class:hidden={activeTab !== 'readme'}>
						<ReadmePanel markdown={readmeMarkdown} loading={submissionLoading} />
					</div>
					{#if currentSubmission}
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
								isResubmission={(currentSubmission.submissions ?? []).some(
									(s) => s.submissionId !== currentSubmission!.submissionId
										&& new Date(s.createdAt) < new Date(currentSubmission!.createdAt),
								)}
								hasPriorYswsSubmission={(manifestLookup?.manifest?.submissions ?? []).some(
									(s) => (s.yswsName ?? '').toLowerCase() !== 'horizons',
								)}
								priorYswsHoursShipped={(manifestLookup?.manifest?.submissions ?? [])
									.filter((s) => (s.yswsName ?? '').toLowerCase() !== 'horizons')
									.reduce((sum, s) => sum + (s.hoursShipped ?? 0), 0)}
								priorReshipApprovedHours={(() => {
									// Most recent OTHER approved submission for this project.
									// Used to surface the implied delta on a reship: the reviewer
									// is granting (current approvedHours - this) new hours.
									const submissions = currentSubmission.submissions ?? [];
									const currentCreatedAt = new Date(currentSubmission.createdAt).getTime();
									const priorApproved = submissions
										.filter((s) =>
											s.submissionId !== currentSubmission!.submissionId
											&& s.approvalStatus === 'approved'
											&& s.approvedHours != null
											&& new Date(s.createdAt).getTime() < currentCreatedAt,
										)
										.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
									return priorApproved[0]?.approvedHours ?? null;
								})()}
								readOnly={readOnlyMode}
								onReviewComplete={handleReviewComplete}
							/>
						</div>
					{/if}
				</div>
			</div>

			<!-- RIGHT PANEL -->
			<div class="bg-rv-surface border-l border-rv-border flex flex-col overflow-hidden">
				<GitHubPanel
					repo={githubRepo}
					loading={githubLoading || submissionLoading}
					error={githubError}
					repoUrl={currentSubmission?.project.repoUrl ?? currentSubmission?.repoUrl ?? null}
				/>

				<ReviewChecklist
					submissionId={currentSubmission?.submissionId ?? 0}
					bind:checkedItems
					loading={submissionLoading}
					readOnly={readOnlyMode}
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
			onReadOnly={viewReadOnly}
		/>
	{/if}

</div>
