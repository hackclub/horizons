<script lang="ts">
	import { onMount } from 'svelte';
	import { Button, TextField, Tab, Card, Select } from '$lib/components';
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
	let unfulfillingId = $state<number | null>(null);
	let actionError = $state<string | null>(null);

	let kindFilter = $state<'all' | Kind>('all');
	let fulfilledFilter = $state<'all' | 'fulfilled' | 'unfulfilled'>('all');
	let refundedFilter = $state<'all' | 'hide' | 'only'>('all');
	let search = $state('');
	// Defaults to the by-user view focused on travel grants — the most common
	// reason to open this page is fulfilling travel grant purchases per user.
	let viewMode = $state<'flat' | 'by-user'>('by-user');
	// Item-level filter (shop items only, not variants). Only applied in the
	// by-user view so you can isolate which users purchased a given item.
	let itemFilter = $state<number | 'all'>('all');

	// On first load we auto-select the travel grant item (matched by name) so the
	// page lands directly on travel grant purchases. Tracked so we only apply the
	// default once — after that the admin's item choice is respected.
	const TRAVEL_GRANT_MATCH = 'travel grant';
	let appliedTravelGrantDefault = $state(false);

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

	// Distinct shop items present in the loaded ledger, for the item filter
	// dropdown. Variants are intentionally not surfaced — item-level only.
	const itemOptions = $derived.by(() => {
		const byId = new Map<number, string>();
		for (const e of entries) {
			if (e.item) byId.set(e.item.itemId, e.item.name);
		}
		return Array.from(byId, ([itemId, name]) => ({ itemId, name })).sort((a, b) =>
			a.name.localeCompare(b.name),
		);
	});

	// Apply the travel grant default once, as soon as items are loaded. If no
	// travel grant item is present in the loaded set we still mark it applied so
	// we don't keep re-selecting it as the admin navigates.
	$effect(() => {
		if (appliedTravelGrantDefault || itemOptions.length === 0) return;
		const tg = itemOptions.find((o) => o.name.toLowerCase().includes(TRAVEL_GRANT_MATCH));
		if (tg) itemFilter = tg.itemId;
		appliedTravelGrantDefault = true;
	});

	// Reset the item filter if the selected item is no longer in the loaded set
	// (e.g. after changing the kind filter away from shop purchases).
	$effect(() => {
		if (itemFilter !== 'all' && !itemOptions.some((o) => o.itemId === itemFilter)) {
			itemFilter = 'all';
		}
	});

	const filteredEntries = $derived.by(() => {
		let result = entries;
		// The item filter only applies in the by-user view.
		if (viewMode === 'by-user' && itemFilter !== 'all') {
			result = result.filter((e) => e.item?.itemId === itemFilter);
		}
		const q = search.trim().toLowerCase();
		if (q !== '') {
			result = result.filter(
				(e) =>
					e.user.email.toLowerCase().includes(q) ||
					`${e.user.firstName} ${e.user.lastName}`.toLowerCase().includes(q) ||
					e.itemDescription.toLowerCase().includes(q) ||
					e.event?.slug.toLowerCase().includes(q) ||
					e.event?.title.toLowerCase().includes(q) ||
					e.item?.name.toLowerCase().includes(q) ||
					String(e.transactionId).includes(q),
			);
		}
		return result;
	});

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

	// Event tickets each user currently holds, derived from the full loaded set
	// (not filteredEntries) so the ticket pill shows in the by-user header even
	// when the rows are filtered to a shop item like the travel grant. Refunded
	// tickets are excluded — the user no longer holds them.
	const ticketsByUser = $derived.by(() => {
		const byUser = new Map<number, { eventId: number; title: string }[]>();
		for (const e of entries) {
			if (e.kind !== 'EventTicket' || !e.event || e.refundedAt) continue;
			let list = byUser.get(e.user.userId);
			if (!list) {
				list = [];
				byUser.set(e.user.userId, list);
			}
			if (!list.some((t) => t.eventId === e.event!.eventId)) {
				list.push({ eventId: e.event.eventId, title: e.event.title });
			}
		}
		return byUser;
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

	async function handleUnfulfill(e: LedgerEntry) {
		unfulfillingId = e.transactionId;
		actionError = null;
		try {
			const { error: err } = await api.DELETE('/api/shop/admin/transactions/{id}/fulfill', {
				params: { path: { id: e.transactionId } },
			});
			if (err) {
				actionError =
					err && typeof err === 'object' && 'message' in err
						? String((err as { message: unknown }).message)
						: 'Unfulfill failed';
				return;
			}
			entries = entries.map((row) =>
				row.transactionId === e.transactionId
					? { ...row, isFulfilled: false, fulfilledAt: null }
					: row,
			);
		} catch (err) {
			actionError = err instanceof Error ? err.message : 'Unfulfill failed';
		} finally {
			unfulfillingId = null;
		}
	}
</script>

<div class="p-6">
	<div class="mx-auto max-w-7xl space-y-6">
		<div class="flex flex-wrap items-center justify-between gap-4">
			<div>
				<h1 class="text-2xl font-semibold text-ds-text">Transactions</h1>
				<p class="text-xs text-ds-text-secondary">
					Unified ledger of shop purchases and event tickets
				</p>
			</div>
			<div class="space-y-1">
				<p class="text-[11px] font-semibold uppercase tracking-wide text-ds-text-secondary">View</p>
				<Tab items={viewTabs} bind:value={viewMode} />
			</div>
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
			<div class="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
				{#if viewMode === 'by-user'}
					<div class="space-y-1">
						<label
							class="text-[11px] font-semibold uppercase tracking-wide text-ds-text-secondary"
							for="ledger-item">Item</label
						>
						<Select id="ledger-item" bind:value={itemFilter} class="w-full">
							<option value="all">All items</option>
							{#each itemOptions as opt (opt.itemId)}
								<option value={opt.itemId}>{opt.name}</option>
							{/each}
						</Select>
					</div>
				{/if}
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
							{:else if e.kind === 'ShopItem' && e.isFulfilled}
								<button
									class="rounded border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-amber-700/50 dark:bg-amber-900/30 dark:text-amber-200 dark:hover:bg-amber-900/50"
									onclick={() => handleUnfulfill(e)}
									disabled={unfulfillingId === e.transactionId}
								>
									{unfulfillingId === e.transactionId ? 'Unfulfilling…' : 'Unfulfill'}
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
								<div class="flex flex-wrap items-center gap-2">
									<span class="font-semibold text-ds-text">{group.user.firstName} {group.user.lastName}</span>
									{#each ticketsByUser.get(group.user.userId) ?? [] as ticket (ticket.eventId)}
										<span
											class="inline-flex items-center gap-1 rounded-full border border-emerald-300/50 bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-800 dark:border-emerald-700/50 dark:bg-emerald-900/40 dark:text-emerald-200"
											title="Holds an event ticket"
										>
											🎟 {ticket.title}
										</span>
									{/each}
								</div>
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
