<script lang="ts">
	import { onMount } from 'svelte';
	import { base } from '$app/paths';
	import { api, type components } from '$lib/api';
	import { timeAgo, waitingFor } from '../utils';
	type QueueItem = components['schemas']['QueueItemResponse'];
	type PastReview = components['schemas']['PastReviewEntry'];

	interface Props {
		items: QueueItem[];
		onSelect: (index: number) => void;
		onRefresh: () => void;
		refreshing?: boolean;
	}

	let { items, onSelect, onRefresh, refreshing = false }: Props = $props();

	const PROJECT_TYPES = [
		'windows_playable',
		'mac_playable',
		'linux_playable',
		'web_playable',
		'cross_platform_playable',
		'hardware',
		'mobile_app',
	];

	let selectedTypes = $state<Set<string>>(new Set());
	let searchQuery = $state('');
	let shipSortOrder = $state<'newest' | 'oldest'>('newest');
	let fraudFilter = $state<'all' | 'reviewed' | 'unreviewed'>('all');

	let pastReviews = $state<PastReview[]>([]);
	let currentReviewerId = $state<number | null>(null);
	let pastLoading = $state(true);

	onMount(async () => {
		try {
			const { data } = await api.GET('/api/reviewer/past-reviews');
			if (data) {
				pastReviews = data.reviews;
				currentReviewerId = data.currentReviewerId;
			}
		} finally {
			pastLoading = false;
		}
	});

	function matchesFilters(
		projectTitle: string,
		projectType: string,
		authorName: string,
	): boolean {
		const matchesType =
			selectedTypes.size === 0 || selectedTypes.has(projectType);
		const q = searchQuery.toLowerCase();
		const matchesSearch =
			q === '' ||
			projectTitle.toLowerCase().includes(q) ||
			authorName.toLowerCase().includes(q);
		return matchesType && matchesSearch;
	}

	function matchesFraudFilter(joeFraudPassed: boolean | null): boolean {
		if (fraudFilter === 'all') return true;
		if (fraudFilter === 'reviewed') return joeFraudPassed !== null;
		return joeFraudPassed === null;
	}

	function userLabel(u: { displayName: string | null; slackUserId: string | null }): string {
		return u.displayName ?? (u.slackUserId ? `@${u.slackUserId}` : 'Anonymous');
	}

	// Projects this reviewer has already voted on (any submission). Hide them
	// from the pending queue so reviewers don't re-encounter resubmissions of
	// projects they've already finalized.
	let myReviewedProjectIds = $derived(
		currentReviewerId === null
			? new Set<number>()
			: new Set(
					pastReviews
						.filter((r) => r.reviewerId === String(currentReviewerId))
						.map((r) => r.projectId),
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
			.map((item, index) => ({ item, index }))
			.filter(
				({ item }) =>
					!myReviewedProjectIds.has(item.project.projectId) &&
					!isActivelyClaimedByOther(item) &&
					matchesFilters(
						item.project.projectTitle,
						item.project.projectType,
						userLabel(item.project.user),
					) && matchesFraudFilter(item.project.joeFraudPassed),
			)
			.sort((a, b) => {
				const aT = new Date(a.item.createdAt).getTime();
				const bT = new Date(b.item.createdAt).getTime();
				return shipSortOrder === 'newest' ? bT - aT : aT - bT;
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
				),
			),
		),
	);

	function toggleType(type: string) {
		const next = new Set(selectedTypes);
		if (next.has(type)) {
			next.delete(type);
		} else {
			next.add(type);
		}
		selectedTypes = next;
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
		<div class="font-[Space_Mono,monospace] font-bold text-[18px] text-rv-accent">HORIZONS <span class="text-rv-text font-normal text-[13px] ml-2">Project Review</span></div>
		<div class="flex items-center gap-3">
			<p class="text-[13px] text-rv-dim m-0">{filteredItems.length} of {items.length} projects</p>
			<a
				href="/admin/review/stats"
				class="py-1.5 px-3.5 rounded-md border border-rv-border bg-rv-surface2 text-rv-dim text-[12px] font-inherit no-underline inline-block cursor-pointer transition-all duration-150 hover:border-rv-accent hover:text-rv-text"
			>
				Stats
			</a>
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
	</div>

	<div class="overflow-y-auto flex-1">
		<section class="px-6 pt-6 pb-2">
			<h2 class="text-[13px] uppercase tracking-wider text-rv-dim font-semibold mb-3">
				Pending Queue <span class="text-rv-text/60 font-normal normal-case ml-1">({filteredItems.length})</span>
			</h2>
			<div class="flex flex-wrap gap-2 items-center mb-3">
				<span class="text-[11px] text-rv-dim">Ship time</span>
				<button
					class="py-1.5 px-3.5 rounded-[20px] border text-[12px] font-inherit cursor-pointer transition-all duration-150 {shipSortOrder === 'newest' ? 'bg-rv-tag-bg border-rv-accent text-rv-accent' : 'border-rv-border bg-rv-surface2 text-rv-dim hover:border-rv-accent hover:text-rv-text'}"
					onclick={() => (shipSortOrder = 'newest')}
				>
					Newest
				</button>
				<button
					class="py-1.5 px-3.5 rounded-[20px] border text-[12px] font-inherit cursor-pointer transition-all duration-150 {shipSortOrder === 'oldest' ? 'bg-rv-tag-bg border-rv-accent text-rv-accent' : 'border-rv-border bg-rv-surface2 text-rv-dim hover:border-rv-accent hover:text-rv-text'}"
					onclick={() => (shipSortOrder = 'oldest')}
				>
					Oldest
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
			<div class="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] content-start gap-4">
				{#each filteredItems as { item, index } (item.submissionId)}
					{@const activeOtherClaim =
						item.claim && !item.claim.isMine && !item.claim.isStale
							? item.claim
							: null}
					<button
						class="flex flex-col gap-1.5 p-5 bg-rv-surface border rounded-[10px] cursor-pointer transition-all duration-150 text-left font-inherit color-inherit hover:bg-rv-surface2 {activeOtherClaim ? 'border-yellow-500/50 hover:border-yellow-500' : 'border-rv-border hover:border-rv-accent'}"
						onclick={() => onSelect(index)}
						title={activeOtherClaim ? `Currently being reviewed by ${activeOtherClaim.firstName} ${activeOtherClaim.lastName}` : undefined}
					>
						<p class="text-[15px] font-semibold text-rv-text m-0">{item.project.projectTitle}</p>
						<p class="text-[13px] text-rv-dim m-0">
							{userLabel(item.project.user)}
						</p>
						<div class="flex items-center gap-1.5 flex-wrap mt-1">
							<span class="inline-block py-0.75 px-2.5 bg-rv-tag-bg text-rv-accent rounded-xl text-[11px]">{formatTypeName(item.project.projectType)}</span>
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
					</button>
				{:else}
					<p class="col-span-full text-center text-rv-dim py-6 text-sm">No projects match your filters.</p>
				{/each}
			</div>
		</section>

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
