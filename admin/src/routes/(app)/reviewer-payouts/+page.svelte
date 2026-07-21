<script lang="ts">
	import { onMount } from 'svelte';
	import { HandCoins, ChevronDown, ChevronRight } from 'lucide-svelte';
	import { api, type components } from '$lib/api';
	import { ensureUser } from '$lib/auth';
	import { TextField, Card } from '$lib/components';
	import { toast } from '$lib/toastStore';

	type ReviewerRow = components['schemas']['ReviewerPayoutSummaryResponse'];
	type HistoryEntry = components['schemas']['ReviewerPayoutHistoryEntryResponse'];

	let reviewers = $state<ReviewerRow[]>([]);
	let rateCutoff = $state<string | null>(null);
	let loading = $state(true);
	let loadError = $state<string | null>(null);
	let search = $state('');

	let currentUserRoles = $state<string[]>([]);
	const isSuperadmin = $derived(currentUserRoles.includes('superadmin'));

	// Per-row busy state so a slow request only disables its own row's controls.
	let flagBusy = $state<{ userId: number; flag: 'payouts' | 'boosted' } | null>(null);
	let payingUserId = $state<number | null>(null);

	// Expanded payout history, lazily fetched once per reviewer.
	let expandedUserId = $state<number | null>(null);
	let historyByUser = $state<Record<number, HistoryEntry[]>>({});
	let historyLoadingUserId = $state<number | null>(null);

	const filteredReviewers = $derived(
		search.trim()
			? reviewers.filter((r) => {
					const q = search.trim().toLowerCase();
					return (
						`${r.firstName} ${r.lastName}`.toLowerCase().includes(q) ||
						String(r.userId).includes(q)
					);
				})
			: reviewers,
	);

	async function loadReviewers() {
		loading = true;
		loadError = null;
		const { data, error } = await api.GET('/api/admin/reviewer-payouts');
		if (error || !data) {
			loadError = 'Failed to load reviewers';
			loading = false;
			return;
		}
		reviewers = data.reviewers;
		rateCutoff = data.rateCutoff;
		loading = false;
	}

	onMount(async () => {
		const user = await ensureUser();
		currentUserRoles = user?.roles ?? [];
		await loadReviewers();
	});

	function setRow(userId: number, patch: Partial<ReviewerRow>) {
		reviewers = reviewers.map((r) => (r.userId === userId ? { ...r, ...patch } : r));
	}

	async function toggleFlag(row: ReviewerRow, flag: 'payouts' | 'boosted') {
		if (!isSuperadmin || flagBusy) return;
		const current = flag === 'payouts' ? row.payoutsEnabled : row.boostedRateEnabled;
		const body =
			flag === 'payouts' ? { payoutsEnabled: !current } : { boostedRateEnabled: !current };
		// Optimistic flip; the boosted flag changes the rate plan so owed hours
		// are refreshed from the server after the write instead of guessed.
		setRow(row.userId, flag === 'payouts' ? { payoutsEnabled: !current } : { boostedRateEnabled: !current });
		flagBusy = { userId: row.userId, flag };
		try {
			const { data, error } = await api.PUT('/api/admin/reviewer-payouts/{userId}/flags', {
				params: { path: { userId: row.userId } },
				body,
			});
			if (error) throw error;
			if (data) {
				setRow(row.userId, {
					payoutsEnabled: data.payoutsEnabled,
					boostedRateEnabled: data.boostedRateEnabled,
				});
				if (flag === 'boosted') await loadReviewers();
			}
		} catch (err) {
			console.error('Failed to update payout flags:', err);
			setRow(row.userId, flag === 'payouts' ? { payoutsEnabled: current } : { boostedRateEnabled: current });
			toast.error('Failed to update flags');
		} finally {
			flagBusy = null;
		}
	}

	async function payOut(row: ReviewerRow) {
		if (!isSuperadmin || payingUserId !== null) return;
		const ratePlan = row.boostedRateEnabled
			? '1h/15 pre-cutoff + 1h/5 post-cutoff'
			: '1h/15 for all reviews';
		const confirmed =
			typeof window !== 'undefined'
				? window.confirm(
						`Pay ${row.owedHours}h to ${row.firstName} ${row.lastName} (#${row.userId})?\n\nUnpaid reviews: ${row.unpaidBefore} pre-cutoff + ${row.unpaidAfter} post-cutoff\nRate plan: ${ratePlan}\n\nThis creates an AdminAdjustment ledger transaction.`,
					)
				: true;
		if (!confirmed) return;

		payingUserId = row.userId;
		try {
			const result = await api.POST('/api/admin/reviewer-payouts/{userId}/payout', {
				params: { path: { userId: row.userId } },
				body: { expectedHours: row.owedHours },
			});
			const { data, error } = result;
			// Only 201 is in the OpenAPI spec, so `error` is typed never — go
			// through the raw Response for the 409 stale-counts case.
			const status = (result.response as Response | undefined)?.status;
			if (error) {
				if (status === 409) {
					toast.error('Review counts changed since the page loaded — refreshing');
					await loadReviewers();
				} else {
					toast.error((error as any)?.message || 'Payout failed');
				}
				return;
			}
			if (data) {
				toast.success(
					`Paid ${data.hours}h for ${data.reviewsCountedBefore + data.reviewsCountedAfter} reviews (txn #${data.transactionId})`,
				);
				// Drop the cached history so the next expand refetches with this payout.
				const { [row.userId]: _dropped, ...rest } = historyByUser;
				historyByUser = rest;
				await loadReviewers();
			}
		} catch (err) {
			console.error('Payout failed:', err);
			toast.error('Payout failed');
		} finally {
			payingUserId = null;
		}
	}

	async function toggleHistory(userId: number) {
		if (expandedUserId === userId) {
			expandedUserId = null;
			return;
		}
		expandedUserId = userId;
		if (historyByUser[userId]) return;
		historyLoadingUserId = userId;
		try {
			const { data, error } = await api.GET(
				'/api/admin/reviewer-payouts/{userId}/history',
				{ params: { path: { userId } } },
			);
			if (error) throw error;
			if (data) historyByUser = { ...historyByUser, [userId]: data.payouts };
		} catch (err) {
			console.error('Failed to load payout history:', err);
			toast.error('Failed to load payout history');
		} finally {
			historyLoadingUserId = null;
		}
	}

	function fmtDate(value: string | null | undefined): string {
		if (!value) return '—';
		return new Date(value).toLocaleString(undefined, {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
			hour: 'numeric',
			minute: '2-digit',
		});
	}
</script>

<svelte:head>
	<title>Reviewer Payouts · Horizons Admin</title>
</svelte:head>

<div class="space-y-4 p-6">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<div>
			<h1 class="flex items-center gap-2 text-xl font-bold text-ds-text">
				<HandCoins size={20} />
				Reviewer Payouts
			</h1>
			<p class="mt-1 text-sm text-ds-text-secondary">
				1h per 15 reviews. The boosted flag pays 1h per 5 for reviews on/after
				{rateCutoff ? fmtDate(rateCutoff) : 'July 13, 2026 (00:00 ET)'}. Whole blocks only —
				leftovers carry over. Rate is applied at payout time from the current flags.
			</p>
		</div>
		<TextField class="w-64" placeholder="Filter by name or user ID…" bind:value={search} />
	</div>

	{#if !isSuperadmin && !loading}
		<Card class="border-amber-500/40 bg-amber-500/5 p-3 text-sm text-ds-text-secondary">
			You can view payout status, but toggling flags and paying out requires superadmin.
		</Card>
	{/if}

	{#if loadError}
		<Card class="p-4 text-sm text-ds-red">{loadError}</Card>
	{:else}
		<div
			class="overflow-x-auto rounded-lg border border-ds-border bg-ds-surface shadow-[var(--color-ds-shadow)]"
		>
			<table class="w-full text-sm">
				<thead>
					<tr
						class="border-b border-ds-border bg-ds-surface2/50 text-left text-[11px] uppercase tracking-wide text-ds-text-secondary"
					>
						<th class="px-3 py-2 font-semibold">Reviewer</th>
						<th class="px-3 py-2 text-right font-semibold">Pre-cutoff (unpaid)</th>
						<th class="px-3 py-2 text-right font-semibold">Post-cutoff (unpaid)</th>
						<th class="px-3 py-2 text-right font-semibold">Carryover</th>
						<th class="px-3 py-2 text-right font-semibold">Owed</th>
						<th class="px-3 py-2 text-right font-semibold">Paid</th>
						<th class="px-3 py-2 font-semibold">Last payout</th>
						<th class="px-3 py-2 text-center font-semibold">Payouts</th>
						<th class="px-3 py-2 text-center font-semibold">1h/5 rate</th>
						<th class="px-3 py-2 text-right font-semibold">Actions</th>
					</tr>
				</thead>
				<tbody>
					{#if loading}
						<tr>
							<td colspan="10" class="px-3 py-8 text-center text-sm text-ds-text-secondary">
								Loading reviewers…
							</td>
						</tr>
					{:else if filteredReviewers.length === 0}
						<tr>
							<td colspan="10" class="px-3 py-8 text-center text-sm text-ds-text-secondary">
								{reviewers.length === 0
									? 'No reviews recorded yet.'
									: 'No reviewers match the filter.'}
							</td>
						</tr>
					{:else}
						{#each filteredReviewers as row (row.userId)}
							<tr class="border-b border-ds-border-divider last:border-b-0">
								<td class="px-3 py-2">
									<button
										class="flex items-center gap-1 text-left font-medium text-ds-text hover:text-ds-link"
										onclick={() => toggleHistory(row.userId)}
									>
										{#if expandedUserId === row.userId}
											<ChevronDown size={14} />
										{:else}
											<ChevronRight size={14} />
										{/if}
										{row.firstName}
										{row.lastName}
										<span class="text-xs text-ds-text-secondary">#{row.userId}</span>
									</button>
								</td>
								<td class="px-3 py-2 text-right tabular-nums">
									{row.reviewsBeforeCutoff}
									<span class="text-xs text-ds-text-secondary">({row.unpaidBefore} unpaid)</span>
								</td>
								<td class="px-3 py-2 text-right tabular-nums">
									{row.reviewsAfterCutoff}
									<span class="text-xs text-ds-text-secondary">({row.unpaidAfter} unpaid)</span>
								</td>
								<td class="px-3 py-2 text-right tabular-nums text-ds-text-secondary">
									{row.carryover}
								</td>
								<td
									class="px-3 py-2 text-right font-semibold tabular-nums {row.owedHours > 0
										? 'text-ds-green'
										: 'text-ds-text-secondary'}"
								>
									{row.owedHours}h
								</td>
								<td class="px-3 py-2 text-right tabular-nums">{row.totalPaidHours}h</td>
								<td class="px-3 py-2 text-xs text-ds-text-secondary">
									{fmtDate(row.lastPayoutAt)}
								</td>
								<td class="px-3 py-2 text-center">
									<button
										class="rounded-full px-2 py-0.5 text-xs font-semibold {row.payoutsEnabled
											? 'bg-green-600/15 text-ds-green'
											: 'bg-ds-surface2 text-ds-text-secondary'} {isSuperadmin
											? 'cursor-pointer hover:opacity-80'
											: 'cursor-default'}"
										disabled={!isSuperadmin ||
											(flagBusy?.userId === row.userId && flagBusy.flag === 'payouts')}
										title={isSuperadmin
											? 'Toggle whether this reviewer can be paid out'
											: 'Superadmin only'}
										onclick={() => toggleFlag(row, 'payouts')}
									>
										{row.payoutsEnabled ? 'Enabled' : 'Disabled'}
									</button>
								</td>
								<td class="px-3 py-2 text-center">
									<button
										class="rounded-full px-2 py-0.5 text-xs font-semibold {row.boostedRateEnabled
											? 'bg-purple-600/15 text-purple-600 dark:text-purple-300'
											: 'bg-ds-surface2 text-ds-text-secondary'} {isSuperadmin
											? 'cursor-pointer hover:opacity-80'
											: 'cursor-default'}"
										disabled={!isSuperadmin ||
											(flagBusy?.userId === row.userId && flagBusy.flag === 'boosted')}
										title={isSuperadmin
											? 'Toggle the boosted 1h/5 rate for post-cutoff reviews'
											: 'Superadmin only'}
										onclick={() => toggleFlag(row, 'boosted')}
									>
										{row.boostedRateEnabled ? '1h/5 on' : '1h/15'}
									</button>
								</td>
								<td class="px-3 py-2 text-right">
									{#if isSuperadmin}
										<button
											class="rounded-lg border border-ds-border px-3 py-1 text-xs font-semibold {row.payoutsEnabled &&
											row.owedHours > 0
												? 'bg-green-600/10 text-ds-green hover:bg-green-600/20'
												: 'cursor-not-allowed text-ds-text-placeholder'}"
											disabled={!row.payoutsEnabled ||
												row.owedHours === 0 ||
												payingUserId !== null}
											onclick={() => payOut(row)}
										>
											{payingUserId === row.userId ? 'Paying…' : `Pay ${row.owedHours}h`}
										</button>
									{:else}
										<span class="text-xs text-ds-text-placeholder">—</span>
									{/if}
								</td>
							</tr>
							{#if expandedUserId === row.userId}
								<tr class="border-b border-ds-border-divider bg-ds-surface2/30 last:border-b-0">
									<td colspan="10" class="px-6 py-3">
										{#if historyLoadingUserId === row.userId}
											<p class="text-xs text-ds-text-secondary">Loading payout history…</p>
										{:else if (historyByUser[row.userId] ?? []).length === 0}
											<p class="text-xs text-ds-text-secondary">No payouts yet.</p>
										{:else}
											<ul class="space-y-1">
												{#each historyByUser[row.userId] as p (p.payoutId)}
													<li class="flex flex-wrap items-center gap-2 text-xs text-ds-text">
														<span class="font-semibold tabular-nums">{p.hours}h</span>
														<span class="text-ds-text-secondary">
															{p.reviewsCountedBefore + p.reviewsCountedAfter} reviews
															({p.reviewsCountedBefore} pre + {p.reviewsCountedAfter} post)
														</span>
														<span
															class="rounded-full px-1.5 py-0.5 text-[10px] font-semibold {p.boostedRateApplied
																? 'bg-purple-600/15 text-purple-600 dark:text-purple-300'
																: 'bg-ds-surface2 text-ds-text-secondary'}"
														>
															{p.boostedRateApplied ? 'boosted' : 'base rate'}
														</span>
														{#if p.refunded}
															<span
																class="rounded-full bg-red-600/15 px-1.5 py-0.5 text-[10px] font-semibold text-ds-red"
															>
																Refunded
															</span>
														{/if}
														<span class="text-ds-text-secondary">
															txn #{p.transactionId} · by admin #{p.createdByUserId} ·
															{fmtDate(p.createdAt)}
														</span>
													</li>
												{/each}
											</ul>
										{/if}
									</td>
								</tr>
							{/if}
						{/each}
					{/if}
				</tbody>
			</table>
		</div>
	{/if}
</div>
