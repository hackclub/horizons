<script lang="ts">
	import { onMount } from 'svelte';
	import { base } from '$app/paths';
	import { api, type components } from '$lib/api';
	import { timeAgo, waitingFor } from '../utils';
	import { Skeleton } from '$lib/components';
	import { LayoutGrid, List } from 'lucide-svelte';
	type QueueItem = components['schemas']['QueueItemResponse'];
	type PastReview = components['schemas']['PastReviewEntry'];
	type FraudRejected = components['schemas']['FraudRejectedEntry'];
	type EventResponse = components['schemas']['EventResponse'];

	interface Props {
		items: QueueItem[];
		onRefresh: () => void;
		refreshing?: boolean;
		loading?: boolean;
	}

	let { items, onRefresh, refreshing = false, loading = false }: Props = $props();

	const PROJECT_TYPES = [
		'windows_playable',
		'mac_playable',
		'linux_playable',
		'web_playable',
		'cross_platform_playable',
		'hardware',
		'mobile_app',
	];

	// Persist the project-type filter across navigation. Reviewers commonly
	// scope the gallery to one platform (e.g. web_playable) while triaging,
	// click into a project, then return — without persistence the filter
	// resets and they have to re-pick on every round trip.
	const TYPE_FILTER_STORAGE_KEY = 'horizons-review-gallery-type-filter';

	function loadSelectedTypesFromStorage(): Set<string> {
		if (typeof sessionStorage === 'undefined') return new Set();
		try {
			const raw = sessionStorage.getItem(TYPE_FILTER_STORAGE_KEY);
			if (!raw) return new Set();
			const parsed = JSON.parse(raw);
			if (!Array.isArray(parsed)) return new Set();
			return new Set(parsed.filter((s): s is string => typeof s === 'string'));
		} catch {
			return new Set();
		}
	}

	let selectedTypes = $state<Set<string>>(loadSelectedTypesFromStorage());

	$effect(() => {
		if (typeof sessionStorage === 'undefined') return;
		try {
			sessionStorage.setItem(
				TYPE_FILTER_STORAGE_KEY,
				JSON.stringify([...selectedTypes]),
			);
		} catch {
			// sessionStorage can throw (private mode, quota); the in-memory set
			// still works for the rest of the page lifecycle.
		}
	});

	// Persist the event filter for the same reason as type filter — reviewers
	// commonly scope to one event cohort while triaging and shouldn't have to
	// re-pick after every round trip into a project.
	const EVENT_FILTER_STORAGE_KEY = 'horizons-review-gallery-event-filter';

	function loadSelectedEventsFromStorage(): Set<string> {
		if (typeof sessionStorage === 'undefined') return new Set();
		try {
			const raw = sessionStorage.getItem(EVENT_FILTER_STORAGE_KEY);
			if (!raw) return new Set();
			const parsed = JSON.parse(raw);
			if (!Array.isArray(parsed)) return new Set();
			return new Set(parsed.filter((s): s is string => typeof s === 'string'));
		} catch {
			return new Set();
		}
	}

	// Set of event slugs (or the sentinel "__none__" for users without a pinned
	// event) to filter the gallery by.
	let selectedEvents = $state<Set<string>>(loadSelectedEventsFromStorage());

	$effect(() => {
		if (typeof sessionStorage === 'undefined') return;
		try {
			sessionStorage.setItem(
				EVENT_FILTER_STORAGE_KEY,
				JSON.stringify([...selectedEvents]),
			);
		} catch {
			// see TYPE_FILTER_STORAGE_KEY effect for rationale
		}
	});

	// View mode state
	const VIEW_MODE_STORAGE_KEY = 'horizons-review-gallery-view-mode';
	function loadViewModeFromStorage(): 'grid' | 'list' {
		if (typeof sessionStorage === 'undefined') return 'grid';
		try {
			const raw = sessionStorage.getItem(VIEW_MODE_STORAGE_KEY);
			return raw === 'list' ? 'list' : 'grid';
		} catch {
			return 'grid';
		}
	}
	let viewMode = $state<'grid' | 'list'>(loadViewModeFromStorage());

	$effect(() => {
		if (typeof sessionStorage === 'undefined') return;
		try {
			sessionStorage.setItem(VIEW_MODE_STORAGE_KEY, viewMode);
		} catch { }
	});

	let searchQuery = $state('');

	// Persist sort and fraud-filter selections across navigation for the same
	// reason as the type/event filters above — reviewers shouldn't have to
	// re-pick after every round trip into a project.
	type SortOrder = 'longest-wait' | 'shortest-wait' | 'most-hours' | 'least-hours';
	const SORT_ORDERS: readonly SortOrder[] = [
		'longest-wait',
		'shortest-wait',
		'most-hours',
		'least-hours',
	];
	type FraudFilter = 'all' | 'reviewed' | 'unreviewed';
	const FRAUD_FILTERS: readonly FraudFilter[] = ['all', 'reviewed', 'unreviewed'];

	const SORT_ORDER_STORAGE_KEY = 'horizons-review-gallery-sort-order';
	const FRAUD_FILTER_STORAGE_KEY = 'horizons-review-gallery-fraud-filter';

	function loadSortOrderFromStorage(): SortOrder {
		// Default to longest wait so reviewers triage the most-stale submissions first.
		if (typeof sessionStorage === 'undefined') return 'longest-wait';
		try {
			const raw = sessionStorage.getItem(SORT_ORDER_STORAGE_KEY);
			if (raw && (SORT_ORDERS as readonly string[]).includes(raw)) {
				return raw as SortOrder;
			}
		} catch {
			// see TYPE_FILTER_STORAGE_KEY effect for rationale
		}
		return 'longest-wait';
	}

	function loadFraudFilterFromStorage(): FraudFilter {
		if (typeof sessionStorage === 'undefined') return 'all';
		try {
			const raw = sessionStorage.getItem(FRAUD_FILTER_STORAGE_KEY);
			if (raw && (FRAUD_FILTERS as readonly string[]).includes(raw)) {
				return raw as FraudFilter;
			}
		} catch {
			// see TYPE_FILTER_STORAGE_KEY effect for rationale
		}
		return 'all';
	}

	let sortOrder = $state<SortOrder>(loadSortOrderFromStorage());
	let fraudFilter = $state<FraudFilter>(loadFraudFilterFromStorage());

	$effect(() => {
		if (typeof sessionStorage === 'undefined') return;
		try {
			sessionStorage.setItem(SORT_ORDER_STORAGE_KEY, sortOrder);
		} catch {
			// see TYPE_FILTER_STORAGE_KEY effect for rationale
		}
	});

	$effect(() => {
		if (typeof sessionStorage === 'undefined') return;
		try {
			sessionStorage.setItem(FRAUD_FILTER_STORAGE_KEY, fraudFilter);
		} catch {
			// see TYPE_FILTER_STORAGE_KEY effect for rationale
		}
	});

	let pastReviews = $state<PastReview[]>([]);
	let fraudRejected = $state<FraudRejected[]>([]);
	let events = $state<EventResponse[]>([]);
	let currentReviewerId = $state<number | null>(null);
	let pastLoading = $state(true);
	let isAdmin = $state(false);

	onMount(async () => {
		try {
			const [
				{ data: pastData },
				{ data: meData },
				{ data: fraudData },
				{ data: eventsData },
			] = await Promise.all([
				api.GET('/api/reviewer/past-reviews'),
				api.GET('/api/user/auth/me'),
				api.GET('/api/reviewer/fraud-rejected'),
				api.GET('/api/events'),
			]);
			if (pastData) {
				pastReviews = pastData.reviews;
				currentReviewerId = pastData.currentReviewerId;
			}
			if (fraudData) fraudRejected = fraudData;
			if (eventsData) events = eventsData;
			isAdmin = meData?.role === 'admin' || meData?.role === 'superadmin';
		} finally {
			pastLoading = false;
		}
	});

	// "__none__" sentinel matches users without a pinned event so reviewers can
	// triage stragglers separately from cohort-tagged submissions.
	const NO_EVENT_SENTINEL = '__none__';

	function matchesFilters(
		projectTitle: string,
		projectType: string,
		authorName: string,
		authorEventSlug: string | null,
	): boolean {
		const matchesType =
			selectedTypes.size === 0 || selectedTypes.has(projectType);
		const matchesEvent =
			selectedEvents.size === 0 ||
			selectedEvents.has(authorEventSlug ?? NO_EVENT_SENTINEL);
		const q = searchQuery.toLowerCase();
		const matchesSearch =
			q === '' ||
			projectTitle.toLowerCase().includes(q) ||
			authorName.toLowerCase().includes(q);
		return matchesType && matchesEvent && matchesSearch;
	}

	function matchesFraudFilter(joeFraudPassed: boolean | null): boolean {
		if (fraudFilter === 'all') return true;
		if (fraudFilter === 'reviewed') return joeFraudPassed !== null;
		return joeFraudPassed === null;
	}

	function userLabel(u: { displayName: string | null; slackUserId: string | null }): string {
		return u.displayName ?? (u.slackUserId ? `@${u.slackUserId}` : 'Anonymous');
	}

	// Submissions this reviewer has already voted on. Hide them from the
	// pending queue so reviewers don't re-encounter the same submission, but
	// new resubmissions for the same project still appear.
	let myReviewedSubmissionIds = $derived(
		currentReviewerId === null
			? new Set<number>()
			: new Set(
					pastReviews
						.filter((r) => r.reviewerId === String(currentReviewerId))
						.map((r) => r.submissionId),
				),
	);

	// Hide projects another reviewer is actively claiming so reviewers don't
	// fight over claims from the gallery. Stale claims (no recent heartbeat)
	// pass through — the next reviewer can take them over silently.
	function isActivelyClaimedByOther(item: QueueItem): boolean {
		return !!(item.claim && !item.claim.isMine && !item.claim.isStale);
	}

	let filteredItems = $derived(
		items
			.filter(
				(item) =>
					!myReviewedSubmissionIds.has(item.submissionId) &&
					!isActivelyClaimedByOther(item) &&
					matchesFilters(
						item.project.projectTitle,
						item.project.projectType,
						userLabel(item.project.user),
						item.project.user.eventSlug,
					) && matchesFraudFilter(item.project.joeFraudPassed),
			)
			.sort((a, b) => {
				if (sortOrder === 'most-hours' || sortOrder === 'least-hours') {
					// Submissions without recorded hours sink to the bottom regardless of direction
					// so reviewers always see real values first.
					const aH = a.hackatimeHours;
					const bH = b.hackatimeHours;
					if (aH == null && bH == null) return 0;
					if (aH == null) return 1;
					if (bH == null) return -1;
					return sortOrder === 'most-hours' ? bH - aH : aH - bH;
				}
				// createdAt is the submission timestamp, so this sorts by wait time, not project age.
				const aT = new Date(a.createdAt).getTime();
				const bT = new Date(b.createdAt).getTime();
				return sortOrder === 'longest-wait' ? aT - bT : bT - aT;
			}),
	);

	function sortByReviewedAt(a: PastReview, b: PastReview): number {
		const aT = a.reviewedAt ? new Date(a.reviewedAt).getTime() : 0;
		const bT = b.reviewedAt ? new Date(b.reviewedAt).getTime() : 0;
		return bT - aT;
	}

	/**
	 * A project may have multiple finalized submissions (resubmissions). The
	 * gallery shows one card per project — using the latest review — and
	 * surfaces the count so reviewers can tell it's a multi-submission project
	 * without exposing which specific submission is represented.
	 */
	function dedupeByProject(
		reviews: PastReview[],
	): Array<PastReview & { reviewCount: number }> {
		const sorted = reviews.slice().sort(sortByReviewedAt);
		const map = new Map<number, PastReview & { reviewCount: number }>();
		for (const r of sorted) {
			const existing = map.get(r.projectId);
			if (existing) {
				existing.reviewCount += 1;
			} else {
				map.set(r.projectId, { ...r, reviewCount: 1 });
			}
		}
		return [...map.values()];
	}

	let myPastReviews = $derived(
		dedupeByProject(
			pastReviews.filter(
				(r) =>
					currentReviewerId !== null &&
					r.reviewerId === String(currentReviewerId) &&
					matchesFilters(
						r.projectTitle,
						r.projectType,
						userLabel(r.user),
						r.user.eventSlug,
					),
			),
		),
	);

	let allPastReviews = $derived(
		dedupeByProject(
			pastReviews.filter((r) =>
				matchesFilters(
					r.projectTitle,
					r.projectType,
					userLabel(r.user),
					r.user.eventSlug,
				),
			),
		),
	);

	// Fraud-rejected projects are noisy and irrelevant to day-to-day triage —
	// only surface them when the reviewer is actively searching, so the
	// section acts as an opt-in lookup tool rather than queue clutter.
	// Dedupe by projectId so a project with multiple silent-rejected
	// resubmissions only takes one card (latest finalize wins).
	let filteredFraudRejected = $derived.by(() => {
		if (searchQuery.trim() === '') return [] as FraudRejected[];
		const matched = fraudRejected.filter((r) =>
			matchesFilters(
				r.projectTitle,
				r.projectType,
				userLabel(r.user),
				r.user.eventSlug,
			),
		);
		const seen = new Set<number>();
		const out: FraudRejected[] = [];
		for (const r of matched) {
			if (seen.has(r.projectId)) continue;
			seen.add(r.projectId);
			out.push(r);
		}
		return out;
	});

	function toggleType(type: string) {
		const next = new Set(selectedTypes);
		if (next.has(type)) {
			next.delete(type);
		} else {
			next.add(type);
		}
		selectedTypes = next;
	}

	function toggleEvent(slug: string) {
		const next = new Set(selectedEvents);
		if (next.has(slug)) {
			next.delete(slug);
		} else {
			next.add(slug);
		}
		selectedEvents = next;
	}

	function formatTypeName(type: string): string {
		return type
			.replace(/_/g, ' ')
			.replace(/\b\w/g, (char) => char.toUpperCase());
	}

	// Tint the "waiting" pill warmer as the wait grows so stale submissions stand out at a glance.
	function waitingPillClass(dateStr: string): string {
		const hours = (Date.now() - new Date(dateStr).getTime()) / 3_600_000;
		if (hours >= 72) return 'bg-red-500/15 text-red-500 border-red-500/40';
		if (hours >= 24) return 'bg-orange-500/15 text-orange-500 border-orange-500/40';
		return 'bg-rv-tag-bg text-rv-dim border-rv-border';
	}

</script>

<div class="flex flex-col h-screen overflow-hidden">
	<div class="flex items-center justify-between px-6 py-4 bg-rv-surface border-b border-rv-border shrink-0">
		<div class="font-bold text-[18px] text-rv-accent">HORIZONS <span class="text-rv-text font-normal text-[13px] ml-2">Project Review</span></div>
		<div class="flex items-center gap-3">
			{#if loading}
				<Skeleton class="h-4 w-32" />
			{:else}
				<p class="text-[13px] text-rv-dim m-0">{filteredItems.length} of {items.length} projects</p>
			{/if}
			<a
				href="/admin/review/stats"
				class="py-1.5 px-3.5 rounded-md border border-rv-border bg-rv-surface2 text-rv-dim text-[12px] font-inherit no-underline inline-block cursor-pointer transition-all duration-150 hover:border-rv-accent hover:text-rv-text"
			>
				Stats
			</a>
			{#if isAdmin}
				<a
					href="/admin/review/fraud-queue"
					class="py-1.5 px-3.5 rounded-md border border-rv-border bg-rv-surface2 text-rv-dim text-[12px] font-inherit no-underline inline-block cursor-pointer transition-all duration-150 hover:border-rv-accent hover:text-rv-text"
				>
					Fraud Queue
				</a>
				<a
					href="/admin/review/fraud-review"
					class="py-1.5 px-3.5 rounded-md border border-rv-border bg-rv-surface2 text-rv-dim text-[12px] font-inherit no-underline inline-block cursor-pointer transition-all duration-150 hover:border-rv-accent hover:text-rv-text"
				>
					Fraud Review
				</a>
			{/if}
			<button
				class="py-1.5 px-3.5 rounded-md border border-rv-border bg-rv-surface2 text-rv-dim text-[12px] font-inherit cursor-pointer transition-all duration-150 hover:border-rv-accent hover:text-rv-text disabled:opacity-40 disabled:cursor-not-allowed"
				onclick={onRefresh}
				disabled={refreshing}
			>
				{refreshing ? 'Refreshing…' : 'Refresh Queue'}
			</button>
		</div>
	</div>

	<div class="flex flex-col gap-3 px-6 py-4 bg-rv-surface border-b border-rv-border shrink-0">
		<input
			type="text"
			class="w-full py-2.5 px-3.5 bg-rv-bg border border-rv-border rounded-lg text-rv-text text-sm font-inherit outline-none transition-all duration-150 placeholder:text-rv-dim focus:border-rv-accent"
			placeholder="Search by project or author name..."
			bind:value={searchQuery}
		/>

		<div class="flex flex-wrap gap-2 items-center">
			{#each PROJECT_TYPES as type}
				<button
					class="py-1.5 px-3.5 rounded-[20px] border border-rv-border bg-rv-surface2 text-rv-dim text-[12px] font-inherit cursor-pointer transition-all duration-150 hover:border-rv-accent hover:text-rv-text {selectedTypes.has(type) ? 'bg-rv-tag-bg border-rv-accent! text-rv-accent!' : ''}"
					onclick={() => toggleType(type)}
				>
					{formatTypeName(type)}
				</button>
			{/each}

			{#if selectedTypes.size > 0}
				<button class="py-1.5 px-3.5 rounded-[20px] border border-rv-border bg-transparent text-rv-dim text-[12px] font-inherit cursor-pointer underline hover:text-rv-text" onclick={() => (selectedTypes = new Set())}>
					Clear filters
				</button>
			{/if}
		</div>

		{#if events.length > 0}
			<div class="flex flex-wrap gap-2 items-center">
				<span class="text-[11px] text-rv-dim mr-1">Event</span>
				{#each events as event (event.slug)}
					<button
						class="py-1.5 px-3.5 rounded-[20px] border border-rv-border bg-rv-surface2 text-rv-dim text-[12px] font-inherit cursor-pointer transition-all duration-150 hover:border-rv-accent hover:text-rv-text {selectedEvents.has(event.slug) ? 'bg-rv-tag-bg border-rv-accent! text-rv-accent!' : ''}"
						onclick={() => toggleEvent(event.slug)}
					>
						{event.title}
					</button>
				{/each}
				<button
					class="py-1.5 px-3.5 rounded-[20px] border border-rv-border bg-rv-surface2 text-rv-dim text-[12px] font-inherit cursor-pointer transition-all duration-150 hover:border-rv-accent hover:text-rv-text {selectedEvents.has(NO_EVENT_SENTINEL) ? 'bg-rv-tag-bg border-rv-accent! text-rv-accent!' : ''}"
					onclick={() => toggleEvent(NO_EVENT_SENTINEL)}
					title="Submissions from users who haven't picked an event"
				>
					No event
				</button>

				{#if selectedEvents.size > 0}
					<button class="py-1.5 px-3.5 rounded-[20px] border border-rv-border bg-transparent text-rv-dim text-[12px] font-inherit cursor-pointer underline hover:text-rv-text" onclick={() => (selectedEvents = new Set())}>
						Clear event filter
					</button>
				{/if}
			</div>
		{/if}
	</div>

	<div class="overflow-y-auto flex-1">
		<section class="px-6 pt-6 pb-2">
			<div class="flex items-center justify-between mb-3">
				<h2 class="text-[13px] uppercase tracking-wider text-rv-dim font-semibold m-0">
					Pending Queue
					{#if loading}
						<span class="ml-1 inline-block align-middle"><Skeleton class="h-3 w-8 inline-block" /></span>
					{:else}
						<span class="text-rv-text/60 font-normal normal-case ml-1">({filteredItems.length})</span>
					{/if}
				</h2>
				
				<div class="flex items-center bg-rv-surface2 border border-rv-border rounded-lg p-0.5 select-none shrink-0">
					<button
						class="p-1 rounded-md transition-all duration-150 cursor-pointer {viewMode === 'grid' ? 'bg-rv-surface border border-rv-border/30 text-rv-accent' : 'border border-transparent text-rv-dim hover:text-rv-text'}"
						onclick={() => (viewMode = 'grid')}
						title="Grid View"
						aria-label="Grid View"
					>
						<LayoutGrid class="w-4 h-4" />
					</button>
					<button
						class="p-1 rounded-md transition-all duration-150 cursor-pointer {viewMode === 'list' ? 'bg-rv-surface border border-rv-border/30 text-rv-accent' : 'border border-transparent text-rv-dim hover:text-rv-text'}"
						onclick={() => (viewMode = 'list')}
						title="List View"
						aria-label="List View"
					>
						<List class="w-4 h-4" />
					</button>
				</div>
			</div>
			<div class="flex flex-wrap gap-2 items-center mb-3">
				<span class="text-[11px] text-rv-dim">Sort</span>
				<button
					class="py-1.5 px-3.5 rounded-[20px] border text-[12px] font-inherit cursor-pointer transition-all duration-150 {sortOrder === 'longest-wait' ? 'bg-rv-tag-bg border-rv-accent text-rv-accent' : 'border-rv-border bg-rv-surface2 text-rv-dim hover:border-rv-accent hover:text-rv-text'}"
					onclick={() => (sortOrder = 'longest-wait')}
				>
					Longest wait
				</button>
				<button
					class="py-1.5 px-3.5 rounded-[20px] border text-[12px] font-inherit cursor-pointer transition-all duration-150 {sortOrder === 'shortest-wait' ? 'bg-rv-tag-bg border-rv-accent text-rv-accent' : 'border-rv-border bg-rv-surface2 text-rv-dim hover:border-rv-accent hover:text-rv-text'}"
					onclick={() => (sortOrder = 'shortest-wait')}
				>
					Shortest wait
				</button>
				<button
					class="py-1.5 px-3.5 rounded-[20px] border text-[12px] font-inherit cursor-pointer transition-all duration-150 {sortOrder === 'most-hours' ? 'bg-rv-tag-bg border-rv-accent text-rv-accent' : 'border-rv-border bg-rv-surface2 text-rv-dim hover:border-rv-accent hover:text-rv-text'}"
					onclick={() => (sortOrder = 'most-hours')}
				>
					Most hours
				</button>
				<button
					class="py-1.5 px-3.5 rounded-[20px] border text-[12px] font-inherit cursor-pointer transition-all duration-150 {sortOrder === 'least-hours' ? 'bg-rv-tag-bg border-rv-accent text-rv-accent' : 'border-rv-border bg-rv-surface2 text-rv-dim hover:border-rv-accent hover:text-rv-text'}"
					onclick={() => (sortOrder = 'least-hours')}
				>
					Least hours
				</button>

				<span class="text-[11px] text-rv-dim ml-3">Fraud</span>
				<button
					class="py-1.5 px-3.5 rounded-[20px] border text-[12px] font-inherit cursor-pointer transition-all duration-150 {fraudFilter === 'all' ? 'bg-rv-tag-bg border-rv-accent text-rv-accent' : 'border-rv-border bg-rv-surface2 text-rv-dim hover:border-rv-accent hover:text-rv-text'}"
					onclick={() => (fraudFilter = 'all')}
				>
					All
				</button>
				<button
					class="py-1.5 px-3.5 rounded-[20px] border text-[12px] font-inherit cursor-pointer transition-all duration-150 {fraudFilter === 'reviewed' ? 'bg-rv-tag-bg border-rv-accent text-rv-accent' : 'border-rv-border bg-rv-surface2 text-rv-dim hover:border-rv-accent hover:text-rv-text'}"
					onclick={() => (fraudFilter = 'reviewed')}
				>
					Reviewed
				</button>
				<button
					class="py-1.5 px-3.5 rounded-[20px] border text-[12px] font-inherit cursor-pointer transition-all duration-150 {fraudFilter === 'unreviewed' ? 'bg-rv-tag-bg border-rv-accent text-rv-accent' : 'border-rv-border bg-rv-surface2 text-rv-dim hover:border-rv-accent hover:text-rv-text'}"
					onclick={() => (fraudFilter = 'unreviewed')}
				>
					Unreviewed
				</button>

			</div>
			{#if viewMode === 'grid'}
				<div class="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] content-start gap-4">
					{#if loading}
						{#each Array(12) as _}
							<div class="flex flex-col gap-2 p-5 bg-rv-surface border border-rv-border rounded-[10px]">
								<Skeleton class="h-4 w-3/4" />
								<Skeleton class="h-3 w-1/2" />
								<div class="flex items-center gap-1.5 flex-wrap mt-1">
									<Skeleton class="h-5 w-20 rounded-xl" />
									<Skeleton class="h-5 w-12 rounded-xl" />
									<Skeleton class="h-5 w-24 rounded-xl" />
								</div>
							</div>
						{/each}
					{:else}
					{#each filteredItems as item (item.submissionId)}
						{@const activeOtherClaim =
							item.claim && !item.claim.isMine && !item.claim.isStale
								? item.claim
								: null}
						<a
							href="{base}/review/{item.project.projectId}"
							class="flex flex-col gap-1.5 p-5 bg-rv-surface border rounded-[10px] cursor-pointer transition-all duration-150 text-left no-underline font-inherit color-inherit hover:bg-rv-surface2 {activeOtherClaim ? 'border-yellow-500/50 hover:border-yellow-500' : 'border-rv-border hover:border-rv-accent'}"
							title={activeOtherClaim ? `Currently being reviewed by ${activeOtherClaim.firstName} ${activeOtherClaim.lastName}` : undefined}
						>
							<p class="text-[15px] font-semibold text-rv-text m-0">{item.project.projectTitle}</p>
							<p class="text-[13px] text-rv-dim m-0">
								{userLabel(item.project.user)}
							</p>
							<div class="flex items-center gap-1.5 flex-wrap mt-1">
								<span class="inline-block py-0.75 px-2.5 bg-rv-tag-bg text-rv-accent rounded-xl text-[11px]">{formatTypeName(item.project.projectType)}</span>
								{#if item.hackatimeHours != null}
									<span
										class="inline-flex items-center gap-1 py-0.5 px-2 rounded-xl text-[11px] border bg-rv-tag-bg text-rv-dim border-rv-border"
										title="Hackatime hours submitted for this project"
									>
										{item.hackatimeHours.toFixed(1)}h
									</span>
								{/if}
								<span
									class="inline-flex items-center gap-1 py-0.5 px-2 rounded-xl text-[11px] border {waitingPillClass(item.createdAt)}"
									title="Submitted {new Date(item.createdAt).toLocaleString()}"
								>
									<svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
										<circle cx="12" cy="12" r="10" />
										<polyline points="12 6 12 12 16 14" />
									</svg>
									Waiting {waitingFor(item.createdAt)}
								</span>
								{#if activeOtherClaim}
									<span class="inline-flex items-center gap-1 py-0.5 px-2 rounded-xl text-[11px] font-semibold bg-yellow-500/15 text-yellow-600 border border-yellow-500/40">
										<span class="w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse"></span>
										Reviewing: {activeOtherClaim.firstName} {activeOtherClaim.lastName}
									</span>
								{:else if item.claim?.isMine}
									<span class="inline-flex items-center gap-1 py-0.5 px-2 rounded-xl text-[11px] font-semibold bg-rv-tag-bg text-rv-accent border border-rv-accent/40">
										Open in your tab
									</span>
								{/if}
							</div>
						</a>
					{:else}
						<p class="col-span-full text-center text-rv-dim py-6 text-sm">No projects match your filters.</p>
					{/each}
					{/if}
				</div>
			{:else}
				<div class="flex flex-col border border-rv-border rounded-[10px] bg-rv-surface overflow-x-auto">
					<div class="grid grid-cols-[minmax(150px,2fr)_minmax(100px,1.5fr)_minmax(100px,1fr)_minmax(100px,1.2fr)_minmax(100px,1fr)_80px_minmax(120px,1.5fr)] gap-3 items-center p-3 border-b border-rv-border text-[11px] text-rv-dim uppercase tracking-wider font-semibold min-w-[800px]">
						<div>Project</div>
						<div>Author</div>
						<div>Event</div>
						<div>Type</div>
						<div>Wait Time</div>
						<div>Hours</div>
						<div>Status</div>
					</div>
					
					{#if loading}
						{#each Array(8) as _}
							<div class="grid grid-cols-[minmax(150px,2fr)_minmax(100px,1.5fr)_minmax(100px,1fr)_minmax(100px,1.2fr)_minmax(100px,1fr)_80px_minmax(120px,1.5fr)] gap-3 p-3 border-b border-rv-border min-w-[800px]">
								<Skeleton class="h-4 w-3/4" />
								<Skeleton class="h-4 w-1/2" />
								<Skeleton class="h-4 w-2/3" />
								<Skeleton class="h-4 w-1/2" />
								<Skeleton class="h-4 w-3/4" />
								<Skeleton class="h-4 w-8" />
								<Skeleton class="h-4 w-1/2" />
							</div>
						{/each}
					{:else}
						<div class="flex flex-col min-w-[800px]">
							{#each filteredItems as item (item.submissionId)}
								{@const activeOtherClaim = item.claim && !item.claim.isMine && !item.claim.isStale ? item.claim : null}
								<a
									href="{base}/review/{item.project.projectId}"
									class="grid grid-cols-[minmax(150px,2fr)_minmax(100px,1.5fr)_minmax(100px,1fr)_minmax(100px,1.2fr)_minmax(100px,1fr)_80px_minmax(120px,1.5fr)] gap-3 items-center p-3 border-b border-rv-border last:border-b-0 cursor-pointer transition-all duration-150 no-underline text-inherit hover:bg-rv-surface2 {activeOtherClaim ? 'bg-yellow-500/5' : ''}"
									title={activeOtherClaim ? `Currently being reviewed by ${activeOtherClaim.firstName} ${activeOtherClaim.lastName}` : undefined}
								>
									<div class="flex flex-col min-w-0">
										<div class="font-semibold text-[14px] text-rv-text truncate">
											{item.project.projectTitle}
										</div>
										<div class="flex items-center gap-1.5 mt-1 text-[11px] font-normal text-rv-dim">
											{#if item.project.playableUrl}
												<a
													href={item.project.playableUrl}
													target="_blank"
													rel="noopener noreferrer"
													class="text-rv-accent hover:underline inline-flex items-center gap-0.5"
													onclick={(e) => e.stopPropagation()}
												>
													<span>Demo</span>
													<svg class="w-3 h-3 text-rv-dim/60" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
														<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
														<polyline points="15 3 21 3 21 9" />
														<line x1="10" y1="14" x2="21" y2="3" />
													</svg>
												</a>
											{/if}
											{#if item.project.playableUrl && (item.project.readmeUrl || item.project.repoUrl)}
												<span class="text-rv-dim/30 select-none">•</span>
											{/if}
											{#if item.project.readmeUrl || item.project.repoUrl}
												{@const readme = item.project.readmeUrl || (item.project.repoUrl ? `${item.project.repoUrl.replace(/\/$/, '')}/blob/main/README.md` : null)}
												{#if readme}
													<a
														href={readme}
														target="_blank"
														rel="noopener noreferrer"
														class="text-rv-accent hover:underline inline-flex items-center gap-0.5"
														onclick={(e) => e.stopPropagation()}
													>
														<span>Readme</span>
														<svg class="w-3 h-3 text-rv-dim/60" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
															<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
															<polyline points="15 3 21 3 21 9" />
															<line x1="10" y1="14" x2="21" y2="3" />
														</svg>
													</a>
												{/if}
											{/if}
										</div>
									</div>
									<div class="text-[13px] text-rv-dim truncate">
										{userLabel(item.project.user)}
									</div>
									<div class="truncate">
										{#if item.project.user.eventSlug}
											<span class="inline-block py-0.5 px-2 bg-rv-surface2 text-rv-dim rounded text-[11px] border border-rv-border truncate max-w-full">
												{events.find(e => e.slug === item.project.user.eventSlug)?.title || item.project.user.eventSlug}
											</span>
										{:else}
											<span class="text-[11px] text-rv-dim/50">—</span>
										{/if}
									</div>
									<div class="text-[12px] text-rv-text truncate">
										<span class="inline-block py-0.5 px-2 bg-rv-tag-bg text-rv-accent rounded-xl text-[11px] truncate max-w-full">
											{formatTypeName(item.project.projectType)}
										</span>
									</div>
									<div class="truncate flex items-center">
										<span class="inline-flex items-center gap-1 py-0.5 px-2 rounded-xl text-[11px] border {waitingPillClass(item.createdAt)} whitespace-nowrap">
											<svg class="w-3 h-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
												<circle cx="12" cy="12" r="10" />
												<polyline points="12 6 12 12 16 14" />
											</svg>
											{waitingFor(item.createdAt)}
										</span>
									</div>
									<div class="text-[12px] text-rv-text truncate">
										{#if item.hackatimeHours != null}
											{item.hackatimeHours.toFixed(1)}h
										{:else}
											<span class="text-[11px] text-rv-dim/50">—</span>
										{/if}
									</div>
									<div class="flex items-center gap-1.5 flex-wrap">
										{#if activeOtherClaim}
											<span class="inline-flex items-center gap-1 py-0.5 px-2 rounded-xl text-[11px] font-semibold bg-yellow-500/15 text-yellow-600 border border-yellow-500/40 truncate max-w-full">
												<span class="w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse shrink-0"></span>
												<span class="truncate">Reviewing: {activeOtherClaim.firstName}</span>
											</span>
										{:else if item.claim?.isMine}
											<span class="inline-flex items-center gap-1 py-0.5 px-2 rounded-xl text-[11px] font-semibold bg-rv-tag-bg text-rv-accent border border-rv-accent/40 truncate max-w-full">
												Open in your tab
											</span>
										{:else}
											{#if item.project.joeFraudPassed === false}
												<span class="inline-flex items-center gap-1 py-0.5 px-2 rounded-xl text-[11px] font-semibold bg-red-500/15 text-red-500 border border-red-500/40">
													Flagged
												</span>
											{:else if item.project.joeFraudPassed === true}
												<span class="inline-flex items-center gap-1 py-0.5 px-2 rounded-xl text-[11px] font-semibold bg-green-500/15 text-green-500 border border-green-500/40">
													Passed
												</span>
											{/if}
										{/if}
									</div>
								</a>
							{:else}
								<div class="p-6 text-center text-rv-dim text-sm">
									No projects match your filters.
								</div>
							{/each}
						</div>
					{/if}
				</div>
			{/if}
		</section>

		{#if searchQuery.trim() !== '' && filteredFraudRejected.length > 0}
			<hr class="border-none border-t border-rv-border mx-6 my-4" />

			<section class="px-6 py-2">
				<h2 class="text-[13px] uppercase tracking-wider font-semibold mb-3 text-red-500">
					Frauded
					<span class="text-red-500/60 font-normal normal-case ml-1">({filteredFraudRejected.length})</span>
				</h2>
				<div class="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] content-start gap-4">
					{#each filteredFraudRejected as item (item.submissionId)}
						<a
							href="{base}/review/{item.projectId}"
							class="flex flex-col gap-1.5 p-5 bg-rv-surface border border-red-500/40 rounded-[10px] cursor-pointer transition-all duration-150 text-left no-underline font-inherit hover:border-red-500 hover:bg-rv-surface2"
						>
							<p class="text-[15px] font-semibold text-rv-text m-0">{item.projectTitle}</p>
							<p class="text-[13px] text-rv-dim m-0">{userLabel(item.user)}</p>
							<div class="flex items-center gap-1.5 flex-wrap mt-1">
								<span class="inline-block py-0.75 px-2.5 bg-rv-tag-bg text-rv-accent rounded-xl text-[11px]">{formatTypeName(item.projectType)}</span>
								<span
									class="inline-flex items-center gap-1 py-0.5 px-2 rounded-xl text-[11px] font-semibold bg-red-500/15 text-red-500 border border-red-500/40"
									title="Silently rejected by fraud — user sees this as still pending."
								>
									Frauded
								</span>
								{#if item.finalizedAt}
									<span class="text-[11px] text-rv-dim">{timeAgo(item.finalizedAt)}</span>
								{/if}
							</div>
						</a>
					{/each}
				</div>
			</section>
		{/if}

		<hr class="border-none border-t border-rv-border mx-6 my-4" />

		<section class="px-6 py-2">
			<h2 class="text-[13px] uppercase tracking-wider text-rv-dim font-semibold mb-3">
				My Past Reviews <span class="text-rv-text/60 font-normal normal-case ml-1">({myPastReviews.length})</span>
			</h2>
			{#if pastLoading}
				<p class="text-rv-dim py-6 text-sm">Loading past reviews…</p>
			{:else}
				<div class="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] content-start gap-4">
					{#each myPastReviews as review (review.submissionId)}
						<a
							href="{base}/review/{review.projectId}"
							class="flex flex-col gap-1.5 p-5 bg-rv-surface border border-rv-border rounded-[10px] cursor-pointer transition-all duration-150 text-left no-underline font-inherit hover:border-rv-accent hover:bg-rv-surface2"
						>
							<p class="text-[15px] font-semibold text-rv-text m-0">{review.projectTitle}</p>
							<p class="text-[13px] text-rv-dim m-0">
								{userLabel(review.user)}
							</p>
							<div class="flex items-center gap-1.5 flex-wrap mt-1">
								{#if review.reviewPassed !== null}
									<span
										class="inline-flex items-center gap-1.5 py-0.5 px-2 rounded-xl text-[11px] font-semibold border bg-yellow-500/15 text-yellow-600 border-yellow-500/40"
										title="Reviewer has already voted on this project's latest review."
									>
										<svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
											<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
											<line x1="12" y1="9" x2="12" y2="13" />
											<line x1="12" y1="17" x2="12.01" y2="17" />
										</svg>
										Already {review.reviewPassed ? 'Approved' : 'Rejected'}
									</span>
								{/if}
								{#if review.reviewCount > 1}
									<span
										class="py-0.5 px-2 rounded-xl text-[11px] font-semibold bg-rv-tag-bg text-rv-accent"
										title="This project has {review.reviewCount} reviewed submissions. Latest shown."
									>
										Reviewed {review.reviewCount}×
									</span>
								{/if}
							</div>
							<div class="flex items-center gap-2 mt-1 flex-wrap">
								<span class="inline-block py-0.75 px-2.5 bg-rv-tag-bg text-rv-accent rounded-xl text-[11px]">{formatTypeName(review.projectType)}</span>
								{#if review.reviewedAt}
									<span class="text-[11px] text-rv-dim">{timeAgo(review.reviewedAt)}</span>
								{/if}
							</div>
						</a>
					{:else}
						<p class="col-span-full text-rv-dim py-6 text-sm">You haven't reviewed any projects yet.</p>
					{/each}
				</div>
			{/if}
		</section>

		<hr class="border-none border-t border-rv-border mx-6 my-4" />

		<section class="px-6 py-2 pb-6">
			<h2 class="text-[13px] uppercase tracking-wider text-rv-dim font-semibold mb-3">
				All Past Reviews <span class="text-rv-text/60 font-normal normal-case ml-1">({allPastReviews.length})</span>
			</h2>
			{#if pastLoading}
				<p class="text-rv-dim py-6 text-sm">Loading past reviews…</p>
			{:else}
				<div class="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] content-start gap-4">
					{#each allPastReviews as review (review.submissionId)}
						<a
							href="{base}/review/{review.projectId}"
							class="flex flex-col gap-1.5 p-5 bg-rv-surface border border-rv-border rounded-[10px] cursor-pointer transition-all duration-150 text-left no-underline font-inherit hover:border-rv-accent hover:bg-rv-surface2"
						>
							<p class="text-[15px] font-semibold text-rv-text m-0">{review.projectTitle}</p>
							<p class="text-[13px] text-rv-dim m-0">
								{userLabel(review.user)}
							</p>
							<div class="flex items-center gap-1.5 flex-wrap mt-1">
								{#if review.reviewPassed !== null}
									<span
										class="inline-flex items-center gap-1.5 py-0.5 px-2 rounded-xl text-[11px] font-semibold border bg-yellow-500/15 text-yellow-600 border-yellow-500/40"
										title="Reviewer has already voted on this project's latest review."
									>
										<svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
											<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
											<line x1="12" y1="9" x2="12" y2="13" />
											<line x1="12" y1="17" x2="12.01" y2="17" />
										</svg>
										Already {review.reviewPassed ? 'Approved' : 'Rejected'}
									</span>
								{/if}
								{#if review.reviewCount > 1}
									<span
										class="py-0.5 px-2 rounded-xl text-[11px] font-semibold bg-rv-tag-bg text-rv-accent"
										title="This project has {review.reviewCount} reviewed submissions. Latest shown."
									>
										Reviewed {review.reviewCount}×
									</span>
								{/if}
							</div>
							<div class="flex items-center gap-2 mt-1 flex-wrap">
								<span class="inline-block py-0.75 px-2.5 bg-rv-tag-bg text-rv-accent rounded-xl text-[11px]">{formatTypeName(review.projectType)}</span>
								<span class="text-[11px] text-rv-dim">by {review.reviewerName}</span>
								{#if review.reviewedAt}
									<span class="text-[11px] text-rv-dim">· {timeAgo(review.reviewedAt)}</span>
								{/if}
							</div>
						</a>
					{:else}
						<p class="col-span-full text-rv-dim py-6 text-sm">No past reviews match your filters.</p>
					{/each}
				</div>
			{/if}
		</section>
	</div>
</div>
