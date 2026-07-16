<script lang="ts">
	import { onMount } from 'svelte';
	import { base } from '$app/paths';
	import { api, type components } from '$lib/api';
	import { ensureUser } from '$lib/auth';
	import { hasRole } from '$lib/roles';
	import { getEvents, getPriorityQueue } from '$lib/reviewCache';
	import { Skeleton, Highlight } from '$lib/components';
	import { matchesScopedQuery } from '$lib/search';
	import { mostUpcomingEventSlug } from '$lib/events';
	import { LayoutGrid, List, ExternalLink } from 'lucide-svelte';

	type FraudGalleryItem = components['schemas']['FraudGalleryItemResponse'];
	type EventResponse = components['schemas']['EventResponse'];
	type PriorityQueueEntry = components['schemas']['PriorityQueueEntryResponse'];

	// Human-facing Joe fraud-review platform. Each project deep-links here by its
	// joeProjectId so admins can jump straight to Joe's review UI.
	const JOE_BASE_URL = 'https://joe.fraud.hackclub.com/ysws/horizons/projects';

	// "__none__" sentinel matches users without a pinned event so they can be
	// triaged separately from cohort-tagged submissions.
	const NO_EVENT_SENTINEL = '__none__';

	// Filter state is persisted in sessionStorage (distinct keys from the review
	// gallery) so admins keep their scope across navigation round-trips.
	const EVENT_FILTER_STORAGE_KEY = 'horizons-fraud-review-event-filter';
	const VIEW_MODE_STORAGE_KEY = 'horizons-fraud-review-view-mode';
	const SORT_ORDER_STORAGE_KEY = 'horizons-fraud-review-sort-order';
	const FRAUD_FILTER_STORAGE_KEY = 'horizons-fraud-review-fraud-filter';
	const REVIEW_FILTER_STORAGE_KEY = 'horizons-fraud-review-review-filter';
	const TICKET_FILTER_STORAGE_KEY = 'horizons-fraud-review-ticket-filter';
	const PRIORITY_QUEUE_FILTER_STORAGE_KEY = 'horizons-fraud-review-priority-queue-filter';

	type SortOrder = 'longest-wait' | 'shortest-wait' | 'most-hours' | 'least-hours';
	const SORT_ORDERS: readonly SortOrder[] = [
		'longest-wait',
		'shortest-wait',
		'most-hours',
		'least-hours',
	];
	type FraudFilter = 'all' | 'reviewed' | 'unreviewed';
	const FRAUD_FILTERS: readonly FraudFilter[] = ['all', 'reviewed', 'unreviewed'];
	// Project review status is multiselect: an empty set means "show all",
	// matching the Event filter's semantics.
	type ReviewStatus = 'approved' | 'rejected' | 'unreviewed';
	const REVIEW_STATUSES: readonly ReviewStatus[] = [
		'approved',
		'rejected',
		'unreviewed',
	];
	// Ticket filter: 'all' is the unfiltered default with no chip — selecting a
	// chip narrows, clicking the active chip clears back to 'all'.
	type TicketFilter = 'all' | 'bought' | 'not-bought' | 'can-buy-if-approved';
	const TICKET_FILTERS: readonly TicketFilter[] = [
		'all',
		'bought',
		'not-bought',
		'can-buy-if-approved',
	];

	// Reads a persisted string set, or null when nothing valid is stored yet
	// (key absent / malformed). A stored empty array is a valid explicit "show
	// all" and comes back as an empty set, not null.
	function readStoredStringSet(key: string): Set<string> | null {
		if (typeof sessionStorage === 'undefined') return null;
		try {
			const raw = sessionStorage.getItem(key);
			if (raw === null) return null;
			const parsed = JSON.parse(raw);
			if (!Array.isArray(parsed)) return null;
			return new Set(parsed.filter((s): s is string => typeof s === 'string'));
		} catch {
			return null;
		}
	}

	// `defaults` seeds the set only when nothing has been persisted yet (key
	// absent). A stored empty array is respected as an explicit "show all" so
	// clearing the filter sticks across navigation.
	function loadStringSet(key: string, defaults: string[] = []): Set<string> {
		return readStoredStringSet(key) ?? new Set(defaults);
	}

	function loadEnum<T extends string>(
		key: string,
		allowed: readonly T[],
		fallback: T,
	): T {
		if (typeof sessionStorage === 'undefined') return fallback;
		try {
			const raw = sessionStorage.getItem(key);
			if (raw && (allowed as readonly string[]).includes(raw)) return raw as T;
		} catch {
			// sessionStorage can throw (private mode, quota); fall back to default.
		}
		return fallback;
	}

	// Reviewers/admins triage the most-upcoming event's cohort by default. That
	// slug can't be known until events load, so on a fresh session (no persisted
	// filter) we start empty and seed it in load() once events are available.
	// `needsDefaultEventSeed` gates that seeding — and holds off persisting so the
	// transient empty set can't clobber the default for the next visit.
	const storedEventFilter = readStoredStringSet(EVENT_FILTER_STORAGE_KEY);
	let needsDefaultEventSeed = $state(storedEventFilter === null);
	let selectedEvents = $state<Set<string>>(storedEventFilter ?? new Set());
	let viewMode = $state<'grid' | 'list'>(
		loadEnum(VIEW_MODE_STORAGE_KEY, ['grid', 'list'] as const, 'grid'),
	);
	let searchQuery = $state('');
	// Debounced copy of searchQuery that drives filtering/highlighting, so the
	// grid isn't re-rendered on every keystroke.
	let appliedSearch = $state('');
	type SearchField = 'all' | 'title' | 'author' | 'slack' | 'event' | 'type' | 'id';
	let searchField = $state<SearchField>('all');
	let sortOrder = $state<SortOrder>(
		loadEnum(SORT_ORDER_STORAGE_KEY, SORT_ORDERS, 'longest-wait'),
	);
	let fraudFilter = $state<FraudFilter>(
		loadEnum(FRAUD_FILTER_STORAGE_KEY, FRAUD_FILTERS, 'unreviewed'),
	);
	// loadStringSet's JSON.parse rejects the old single-select values ('all',
	// 'approved', …) stored under this key, so stale entries fall back to the
	// empty set ("show all") instead of breaking.
	let reviewFilter = $state<Set<ReviewStatus>>(
		new Set(
			[...loadStringSet(REVIEW_FILTER_STORAGE_KEY)].filter((s): s is ReviewStatus =>
				(REVIEW_STATUSES as readonly string[]).includes(s),
			),
		),
	);
	let ticketFilter = $state<TicketFilter>(
		loadEnum(TICKET_FILTER_STORAGE_KEY, TICKET_FILTERS, 'all'),
	);
	// When enabled, only show projects present in the priority-review queue.
	let priorityQueueFilter = $state<boolean>(
		loadEnum(PRIORITY_QUEUE_FILTER_STORAGE_KEY, ['true', 'false'] as const, 'false') === 'true',
	);

	function persist(key: string, value: string) {
		if (typeof sessionStorage === 'undefined') return;
		try {
			sessionStorage.setItem(key, value);
		} catch {
			// in-memory state still works for the rest of the page lifecycle
		}
	}

	$effect(() => {
		// Don't persist the transient empty set before the default is seeded, or a
		// fast navigation away would save "show all" and lose the default.
		if (needsDefaultEventSeed) return;
		persist(EVENT_FILTER_STORAGE_KEY, JSON.stringify([...selectedEvents]));
	});
	$effect(() => persist(VIEW_MODE_STORAGE_KEY, viewMode));
	$effect(() => persist(SORT_ORDER_STORAGE_KEY, sortOrder));
	$effect(() => persist(FRAUD_FILTER_STORAGE_KEY, fraudFilter));
	$effect(() => persist(REVIEW_FILTER_STORAGE_KEY, JSON.stringify([...reviewFilter])));
	$effect(() => persist(TICKET_FILTER_STORAGE_KEY, ticketFilter));
	$effect(() => persist(PRIORITY_QUEUE_FILTER_STORAGE_KEY, String(priorityQueueFilter)));

	let items = $state<FraudGalleryItem[]>([]);
	let events = $state<EventResponse[]>([]);
	// Approved priority-review queue from the external Halceon service, keyed by
	// Horizons project id. Drives the "Priority queue" sort and the per-card
	// reason surfaced on matching projects.
	let priorityQueue = $state<Map<number, PriorityQueueEntry>>(new Map());
	let loading = $state(true);
	let refreshing = $state(false);
	let error = $state<string | null>(null);

	async function load() {
		const [{ data, error: err }, eventsData, pqData] = await Promise.all([
			api.GET('/api/admin/fraud-review/gallery'),
			getEvents(),
			getPriorityQueue(),
		]);
		if (err) {
			error = 'Failed to load fraud-review gallery. Admin role required.';
			items = [];
			return;
		}
		error = null;
		items = data ?? [];
		if (eventsData) events = eventsData;
		if (pqData) {
			const next = new Map<number, PriorityQueueEntry>();
			for (const entry of pqData) next.set(entry.projectId, entry);
			priorityQueue = next;
		}
		// Seed the default event filter now that events are known (first load only).
		if (needsDefaultEventSeed) {
			const slug = mostUpcomingEventSlug(events);
			if (slug) selectedEvents = new Set([slug]);
			needsDefaultEventSeed = false;
		}
	}

	onMount(async () => {
		const me = await ensureUser();
		if (me && !hasRole(me.roles, 'admin')) {
			window.location.href = `${base}/review`;
			return;
		}
		try {
			await load();
		} finally {
			loading = false;
		}
	});

	async function refresh() {
		refreshing = true;
		try {
			await load();
		} finally {
			refreshing = false;
		}
	}

	function userLabel(u: FraudGalleryItem['user']): string {
		const name = [u.firstName, u.lastName].filter(Boolean).join(' ').trim();
		return name || (u.slackUserId ? `@${u.slackUserId}` : 'Anonymous');
	}

	// Slack handle shown (and highlighted) next to the author when the label is
	// already the real name — otherwise userLabel is the handle itself.
	function slackSuffix(u: FraudGalleryItem['user']): string | null {
		const name = [u.firstName, u.lastName].filter(Boolean).join(' ').trim();
		return name && u.slackUserId ? `@${u.slackUserId}` : null;
	}

	function formatTypeName(type: string): string {
		return type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
	}

	function joeUrl(joeProjectId: string): string {
		return `${JOE_BASE_URL}/${joeProjectId}`;
	}

	$effect(() => {
		const q = searchQuery;
		if (q === appliedSearch) return;
		const timer = setTimeout(() => (appliedSearch = q), 200);
		return () => clearTimeout(timer);
	});

	// Scope key → searchable text for one gallery item; 'id' accepts the bare
	// number, the "#123" form, and the Joe project id.
	function searchFields(item: FraudGalleryItem): Record<string, string> {
		return {
			title: item.projectTitle,
			author: userLabel(item.user),
			slack: item.user.slackUserId ?? '',
			event: item.user.eventTitle ?? '',
			type: `${item.projectType}\n${formatTypeName(item.projectType)}`,
			id: `${item.projectId}\n#${item.projectId}\n${item.joeProjectId ?? ''}`,
		};
	}

	function matchesFilters(item: FraudGalleryItem): boolean {
		const matchesEvent =
			selectedEvents.size === 0 ||
			selectedEvents.has(item.user.eventSlug ?? NO_EVENT_SENTINEL);
		return (
			matchesEvent &&
			matchesScopedQuery(searchFields(item), searchField, appliedSearch)
		);
	}

	function matchesFraudFilter(joeFraudPassed: boolean | null): boolean {
		if (fraudFilter === 'all') return true;
		if (fraudFilter === 'reviewed') return joeFraudPassed !== null;
		return joeFraudPassed === null;
	}

	// The reviewer gate's verdict, independent of fraud — a reviewer-approved
	// project counts as 'approved' even while Joe's fraud verdict is pending,
	// so "Fraud: Unreviewed + Project: Approved" surfaces the awaiting-Joe set.
	function reviewStatus(item: FraudGalleryItem): ReviewStatus {
		return item.reviewerVerdict ?? 'unreviewed';
	}

	function matchesReviewFilter(item: FraudGalleryItem): boolean {
		return reviewFilter.size === 0 || reviewFilter.has(reviewStatus(item));
	}

	function matchesTicketFilter(item: FraudGalleryItem): boolean {
		if (ticketFilter === 'all') return true;
		if (ticketFilter === 'bought') return item.boughtTicket;
		if (ticketFilter === 'not-bought') return !item.boughtTicket;
		return item.canBuyTicketIfApproved;
	}

	// Sort by the latest submission timestamp (wait time) so the freshest /
	// stalest submissions surface; fall back to project createdAt if a project
	// somehow has no submission timestamp.
	function waitTime(item: FraudGalleryItem): number {
		return new Date(
			item.latestSubmissionCreatedAt ?? item.createdAt,
		).getTime();
	}

	let filteredItems = $derived(
		items
			.filter(
				(item) =>
					matchesFilters(item) &&
					matchesFraudFilter(item.joeFraudPassed) &&
					matchesReviewFilter(item) &&
					matchesTicketFilter(item) &&
					(!priorityQueueFilter || priorityQueue.has(item.projectId)),
			)
			.sort((a, b) => {
				if (sortOrder === 'most-hours' || sortOrder === 'least-hours') {
					const aH = a.nowHackatimeHours;
					const bH = b.nowHackatimeHours;
					if (aH == null && bH == null) return 0;
					if (aH == null) return 1;
					if (bH == null) return -1;
					return sortOrder === 'most-hours' ? bH - aH : aH - bH;
				}
				const aT = waitTime(a);
				const bT = waitTime(b);
				return sortOrder === 'longest-wait' ? aT - bT : bT - aT;
			}),
	);

	function toggleEvent(slug: string) {
		const next = new Set(selectedEvents);
		if (next.has(slug)) next.delete(slug);
		else next.add(slug);
		selectedEvents = next;
	}

	function toggleReviewStatus(status: ReviewStatus) {
		const next = new Set(reviewFilter);
		if (next.has(status)) next.delete(status);
		else next.add(status);
		reviewFilter = next;
	}
</script>

<!--
	Recolor the gallery's accent from the review tool's amber to a purple lilac
	so the Fraud Gallery reads as visually distinct. Every accent utility on this
	page resolves these two custom properties, so overriding them here cascades
	to the whole page (title, active filter chips, hovers, type/tag badges).
-->
<div
	class="flex h-screen flex-col overflow-hidden"
	style="--color-rv-accent: #b794f6; --color-rv-tag-bg: rgba(183, 148, 246, 0.16);"
>
	<div
		class="flex shrink-0 items-center justify-between border-b border-rv-border bg-rv-surface px-6 py-4"
	>
		<div class="flex items-center gap-3">
			<a
				href="{base}/review"
				class="text-[13px] text-rv-dim no-underline hover:text-rv-text"
			>
				← Back to review
			</a>
			<div class="text-[18px] font-bold text-rv-accent">
				HORIZONS
				<span class="ml-2 text-[13px] font-normal text-rv-text">Fraud Gallery</span>
			</div>
		</div>
		<div class="flex items-center gap-3">
			{#if loading}
				<Skeleton class="h-4 w-32" />
			{:else}
				<p class="m-0 text-[13px] text-rv-dim">
					{filteredItems.length} of {items.length} projects
				</p>
			{/if}
			<a
				href="{base}/review/stats"
				class="inline-block cursor-pointer rounded-md border border-rv-border bg-rv-surface2 px-3.5 py-1.5 font-inherit text-[12px] text-rv-dim no-underline transition-all duration-150 hover:border-rv-accent hover:text-rv-text"
			>
				Stats
			</a>
			<a
				href="{base}/review/fraud-queue"
				class="inline-block cursor-pointer rounded-md border border-rv-border bg-rv-surface2 px-3.5 py-1.5 font-inherit text-[12px] text-rv-dim no-underline transition-all duration-150 hover:border-rv-accent hover:text-rv-text"
			>
				Fraud Queue
			</a>
			<a
				href="{base}/review/fraud-review"
				class="inline-block cursor-pointer rounded-md border border-rv-border bg-rv-surface2 px-3.5 py-1.5 font-inherit text-[12px] text-rv-dim no-underline transition-all duration-150 hover:border-rv-accent hover:text-rv-text"
			>
				Fraud Review
			</a>
			<button
				class="cursor-pointer rounded-md border border-rv-border bg-rv-surface2 px-3.5 py-1.5 font-inherit text-[12px] text-rv-dim transition-all duration-150 hover:border-rv-accent hover:text-rv-text disabled:cursor-not-allowed disabled:opacity-40"
				onclick={refresh}
				disabled={refreshing}
			>
				{refreshing ? 'Refreshing…' : 'Refresh'}
			</button>
		</div>
	</div>

	<div class="flex shrink-0 flex-col gap-3 border-b border-rv-border bg-rv-surface px-6 py-4">
		<div class="flex gap-2">
			<input
				type="text"
				class="flex-1 rounded-lg border border-rv-border bg-rv-bg px-3.5 py-2.5 font-inherit text-sm text-rv-text outline-none transition-all duration-150 placeholder:text-rv-dim focus:border-rv-accent"
				placeholder="Search by project, author, Slack ID, event, type, or ID..."
				bind:value={searchQuery}
			/>
			<select
				bind:value={searchField}
				class="shrink-0 cursor-pointer rounded-lg border border-rv-border bg-rv-bg px-2.5 font-inherit text-sm text-rv-text outline-none transition-all duration-150 focus:border-rv-accent"
			>
				<option value="all">All fields</option>
				<option value="title">Title</option>
				<option value="author">Author</option>
				<option value="slack">Slack ID</option>
				<option value="event">Event</option>
				<option value="type">Type</option>
				<option value="id">Project / Joe ID</option>
			</select>
		</div>

		{#if events.length > 0}
			<div class="flex flex-wrap items-center gap-2">
				<span class="mr-1 text-[11px] text-rv-dim">Event</span>
				{#each events as event (event.slug)}
					<button
						class="cursor-pointer rounded-[20px] border border-rv-border bg-rv-surface2 px-3.5 py-1.5 font-inherit text-[12px] text-rv-dim transition-all duration-150 hover:border-rv-accent hover:text-rv-text {selectedEvents.has(event.slug) ? 'bg-rv-tag-bg border-rv-accent! text-rv-accent!' : ''}"
						onclick={() => toggleEvent(event.slug)}
					>
						{event.title}
					</button>
				{/each}
				<button
					class="cursor-pointer rounded-[20px] border border-rv-border bg-rv-surface2 px-3.5 py-1.5 font-inherit text-[12px] text-rv-dim transition-all duration-150 hover:border-rv-accent hover:text-rv-text {selectedEvents.has(NO_EVENT_SENTINEL) ? 'bg-rv-tag-bg border-rv-accent! text-rv-accent!' : ''}"
					onclick={() => toggleEvent(NO_EVENT_SENTINEL)}
					title="Projects from users who haven't picked an event"
				>
					No event
				</button>
				{#if selectedEvents.size > 0}
					<button
						class="cursor-pointer rounded-[20px] border border-rv-border bg-transparent px-3.5 py-1.5 font-inherit text-[12px] text-rv-dim underline hover:text-rv-text"
						onclick={() => (selectedEvents = new Set())}
					>
						Clear event filter
					</button>
				{/if}
			</div>
		{/if}
	</div>

	<div class="flex-1 overflow-y-auto">
		<section class="px-6 pt-6 pb-2">
			<div class="mb-3 flex items-center justify-between">
				<h2 class="m-0 text-[13px] font-semibold uppercase tracking-wider text-rv-dim">
					Projects
					{#if loading}
						<span class="ml-1 inline-block align-middle"><Skeleton class="inline-block h-3 w-8" /></span>
					{:else}
						<span class="ml-1 font-normal normal-case text-rv-text/60">({filteredItems.length})</span>
					{/if}
				</h2>

				<div class="flex shrink-0 select-none items-center rounded-lg border border-rv-border bg-rv-surface2 p-0.5">
					<button
						class="cursor-pointer rounded-md p-1 transition-all duration-150 {viewMode === 'grid' ? 'border border-rv-border/30 bg-rv-surface text-rv-accent' : 'border border-transparent text-rv-dim hover:text-rv-text'}"
						onclick={() => (viewMode = 'grid')}
						title="Grid View"
						aria-label="Grid View"
					>
						<LayoutGrid class="h-4 w-4" />
					</button>
					<button
						class="cursor-pointer rounded-md p-1 transition-all duration-150 {viewMode === 'list' ? 'border border-rv-border/30 bg-rv-surface text-rv-accent' : 'border border-transparent text-rv-dim hover:text-rv-text'}"
						onclick={() => (viewMode = 'list')}
						title="List View"
						aria-label="List View"
					>
						<List class="h-4 w-4" />
					</button>
				</div>
			</div>

			<div class="mb-3 flex flex-wrap items-center gap-2">
				<span class="text-[11px] text-rv-dim">Sort</span>
				{#each [['longest-wait', 'Longest wait'], ['shortest-wait', 'Shortest wait'], ['most-hours', 'Most hours'], ['least-hours', 'Least hours']] as [value, label]}
					<button
						class="cursor-pointer rounded-[20px] border px-3.5 py-1.5 font-inherit text-[12px] transition-all duration-150 {sortOrder === value ? 'border-rv-accent bg-rv-tag-bg text-rv-accent' : 'border-rv-border bg-rv-surface2 text-rv-dim hover:border-rv-accent hover:text-rv-text'}"
						onclick={() => (sortOrder = value as SortOrder)}
					>
						{label}
					</button>
				{/each}

				<span class="ml-3 text-[11px] text-rv-dim">Priority</span>
				<button
					class="cursor-pointer rounded-[20px] border px-3.5 py-1.5 font-inherit text-[12px] transition-all duration-150 {priorityQueueFilter ? 'border-rv-accent bg-rv-tag-bg text-rv-accent' : 'border-rv-border bg-rv-surface2 text-rv-dim hover:border-rv-accent hover:text-rv-text'}"
					onclick={() => (priorityQueueFilter = !priorityQueueFilter)}
					title="Show only projects in the priority-review queue"
				>
					Priority queue{priorityQueue.size > 0 ? ` (${priorityQueue.size})` : ''}
				</button>

				<span class="ml-3 text-[11px] text-rv-dim">Fraud</span>
				{#each [['all', 'All'], ['reviewed', 'Reviewed'], ['unreviewed', 'Unreviewed']] as [value, label]}
					<button
						class="cursor-pointer rounded-[20px] border px-3.5 py-1.5 font-inherit text-[12px] transition-all duration-150 {fraudFilter === value ? 'border-rv-accent bg-rv-tag-bg text-rv-accent' : 'border-rv-border bg-rv-surface2 text-rv-dim hover:border-rv-accent hover:text-rv-text'}"
						onclick={() => (fraudFilter = value as FraudFilter)}
					>
						{label}
					</button>
				{/each}

				<span class="ml-3 text-[11px] text-rv-dim">Project</span>
				{#each [['approved', 'Approved'], ['rejected', 'Rejected'], ['unreviewed', 'Unreviewed']] as [value, label]}
					<button
						class="cursor-pointer rounded-[20px] border px-3.5 py-1.5 font-inherit text-[12px] transition-all duration-150 {reviewFilter.has(value as ReviewStatus) ? 'border-rv-accent bg-rv-tag-bg text-rv-accent' : 'border-rv-border bg-rv-surface2 text-rv-dim hover:border-rv-accent hover:text-rv-text'}"
						onclick={() => toggleReviewStatus(value as ReviewStatus)}
					>
						{label}
					</button>
				{/each}

				<span class="ml-3 text-[11px] text-rv-dim">Ticket</span>
				{#each [['bought', 'Bought'], ['not-bought', "Hasn't bought"], ['can-buy-if-approved', 'Can buy if approved']] as [value, label]}
					<button
						class="cursor-pointer rounded-[20px] border px-3.5 py-1.5 font-inherit text-[12px] transition-all duration-150 {ticketFilter === value ? 'border-rv-accent bg-rv-tag-bg text-rv-accent' : 'border-rv-border bg-rv-surface2 text-rv-dim hover:border-rv-accent hover:text-rv-text'}"
						onclick={() =>
							(ticketFilter =
								ticketFilter === value ? 'all' : (value as TicketFilter))}
					>
						{label}
					</button>
				{/each}
			</div>

			{#if error}
				<p class="py-6 text-sm text-red-500">{error}</p>
			{:else if viewMode === 'grid'}
				<div class="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] content-start gap-4">
					{#if loading}
						{#each Array(12) as _}
							<div class="flex flex-col gap-2 rounded-[10px] border border-rv-border bg-rv-surface p-5">
								<Skeleton class="h-4 w-3/4" />
								<Skeleton class="h-3 w-1/2" />
								<div class="mt-1 flex flex-wrap items-center gap-1.5">
									<Skeleton class="h-5 w-20 rounded-xl" />
									<Skeleton class="h-5 w-12 rounded-xl" />
								</div>
							</div>
						{/each}
					{:else}
						{#each filteredItems as item (item.projectId)}
							{@const href = item.joeProjectId ? joeUrl(item.joeProjectId) : null}
							<svelte:element
								this={href ? 'a' : 'div'}
								href={href ?? undefined}
								target={href ? '_blank' : undefined}
								rel={href ? 'noopener noreferrer' : undefined}
								class="flex flex-col gap-1.5 rounded-[10px] border border-rv-border bg-rv-surface p-5 font-inherit no-underline transition-all duration-150 {href ? 'cursor-pointer hover:border-rv-accent hover:bg-rv-surface2' : 'cursor-default opacity-70'}"
								title={href ? 'Open in Joe fraud review' : 'No Joe record — not yet pushed to fraud review'}
							>
								<div class="flex items-start justify-between gap-2">
									<p class="m-0 text-[15px] font-semibold text-rv-text">
										<Highlight text={item.projectTitle} query={appliedSearch} />
										<span class="text-[11px] font-normal text-rv-dim"><Highlight text={`#${item.projectId}`} query={appliedSearch} /></span>
									</p>
									{#if href}
										<ExternalLink class="mt-0.5 h-3.5 w-3.5 shrink-0 text-rv-dim" />
									{/if}
								</div>
								<p class="m-0 text-[13px] text-rv-dim">
									<Highlight text={userLabel(item.user)} query={appliedSearch} />{#if slackSuffix(item.user)}
										· <Highlight text={slackSuffix(item.user)!} query={appliedSearch} />{/if}
								</p>
								<div class="mt-1 flex flex-wrap items-center gap-1.5">
									<span class="inline-block rounded-xl bg-rv-tag-bg px-2.5 py-0.75 text-[11px] text-rv-accent">
										<Highlight text={formatTypeName(item.projectType)} query={appliedSearch} />
									</span>
									{#if item.user.eventTitle}
										<span class="inline-block max-w-full truncate rounded border border-rv-border bg-rv-surface2 px-2 py-0.5 text-[11px] text-rv-dim">
											<Highlight text={item.user.eventTitle} query={appliedSearch} />
										</span>
									{/if}
									{#if item.nowHackatimeHours != null}
										<span class="inline-flex items-center gap-1 rounded-xl border border-rv-border bg-rv-tag-bg px-2 py-0.5 text-[11px] text-rv-dim">
											{item.nowHackatimeHours.toFixed(1)}h
										</span>
									{/if}
									{#if item.joeFraudPassed === false}
										<span class="inline-flex items-center rounded-xl border border-red-500/40 bg-red-500/15 px-2 py-0.5 text-[11px] font-semibold text-red-500">
											Flagged
										</span>
									{:else if item.joeFraudPassed === true}
										<span class="inline-flex items-center rounded-xl border border-green-500/40 bg-green-500/15 px-2 py-0.5 text-[11px] font-semibold text-green-500">
											Passed
										</span>
									{:else}
										<span class="inline-flex items-center rounded-xl border border-rv-border bg-rv-surface2 px-2 py-0.5 text-[11px] text-rv-dim">
											No fraud review
										</span>
									{/if}
									{#if item.reviewed}
										<span class="inline-flex items-center rounded-xl border border-rv-border bg-rv-surface2 px-2 py-0.5 text-[11px] text-rv-dim">
											{item.reviewerVerdict === 'approved' ? 'Approved' : 'Rejected'}
										</span>
									{:else}
										<span class="inline-flex items-center rounded-xl border border-yellow-500/40 bg-yellow-500/15 px-2 py-0.5 text-[11px] text-yellow-600">
											Unreviewed
										</span>
									{/if}
									{#if priorityQueue.has(item.projectId)}
										<span class="inline-flex items-center gap-1 rounded-xl border border-amber-500/40 bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-600">
											Priority
										</span>
									{/if}
								</div>
								{#if priorityQueue.has(item.projectId)}
									{@const pq = priorityQueue.get(item.projectId)!}
									<div class="mt-0.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-[12px] leading-snug text-amber-700 dark:text-amber-300">
										<span class="font-semibold">Priority{#if pq.decidedBy} · {pq.decidedBy}{/if}</span>
										{#if pq.reason}<p class="mt-0.5 whitespace-pre-line wrap-break-word">{pq.reason}</p>{/if}
									</div>
								{/if}
							</svelte:element>
						{:else}
							<p class="col-span-full py-6 text-center text-sm text-rv-dim">No projects match your filters.</p>
						{/each}
					{/if}
				</div>
			{:else}
				<div class="flex flex-col overflow-x-auto rounded-[10px] border border-rv-border bg-rv-surface">
					<div class="grid min-w-[800px] grid-cols-[minmax(150px,2fr)_minmax(100px,1.5fr)_minmax(100px,1fr)_minmax(100px,1.2fr)_80px_minmax(110px,1.2fr)_minmax(110px,1.2fr)] items-center gap-3 border-b border-rv-border p-3 text-[11px] font-semibold uppercase tracking-wider text-rv-dim">
						<div>Project</div>
						<div>Author</div>
						<div>Event</div>
						<div>Type</div>
						<div>Hours</div>
						<div>Fraud</div>
						<div>Project status</div>
					</div>
					{#if loading}
						{#each Array(8) as _}
							<div class="grid min-w-[800px] grid-cols-[minmax(150px,2fr)_minmax(100px,1.5fr)_minmax(100px,1fr)_minmax(100px,1.2fr)_80px_minmax(110px,1.2fr)_minmax(110px,1.2fr)] gap-3 border-b border-rv-border p-3">
								<Skeleton class="h-4 w-3/4" />
								<Skeleton class="h-4 w-1/2" />
								<Skeleton class="h-4 w-2/3" />
								<Skeleton class="h-4 w-1/2" />
								<Skeleton class="h-4 w-8" />
								<Skeleton class="h-4 w-1/2" />
								<Skeleton class="h-4 w-1/2" />
							</div>
						{/each}
					{:else}
						<div class="flex min-w-[800px] flex-col">
							{#each filteredItems as item (item.projectId)}
								{@const href = item.joeProjectId ? joeUrl(item.joeProjectId) : null}
								<svelte:element
									this={href ? 'a' : 'div'}
									href={href ?? undefined}
									target={href ? '_blank' : undefined}
									rel={href ? 'noopener noreferrer' : undefined}
									class="grid min-w-[800px] grid-cols-[minmax(150px,2fr)_minmax(100px,1.5fr)_minmax(100px,1fr)_minmax(100px,1.2fr)_80px_minmax(110px,1.2fr)_minmax(110px,1.2fr)] items-center gap-3 border-b border-rv-border p-3 text-inherit no-underline transition-all duration-150 last:border-b-0 {href ? 'cursor-pointer hover:bg-rv-surface2' : 'cursor-default opacity-70'}"
									title={href ? 'Open in Joe fraud review' : 'No Joe record — not yet pushed to fraud review'}
								>
									<div class="flex min-w-0 items-center gap-1.5">
										<span class="truncate text-[14px] font-semibold text-rv-text">
											<Highlight text={item.projectTitle} query={appliedSearch} />
											<span class="text-[11px] font-normal text-rv-dim"><Highlight text={`#${item.projectId}`} query={appliedSearch} /></span>
										</span>
										{#if href}
											<ExternalLink class="h-3 w-3 shrink-0 text-rv-dim" />
										{/if}
									</div>
									<div class="truncate text-[13px] text-rv-dim">
										<Highlight text={userLabel(item.user)} query={appliedSearch} />{#if slackSuffix(item.user)}
											· <Highlight text={slackSuffix(item.user)!} query={appliedSearch} />{/if}
									</div>
									<div class="truncate">
										{#if item.user.eventTitle}
											<span class="inline-block max-w-full truncate rounded border border-rv-border bg-rv-surface2 px-2 py-0.5 text-[11px] text-rv-dim">
												<Highlight text={item.user.eventTitle} query={appliedSearch} />
											</span>
										{:else}
											<span class="text-[11px] text-rv-dim/50">—</span>
										{/if}
									</div>
									<div class="truncate">
										<span class="inline-block max-w-full truncate rounded-xl bg-rv-tag-bg px-2 py-0.5 text-[11px] text-rv-accent">
											<Highlight text={formatTypeName(item.projectType)} query={appliedSearch} />
										</span>
									</div>
									<div class="truncate text-[12px] text-rv-text">
										{#if item.nowHackatimeHours != null}
											{item.nowHackatimeHours.toFixed(1)}h
										{:else}
											<span class="text-[11px] text-rv-dim/50">—</span>
										{/if}
									</div>
									<div class="truncate">
										{#if item.joeFraudPassed === false}
											<span class="inline-flex items-center rounded-xl border border-red-500/40 bg-red-500/15 px-2 py-0.5 text-[11px] font-semibold text-red-500">Flagged</span>
										{:else if item.joeFraudPassed === true}
											<span class="inline-flex items-center rounded-xl border border-green-500/40 bg-green-500/15 px-2 py-0.5 text-[11px] font-semibold text-green-500">Passed</span>
										{:else}
											<span class="text-[11px] text-rv-dim/50">—</span>
										{/if}
									</div>
									<div class="truncate">
										{#if item.reviewed}
											<span class="inline-flex items-center rounded-xl border border-rv-border bg-rv-surface2 px-2 py-0.5 text-[11px] text-rv-dim">
												{item.reviewerVerdict === 'approved' ? 'Approved' : 'Rejected'}
											</span>
										{:else}
											<span class="inline-flex items-center rounded-xl border border-yellow-500/40 bg-yellow-500/15 px-2 py-0.5 text-[11px] text-yellow-600">Unreviewed</span>
										{/if}
										{#if priorityQueue.has(item.projectId)}
											{@const pq = priorityQueue.get(item.projectId)!}
											<span
												class="ml-1 inline-flex items-center gap-1 rounded-xl border border-amber-500/40 bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-600"
												title={pq.decidedBy ? `Priority approved by ${pq.decidedBy}: ${pq.reason}` : pq.reason}
											>
												Priority
											</span>
										{/if}
									</div>
								</svelte:element>
							{:else}
								<div class="p-6 text-center text-sm text-rv-dim">No projects match your filters.</div>
							{/each}
						</div>
					{/if}
				</div>
			{/if}
		</section>
	</div>
</div>
