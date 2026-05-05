<script lang="ts">
	import { onMount } from 'svelte';
	import { Button, TextField, Tab } from '$lib/components';

	type Kind = 'ShopItem' | 'EventRsvp' | 'EventTicket';

	interface LedgerEntry {
		transactionId: number;
		kind: Kind;
		itemDescription: string;
		cost: number;
		isFulfilled: boolean;
		fulfilledAt: string | null;
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
		rsvpCount: number;
		ticketCount: number;
	}

	let entries = $state<LedgerEntry[]>([]);
	let summary = $state<LedgerSummary | null>(null);
	let loading = $state(true);
	let error = $state<string | null>(null);

	let kindFilter = $state<'all' | Kind>('all');
	let fulfilledFilter = $state<'all' | 'fulfilled' | 'unfulfilled'>('all');
	let search = $state('');

	const kindTabs = [
		{ label: 'All', value: 'all' },
		{ label: 'Shop', value: 'ShopItem' },
		{ label: 'RSVPs', value: 'EventRsvp' },
		{ label: 'Tickets', value: 'EventTicket' },
	];

	const fulfilledTabs = [
		{ label: 'All', value: 'all' },
		{ label: 'Fulfilled', value: 'fulfilled' },
		{ label: 'Unfulfilled', value: 'unfulfilled' },
	];

	async function loadLedger() {
		loading = true;
		error = null;
		try {
			const params = new URLSearchParams();
			if (kindFilter !== 'all') params.set('kind', kindFilter);
			if (fulfilledFilter === 'fulfilled') params.set('fulfilled', 'true');
			else if (fulfilledFilter === 'unfulfilled') params.set('fulfilled', 'false');
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
		if (k === 'EventRsvp') return 'RSVP';
		return 'Ticket';
	}

	function kindColor(k: Kind): string {
		if (k === 'ShopItem')
			return 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200 border-blue-300/50 dark:border-blue-700/50';
		if (k === 'EventRsvp')
			return 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200 border-amber-300/50 dark:border-amber-700/50';
		return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200 border-emerald-300/50 dark:border-emerald-700/50';
	}

	function targetLabel(e: LedgerEntry): string {
		if (e.event) return `${e.event.title}`;
		if (e.item) return e.item.name;
		return e.itemDescription;
	}
</script>

<div class="p-6">
	<div class="mx-auto max-w-7xl space-y-6">
		<div class="flex items-baseline justify-between gap-4">
			<h1 class="text-2xl font-semibold text-ds-text">Transactions</h1>
			<p class="text-xs text-ds-text-secondary">
				Unified ledger of shop purchases, RSVPs, and tickets
			</p>
		</div>

		{#if summary}
			<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
				<div class="space-y-1 rounded-lg border border-ds-border bg-ds-surface p-4 shadow-[var(--color-ds-shadow)]">
					<p class="text-[11px] font-semibold uppercase tracking-wide text-ds-text-secondary">All Transactions</p>
					<p class="text-2xl font-bold text-ds-text">{summary.totalCount}</p>
					<p class="text-[11px] text-ds-text-secondary">{summary.totalSpent}h spent total</p>
				</div>
				<div class="space-y-1 rounded-lg border border-ds-border bg-ds-surface p-4 shadow-[var(--color-ds-shadow)]">
					<p class="text-[11px] font-semibold uppercase tracking-wide text-ds-text-secondary">Shop Purchases</p>
					<p class="text-2xl font-bold text-ds-text">{summary.shopCount}</p>
				</div>
				<div class="space-y-1 rounded-lg border border-ds-border bg-ds-surface p-4 shadow-[var(--color-ds-shadow)]">
					<p class="text-[11px] font-semibold uppercase tracking-wide text-ds-text-secondary">Event RSVPs</p>
					<p class="text-2xl font-bold text-ds-text">{summary.rsvpCount}</p>
				</div>
				<div class="space-y-1 rounded-lg border border-ds-border bg-ds-surface p-4 shadow-[var(--color-ds-shadow)]">
					<p class="text-[11px] font-semibold uppercase tracking-wide text-ds-text-secondary">Event Tickets</p>
					<p class="text-2xl font-bold text-ds-text">{summary.ticketCount}</p>
				</div>
			</div>
		{/if}

		<div class="space-y-3 rounded-lg border border-ds-border bg-ds-surface p-4 shadow-[var(--color-ds-shadow)]">
			<div class="grid gap-3 md:grid-cols-3">
				<div class="space-y-1">
					<p class="text-[11px] font-semibold uppercase tracking-wide text-ds-text-secondary">Kind</p>
					<Tab items={kindTabs} bind:value={kindFilter} />
				</div>
				<div class="space-y-1">
					<p class="text-[11px] font-semibold uppercase tracking-wide text-ds-text-secondary">Fulfillment</p>
					<Tab items={fulfilledTabs} bind:value={fulfilledFilter} />
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
					</tr>
				</thead>
				<tbody>
					{#if loading && entries.length === 0}
						<tr>
							<td colspan="8" class="px-3 py-8 text-center text-sm text-ds-text-secondary">Loading transactions…</td>
						</tr>
					{:else if filteredEntries.length === 0}
						<tr>
							<td colspan="8" class="px-3 py-8 text-center text-sm text-ds-text-secondary">No transactions match the current filters.</td>
						</tr>
					{:else}
						{#each filteredEntries as e (e.transactionId)}
							<tr class="border-b border-ds-border/60 hover:bg-ds-surface2/30">
								<td class="px-3 py-2 font-mono text-xs text-ds-text-secondary">#{e.transactionId}</td>
								<td class="px-3 py-2">
									<span class="inline-flex items-center rounded border px-2 py-0.5 text-[11px] font-medium {kindColor(e.kind)}">
										{kindLabel(e.kind)}
									</span>
								</td>
								<td class="px-3 py-2 text-ds-text">
									<div class="font-medium">{e.user.firstName} {e.user.lastName}</div>
									<div class="text-xs text-ds-text-secondary">{e.user.email}</div>
								</td>
								<td class="px-3 py-2 text-ds-text">{targetLabel(e)}</td>
								<td class="px-3 py-2 text-ds-text-secondary">{e.itemDescription}</td>
								<td class="px-3 py-2 text-right font-mono text-ds-text">{e.cost}h</td>
								<td class="px-3 py-2">
									{#if e.isFulfilled}
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
							</tr>
						{/each}
					{/if}
				</tbody>
			</table>
		</div>
	</div>
</div>
