<script lang="ts">
	import { onMount } from 'svelte';
	import { Button, TextField, Tab, Card } from '$lib/components';
	import { api } from '$lib/api';

	type Kind = 'ShopItem' | 'EventTicket' | 'AdminAdjustment';

	interface LedgerEntry {
		transactionId: number;
		kind: Kind;
		itemDescription: string;
		cost: number;
		isFulfilled: boolean;
		fulfilledAt: string | null;
		refundedAt: string | null;
		createdAt: string;
		user: {
			userId: number;
			email: string;
			firstName: string;
			lastName: string;
		};
		item: { itemId: number; name: string } | null;
		event: { eventId: number; slug: string; title: string } | null;
	}

	interface LedgerSummary {
		totalCount: number;
		totalSpent: number;
		shopCount: number;
		ticketCount: number;
		adminAdjustmentCount: number;
	}

	interface UserGroup {
		user: LedgerEntry['user'];
		entries: LedgerEntry[];
		totalCost: number;
		fulfilledCount: number;
		pendingCount: number;
		refundedCount: number;
	}

	let entries = $state<LedgerEntry[]>([]);
	let summary = $state<LedgerSummary | null>(null);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let refundingId = $state<number | null>(null);
	let fulfillingId = $state<number | null>(null);
	let actionError = $state<string | null>(null);

	let kindFilter = $state<'all' | Kind>('all');
	let fulfilledFilter = $state<'all' | 'fulfilled' | 'unfulfilled'>('all');
	let refundedFilter = $state<'all' | 'hide' | 'only'>('all');
	let search = $state('');
	let viewMode = $state<'flat' | 'by-user'>('flat');

	const kindTabs = [
		{ label: 'All', value: 'all' },
		{ label: 'Shop', value: 'ShopItem' },
		{ label: 'Tickets', value: 'EventTicket' },
		{ label: 'Admin Adj', value: 'AdminAdjustment' },
	];

	const fulfilledTabs = [
		{ label: 'All', value: 'all' },
		{ label: 'Fulfilled', value: 'fulfilled' },
		{ label: 'Unfulfilled', value: 'unfulfilled' },
	];

	const refundedTabs = [
		{ label: 'All', value: 'all' },
		{ label: 'Hide refunded', value: 'hide' },
		{ label: 'Only refunded', value: 'only' },
	];

	const viewTabs = [
		{ label: 'Flat', value: 'flat' },
		{ label: 'By User', value: 'by-user' },
	];

	async function loadLedger() {
		loading = true;
		error = null;
		try {
			const params = new URLSearchParams();
			if (kindFilter !== 'all') params.set('kind', kindFilter);
			if (fulfilledFilter === 'fulfilled') params.set('fulfilled', 'true');
			else if (fulfilledFilter === 'unfulfilled') params.set('fulfilled', 'false');
			if (refundedFilter === 'hide') params.set('refunded', 'false');
			else if (refundedFilter === 'only') params.set('refunded', 'true');
			params.set('limit', '500');

			const resp = await fetch(`/api/admin/transactions?${params.toString()}`, {
				credentials: 'include',
			});
			if (!resp.ok) throw new Error(`Failed to load transactions (${resp.status})`);
			const data = await resp.json();
			entries = data.entries;
			summary = data.summary;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load';
		} finally {
			loading = false;
		}
	}

	onMount(loadLedger);

	$effect(() => {
		kindFilter;
		fulfilledFilter;
		refundedFilter;
		loadLedger();
	});

	const filteredEntries = $derived(
		search.trim() === ''
			? entries
			: entries.filter((e) => {
					const q = search.toLowerCase();
					return (
						e.user.email.toLowerCase().includes(q) ||
						`${e.user.firstName} ${e.user.lastName}`.toLowerCase().includes(q) ||
						e.itemDescription.toLowerCase().includes(q) ||
						e.event?.slug.toLowerCase().includes(q) ||
						e.event?.title.toLowerCase().includes(q) ||
						e.item?.name.toLowerCase().includes(q) ||
						String(e.transactionId).includes(q)
					);
				}),
	);

	const filteredSpent = $derived(
		Math.round(filteredEntries.reduce((s, e) => s + e.cost, 0) * 10) / 10,
	);

	const entriesByUser = $derived.by(() => {
		const grouped = new Map<number, UserGroup>();
		for (const e of filteredEntries) {
			let group = grouped.get(e.user.userId);
			if (!group) {
				group = {
					user: e.user,
					entries: [],
					totalCost: 0,
					fulfilledCount: 0,
					pendingCount: 0,
					refundedCount: 0,
				};
				grouped.set(e.user.userId, group);
			}
			group.entries.push(e);
			group.totalCost += e.cost;
			if (e.refundedAt) group.refundedCount++;
			else if (e.isFulfilled) group.fulfilledCount++;
			else if (e.kind === 'ShopItem') group.pendingCount++;
		}
		return Array.from(grouped.values()).sort((a, b) => b.totalCost - a.totalCost);
	});

	function formatDateTime(d: string): string {
		const date = new Date(d);
		return date.toLocaleString(undefined, {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit',
		});
	}

	function kindLabel(k: Kind): string {
		if (k === 'ShopItem') return 'Shop';
		if (k === 'AdminAdjustment') return 'Admin Adj';
		return 'Ticket';
	}

	function kindColor(k: Kind): string {
		if (k === 'ShopItem')
			return 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200 border-blue-300/50 dark:border-blue-700/50';
		if (k === 'AdminAdjustment')
			return 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-200 border-purple-300/50 dark:border-purple-700/50';
		return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200 border-emerald-300/50 dark:border-emerald-700/50';
	}

	function targetLabel(e: LedgerEntry): string {
		if (e.event) return `${e.event.title}`;
		if (e.item) return e.item.name;
		if (e.kind === 'AdminAdjustment') return e.cost < 0 ? 'Hours awarded' : 'Hours deducted';
		return e.itemDescription;
	}

	async function handleRefund(e: LedgerEntry) {
		const target = targetLabel(e);
		const balanceEffect =
			e.cost > 0
				? `Reversing this returns ${e.cost}h to the user (their balance increases).`
				: `Reversing this removes the ${-e.cost}h that was awarded (their balance decreases).`;
		const ok =
			typeof window !== 'undefined'
				? window.confirm(
						`${e.kind === 'AdminAdjustment' ? 'Reverse' : 'Refund'} this transaction?\n\n` +
							`User: ${e.user.firstName} ${e.user.lastName} (${e.user.email})\n` +
							`${kindLabel(e.kind)}: ${target}\n` +
							`Cost: ${e.cost}h\n\n` +
							balanceEffect,
					)
				: true;
		if (!ok) return;

		refundingId = e.transactionId;
		actionError = null;
		try {
			const { error: err } = await api.DELETE('/api/shop/admin/transactions/{id}', {
				params: { path: { id: e.transactionId } },
			});
			if (err) {
				actionError =
					err && typeof err === 'object' && 'message' in err
						? String((err as { message: unknown }).message)
						: 'Refund failed';
				return;
			}
			const refundedAt = new Date().toISOString();
			entries = entries.map((row) =>
				row.transactionId === e.transactionId ? { ...row, refundedAt } : row,
			);
		} catch (err) {
			actionError = err instanceof Error ? err.message : 'Refund failed';
		} finally {
			refundingId = null;
		}
	}

	async function handleFulfill(e: LedgerEntry) {
		fulfillingId = e.transactionId;
		actionError = null;
		try {
			const { error: err } = await api.PUT('/api/shop/admin/transactions/{id}/fulfill', {
				params: { path: { id: e.transactionId } },
			});
			if (err) {
				actionError =
					err && typeof err === 'object' && 'message' in err
						? String((err as { message: unknown }).message)
						: 'Fulfill failed';
				return;
			}
			const fulfilledAt = new Date().toISOString();
			entries = entries.map((row) =>
				row.transactionId === e.transactionId
					? { ...row, isFulfilled: true, fulfilledAt }
					: row,
			);
		} catch (err) {
			actionError = err instanceof Error ? err.message : 'Fulfill failed';
		} finally {
			fulfillingId = null;
		}
	}
</script>

<div class="p-6">
	<div class="mx-auto max-w-7xl space-y-6">
		<div class="flex items-baseline justify-between gap-4">
			<h1 class="text-2xl font-semibold text-ds-text">Transactions</h1>
			<p class="text-xs text-ds-text-secondary">
				Unified ledger of shop purchases and event tickets
			</p>
		</div>

		{#if summary}
			<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
				<div class="space-y-1 rounded-lg border border-ds-border bg-ds-surface p-4 shadow-[var(--color-ds-shadow)]">
					<p class="text-[11px] font-semibold uppercase tracking-wide text-ds-text-secondary">All Transactions</p>
					<p class="text-2xl font-bold text-ds-text">{summary.totalCount}</p>
					<p class="text-[11px] text-ds-text-secondary">{summary.totalSpent}h net total</p>
				</div>
				<div class="space-y-1 rounded-lg border border-ds-border bg-ds-surface p-4 shadow-[var(--color-ds-shadow)]">
					<p class="text-[11px] font-semibold uppercase tracking-wide text-ds-text-secondary">Shop Purchases</p>
					<p class="text-2xl font-bold text-ds-text">{summary.shopCount}</p>
				</div>
				<div class="space-y-1 rounded-lg border border-ds-border bg-ds-surface p-4 shadow-[var(--color-ds-shadow)]">
					<p class="text-[11px] font-semibold uppercase tracking-wide text-ds-text-secondary">Event Tickets</p>
					<p class="text-2xl font-bold text-ds-text">{summary.ticketCount}</p>
				</div>
				<div class="space-y-1 rounded-lg border border-ds-border bg-ds-surface p-4 shadow-[var(--color-ds-shadow)]">
					<p class="text-[11px] font-semibold uppercase tracking-wide text-ds-text-secondary">Admin Adjustments</p>
					<p class="text-2xl font-bold text-ds-text">{summary.adminAdjustmentCount}</p>
				</div>
			</div>
		{/if}

		{#if actionError}
			<div class="flex items-center justify-between gap-3 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-700 dark:bg-red-900/20 dark:text-red-200">
				<span>{actionError}</span>
				<button class="text-xs underline" onclick={() => (actionError = null)}>Dismiss</button>
			</div>
		{/if}

		<div class="space-y-3 rounded-lg border border-ds-border bg-ds-surface p-4 shadow-[var(--color-ds-shadow)]">
			<div class="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
				<div class="space-y-1">
					<p class="text-[11px] font-semibold uppercase tracking-wide text-ds-text-secondary">View</p>
					<Tab items={viewTabs} bind:value={viewMode} />
				</div>
				<div class="space-y-1">
					<p class="text-[11px] font-semibold uppercase tracking-wide text-ds-text-secondary">Kind</p>
					<Tab items={kindTabs} bind:value={kindFilter} />
				</div>
				<div class="space-y-1">
					<p class="text-[11px] font-semibold uppercase tracking-wide text-ds-text-secondary">Fulfillment</p>
					<Tab items={fulfilledTabs} bind:value={fulfilledFilter} />
				</div>
				<div class="space-y-1">
					<p class="text-[11px] font-semibold uppercase tracking-wide text-ds-text-secondary">Refunded</p>
					<Tab items={refundedTabs} bind:value={refundedFilter} />
				</div>
				<div class="space-y-1">
					<label class="text-[11px] font-semibold uppercase tracking-wide text-ds-text-secondary" for="ledger-search">Search</label>
					<TextField id="ledger-search" placeholder="email, name, description, slug, txn id" bind:value={search} />
				</div>
			</div>
			<div class="flex items-center justify-between">
				<p class="text-xs text-ds-text-secondary">
					Showing {filteredEntries.length} of {entries.length} (filtered total: {filteredSpent}h)
				</p>
				<Button onclick={loadLedger} disabled={loading}>
					{loading ? 'Loading…' : 'Refresh'}
				</Button>
			</div>
		</div>

		{#if error}
			<div class="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800 dark:border-red-700 dark:bg-red-900/20 dark:text-red-200">
				{error}
			</div>
		{/if}

		{#snippet ledgerRow(e: LedgerEntry, showUser: boolean)}
			<tr class="border-b border-ds-border/60 hover:bg-ds-surface2/30">
				<td class="px-3 py-2 font-mono text-xs text-ds-text-secondary">#{e.transactionId}</td>
				<td class="px-3 py-2">
					<span class="inline-flex items-center rounded border px-2 py-0.5 text-[11px] font-medium {kindColor(e.kind)}">
						{kindLabel(e.kind)}
					</span>
				</td>
				{#if showUser}
					<td class="px-3 py-2 text-ds-text">
						<div class="font-medium">{e.user.firstName} {e.user.lastName}</div>
						<div class="text-xs text-ds-text-secondary">{e.user.email}</div>
					</td>
				{/if}
				<td class="px-3 py-2 text-ds-text">{targetLabel(e)}</td>
				<td class="px-3 py-2 text-ds-text-secondary">{e.itemDescription}</td>
				<td class="px-3 py-2 text-right font-mono text-ds-text">{e.cost}h</td>
				<td class="px-3 py-2">
					{#if e.refundedAt}
						<span class="text-xs text-red-700 dark:text-red-300">Refunded</span>
						<div class="text-[10px] text-ds-text-secondary">{formatDateTime(e.refundedAt)}</div>
					{:else if e.isFulfilled}
						<span class="text-xs text-green-700 dark:text-green-300">Fulfilled</span>
						{#if e.fulfilledAt}
							<div class="text-[10px] text-ds-text-secondary">{formatDateTime(e.fulfilledAt)}</div>
						{/if}
					{:else if e.kind === 'ShopItem'}
						<span class="text-xs text-amber-700 dark:text-amber-300">Pending</span>
					{:else}
						<span class="text-xs text-ds-text-secondary">—</span>
					{/if}
				</td>
				<td class="px-3 py-2 text-xs text-ds-text-secondary">{formatDateTime(e.createdAt)}</td>
				<td class="px-3 py-2 text-right">
					{#if e.refundedAt}
						<span class="text-[11px] text-ds-text-placeholder">—</span>
					{:else}
						<div class="flex items-center justify-end gap-1.5">
							{#if e.kind === 'ShopItem' && !e.isFulfilled}
								<button
									class="rounded border border-green-300 bg-green-50 px-2 py-0.5 text-[11px] font-medium text-green-700 hover:bg-green-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-green-700/50 dark:bg-green-900/30 dark:text-green-200 dark:hover:bg-green-900/50"
									onclick={() => handleFulfill(e)}
									disabled={fulfillingId === e.transactionId}
								>
									{fulfillingId === e.transactionId ? 'Fulfilling…' : 'Fulfill'}
								</button>
							{/if}
							<button
								class="rounded border border-red-300 bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-700/50 dark:bg-red-900/30 dark:text-red-200 dark:hover:bg-red-900/50"
								onclick={() => handleRefund(e)}
								disabled={refundingId === e.transactionId}
							>
								{refundingId === e.transactionId ? 'Refunding…' : 'Refund'}
							</button>
						</div>
					{/if}
				</td>
			</tr>
		{/snippet}

		{#if viewMode === 'flat'}
			<div class="overflow-x-auto rounded-lg border border-ds-border bg-ds-surface shadow-[var(--color-ds-shadow)]">
				<table class="w-full text-sm">
					<thead>
						<tr class="border-b border-ds-border bg-ds-surface2/50 text-left text-[11px] uppercase tracking-wide text-ds-text-secondary">
							<th class="px-3 py-2 font-semibold">ID</th>
							<th class="px-3 py-2 font-semibold">Kind</th>
							<th class="px-3 py-2 font-semibold">User</th>
							<th class="px-3 py-2 font-semibold">Target</th>
							<th class="px-3 py-2 font-semibold">Description</th>
							<th class="px-3 py-2 text-right font-semibold">Cost</th>
							<th class="px-3 py-2 font-semibold">Status</th>
							<th class="px-3 py-2 font-semibold">Date</th>
							<th class="px-3 py-2 font-semibold text-right">Actions</th>
						</tr>
					</thead>
					<tbody>
						{#if loading && entries.length === 0}
							<tr>
								<td colspan="9" class="px-3 py-8 text-center text-sm text-ds-text-secondary">Loading transactions…</td>
							</tr>
						{:else if filteredEntries.length === 0}
							<tr>
								<td colspan="9" class="px-3 py-8 text-center text-sm text-ds-text-secondary">No transactions match the current filters.</td>
							</tr>
						{:else}
							{#each filteredEntries as e (e.transactionId)}
								{@render ledgerRow(e, true)}
							{/each}
						{/if}
					</tbody>
				</table>
			</div>
		{:else if loading && entries.length === 0}
			<div class="rounded-lg border border-ds-border bg-ds-surface p-8 text-center text-sm text-ds-text-secondary shadow-[var(--color-ds-shadow)]">
				Loading transactions…
			</div>
		{:else if entriesByUser.length === 0}
			<div class="rounded-lg border border-ds-border bg-ds-surface p-8 text-center text-sm text-ds-text-secondary shadow-[var(--color-ds-shadow)]">
				No transactions match the current filters.
			</div>
		{:else}
			<div class="space-y-4">
				{#each entriesByUser as group (group.user.userId)}
					<Card class="overflow-hidden">
						<div class="flex flex-wrap items-center justify-between gap-3 border-b border-ds-border bg-ds-surface2/50 px-4 py-3">
							<div>
								<div class="font-semibold text-ds-text">{group.user.firstName} {group.user.lastName}</div>
								<div class="text-xs text-ds-text-secondary">{group.user.email}</div>
							</div>
							<div class="flex gap-5 text-right text-xs">
								<div>
									<p class="text-ds-text-secondary">Transactions</p>
									<p class="text-base font-semibold text-ds-text">{group.entries.length}</p>
								</div>
								<div>
									<p class="text-ds-text-secondary">Net Cost</p>
									<p class="text-base font-semibold text-ds-text">{Math.round(group.totalCost * 10) / 10}h</p>
								</div>
								<div>
									<p class="text-ds-text-secondary">Status</p>
									<p class="text-sm font-medium">
										<span class="text-green-700 dark:text-green-300">{group.fulfilledCount} fulfilled</span>
										{#if group.pendingCount > 0}
											<span class="text-ds-text-placeholder"> / </span>
											<span class="text-amber-700 dark:text-amber-300">{group.pendingCount} pending</span>
										{/if}
										{#if group.refundedCount > 0}
											<span class="text-ds-text-placeholder"> / </span>
											<span class="text-red-700 dark:text-red-300">{group.refundedCount} refunded</span>
										{/if}
									</p>
								</div>
							</div>
						</div>
						<div class="overflow-x-auto">
							<table class="w-full text-sm">
								<thead>
									<tr class="border-b border-ds-border bg-ds-surface2/30 text-left text-[11px] uppercase tracking-wide text-ds-text-secondary">
										<th class="px-3 py-2 font-semibold">ID</th>
										<th class="px-3 py-2 font-semibold">Kind</th>
										<th class="px-3 py-2 font-semibold">Target</th>
										<th class="px-3 py-2 font-semibold">Description</th>
										<th class="px-3 py-2 text-right font-semibold">Cost</th>
										<th class="px-3 py-2 font-semibold">Status</th>
										<th class="px-3 py-2 font-semibold">Date</th>
										<th class="px-3 py-2 font-semibold text-right">Actions</th>
									</tr>
								</thead>
								<tbody>
									{#each group.entries as e (e.transactionId)}
										{@render ledgerRow(e, false)}
									{/each}
								</tbody>
							</table>
						</div>
					</Card>
				{/each}
			</div>
		{/if}
	</div>
</div>
