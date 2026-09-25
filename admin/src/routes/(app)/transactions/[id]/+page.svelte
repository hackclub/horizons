<script lang="ts">
	import { base } from '$app/paths';
	import { page } from '$app/state';
	import { api, type components } from '$lib/api';
	import { Button } from '$lib/components';
	import NoteCard from '../../projects/[id]/NoteCard.svelte';

	type TransactionDetail = components['schemas']['AdminTransactionDetailResponse'];

	const transactionId = $derived(page.params.id);

	let txn = $state<TransactionDetail | null>(null);
	let loading = $state(true);
	let userNote = $state('');
	let notesLoading = $state(false);
	let error = $state<string | null>(null);
	let actionError = $state<string | null>(null);
	let refunding = $state(false);
	let fulfilling = $state(false);
	let unfulfilling = $state(false);
	// Navigating between transactions before a fetch settles must not let the
	// older response overwrite the newer page.
	let loadSequence = 0;

	// Recipient name on the user's primary HCA address; the account name until
	// the user's next login syncs it.
	const shipName = $derived.by(() => {
		if (!txn) return '';
		const u = txn.user;
		const parts =
			u.addressFirstName !== null ? [u.addressFirstName, u.addressLastName] : [u.firstName, u.lastName];
		return parts.filter(Boolean).join(' ');
	});

	async function load() {
		const seq = ++loadSequence;
		loading = true;
		error = null;
		try {
			const { data, error: err } = await api.GET('/api/admin/transactions/{id}', {
				params: { path: { id: Number(transactionId) } },
			});
			if (seq !== loadSequence) return;
			if (err || !data) throw new Error('Failed to load transaction');
			txn = data;
			void loadUserNote(data.user.userId, seq);
		} catch (err) {
			if (seq !== loadSequence) return;
			error = err instanceof Error ? err.message : 'Failed to load';
		} finally {
			if (seq === loadSequence) loading = false;
		}
	}

	async function loadUserNote(userId: number, seq: number) {
		notesLoading = true;
		try {
			const { data } = await api.GET('/api/reviewer/users/{id}/notes', {
				params: { path: { id: userId } },
			});
			if (seq !== loadSequence) return;
			userNote = data?.content ?? '';
		} catch {
			if (seq === loadSequence) userNote = '';
		} finally {
			if (seq === loadSequence) notesLoading = false;
		}
	}

	$effect(() => {
		transactionId;
		load();
	});

	function errMessage(err: unknown, fallback: string): string {
		return err && typeof err === 'object' && 'message' in err
			? String((err as { message: unknown }).message)
			: fallback;
	}

	function kindLabel(k: string): string {
		if (k === 'ShopItem') return 'Shop';
		if (k === 'AdminAdjustment') return 'Admin Adj';
		return 'Ticket';
	}

	function formatDateTime(d: string | null): string {
		if (!d) return '\u2014';
		return new Date(d).toLocaleString(undefined, {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit',
		});
	}

	async function handleFulfill() {
		if (!txn || txn.isFulfilled) return;
		fulfilling = true;
		actionError = null;
		try {
			const { error: err } = await api.PUT('/api/shop/admin/transactions/{id}/fulfill', {
				params: { path: { id: txn.transactionId } },
			});
			if (err) {
				actionError = errMessage(err, 'Fulfill failed');
				return;
			}
			txn = { ...txn, isFulfilled: true, fulfilledAt: new Date().toISOString() };
		} catch (err) {
			actionError = errMessage(err, 'Fulfill failed');
		} finally {
			fulfilling = false;
		}
	}

	async function handleUnfulfill() {
		if (!txn || !txn.isFulfilled) return;
		unfulfilling = true;
		actionError = null;
		try {
			const { error: err } = await api.DELETE('/api/shop/admin/transactions/{id}/fulfill', {
				params: { path: { id: txn.transactionId } },
			});
			if (err) {
				actionError = errMessage(err, 'Unfulfill failed');
				return;
			}
			txn = { ...txn, isFulfilled: false, fulfilledAt: null };
		} catch (err) {
			actionError = errMessage(err, 'Unfulfill failed');
		} finally {
			unfulfilling = false;
		}
	}

	async function handleRefund() {
		if (!txn || txn.refundedAt) return;
		const name = `${txn.user.firstName ?? ''} ${txn.user.lastName ?? ''}`.trim();
		const balanceEffect =
			txn.cost > 0
				? `Reversing this returns ${txn.cost}h to the user (their balance increases).`
				: `Reversing this removes the ${-txn.cost}h that was awarded (their balance decreases).`;
		const ok =
			typeof window !== 'undefined'
				? window.confirm(
						`${txn.kind === 'AdminAdjustment' ? 'Reverse' : 'Refund'} this transaction?\n\n` +
							`User: ${name} (${txn.user.email})\n` +
							`${kindLabel(txn.kind)}: ${txn.itemDescription}\n` +
							`Cost: ${txn.cost}h\n\n` +
							balanceEffect,
					)
				: true;
		if (!ok) return;

		refunding = true;
		actionError = null;
		try {
			const { error: err } = await api.DELETE('/api/shop/admin/transactions/{id}', {
				params: { path: { id: txn.transactionId } },
			});
			if (err) {
				actionError = errMessage(err, 'Refund failed');
				return;
			}
			// Refunding removes this row from the user's spend, so their balance
			// moves by +cost; keep the flag and adjustment history in sync.
			const refundedAt = new Date().toISOString();
			const refundedId = txn.transactionId;
			txn = {
				...txn,
				refundedAt,
				user: {
					...txn.user,
					balance: Math.round((txn.user.balance + txn.cost) * 10) / 10,
				},
				adjustments: txn.adjustments.map((a) =>
					a.transactionId === refundedId ? { ...a, refundedAt } : a,
				),
			};
		} catch (err) {
			actionError = errMessage(err, 'Refund failed');
		} finally {
			refunding = false;
		}
	}
</script>

<div class="p-6">
	<div class="mx-auto max-w-4xl space-y-6">
		<div class="flex flex-wrap items-center justify-between gap-4">
			<div>
				<h1 class="text-2xl font-semibold text-ds-text">
					Transaction <span class="font-mono">#{transactionId}</span>
				</h1>
				<a href="{base}/transactions" class="text-xs text-ds-link hover:underline">Back to all transactions</a>
			</div>
		</div>

		{#if loading}
			<div class="rounded-lg border border-ds-border bg-ds-surface p-8 text-center text-sm text-ds-text-secondary shadow-[var(--color-ds-shadow)]">
				Loading transaction…
			</div>
		{:else if error}
			<div class="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800 dark:border-red-700 dark:bg-red-900/20 dark:text-red-200">
				{error}
			</div>
		{:else if txn}
			{#if actionError}
				<div class="flex items-center justify-between gap-3 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-700 dark:bg-red-900/20 dark:text-red-200">
					<span>{actionError}</span>
					<button class="text-xs underline" onclick={() => (actionError = null)}>Dismiss</button>
				</div>
			{/if}

			{#if txn.user.balance < 0}
				<div class="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-700 dark:bg-red-900/20 dark:text-red-200">
					<span class="font-semibold">⚠ Negative balance:</span>
					this user's balance is <span class="font-mono font-semibold">{txn.user.balance}h</span> —
					they have spent more hours than they currently have approved (e.g. hours were revoked after spending).
					Check the adjustment history below before acting on this transaction.
				</div>
			{/if}

			<!-- Overview -->
			<div class="space-y-3 rounded-lg border border-ds-border bg-ds-surface p-5 shadow-[var(--color-ds-shadow)]">
				<div class="flex flex-wrap items-center justify-between gap-3">
					<div class="space-y-1">
						<p class="font-semibold text-ds-text">{txn.itemDescription}</p>
						<p class="text-xs text-ds-text-secondary">
							Created {formatDateTime(txn.createdAt)}
							· Cost <span class="font-mono text-ds-text">{txn.cost}h</span>
						</p>
					</div>
					<div class="flex items-center gap-2 text-xs">
						<span class="rounded border border-ds-border px-2 py-0.5 font-medium">{kindLabel(txn.kind)}</span>
						{#if txn.refundedAt}
							<span class="rounded border border-red-300/60 bg-red-100 px-2 py-0.5 text-red-800 dark:border-red-700/50 dark:bg-red-900/30 dark:text-red-200">
								Refunded {formatDateTime(txn.refundedAt)}
							</span>
						{:else if txn.isFulfilled}
							<span class="rounded border border-green-300/60 bg-green-100 px-2 py-0.5 text-green-800 dark:border-green-700/50 dark:bg-green-900/30 dark:text-green-200">
								Fulfilled {formatDateTime(txn.fulfilledAt)}
							</span>
						{:else if txn.kind === 'ShopItem'}
							<span class="rounded border border-amber-300/60 bg-amber-100 px-2 py-0.5 text-amber-800 dark:border-amber-700/50 dark:bg-amber-900/30 dark:text-amber-200">
								Pending fulfillment
							</span>
						{:else}
							<span class="rounded border border-ds-border px-2 py-0.5 text-ds-text-secondary">&mdash;</span>
						{/if}
					</div>
				</div>

				{#if txn.orderNotes}
					<div class="border-t border-ds-border pt-3">
						<h3 class="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ds-text-secondary">Order notes</h3>
						<p class="whitespace-pre-wrap text-sm text-ds-text">{txn.orderNotes}</p>
					</div>
				{/if}

				{#if !txn.refundedAt}
					<div class="flex flex-wrap items-center gap-2 border-t border-ds-border pt-3">
						{#if txn.kind === 'ShopItem'}
							{#if !txn.isFulfilled}
								<button
									class="rounded border border-green-300 bg-green-50 px-3 py-1 text-xs font-medium text-green-700 hover:bg-green-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-green-700/50 dark:bg-green-900/30 dark:text-green-200 dark:hover:bg-green-900/50"
									onclick={handleFulfill}
									disabled={fulfilling}
								>
									{fulfilling ? 'Fulfilling…' : 'Mark fulfilled'}
								</button>
							{:else}
								<button
									class="rounded border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-amber-700/50 dark:bg-amber-900/30 dark:text-amber-200 dark:hover:bg-amber-900/50"
									onclick={handleUnfulfill}
									disabled={unfulfilling}
								>
									{unfulfilling ? 'Unfulfilling…' : 'Mark unfulfilled'}
								</button>
							{/if}
						{/if}
						<button
							class="rounded border border-red-300 bg-red-50 px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-700/50 dark:bg-red-900/30 dark:text-red-200 dark:hover:bg-red-900/50"
							onclick={handleRefund}
							disabled={refunding}
						>
							{refunding ? 'Refunding…' : (txn.kind === 'AdminAdjustment' ? 'Reverse' : 'Refund')}
						</button>
					</div>
				{/if}
			</div>

			<div class="grid gap-6 md:grid-cols-2">
				<!-- User -->
				<div class="space-y-3 rounded-lg border border-ds-border bg-ds-surface p-5 shadow-[var(--color-ds-shadow)]">
					<h2 class="text-sm font-semibold uppercase tracking-wide text-ds-text-secondary">User</h2>
					<div class="space-y-1 text-sm">
						<p class="font-medium text-ds-text">
							<a href="{base}/users?q={encodeURIComponent(txn.user.email)}" class="hover:underline">
								{txn.user.firstName} {txn.user.lastName}
							</a>
							<span class="ml-1 text-xs font-normal text-ds-text-placeholder">#{txn.user.userId}</span>
						</p>
						<p class="text-ds-text-secondary">{txn.user.email}</p>
						<p class="text-ds-text-secondary">
							Balance:
							<span
								class="font-mono {txn.user.balance < 0
									? 'font-semibold text-red-700 dark:text-red-300'
									: 'text-ds-text'}">{txn.user.balance}h</span
							>
						</p>
						<p class="text-ds-text-secondary">
							Slack:
							{#if txn.user.slackUserId}
								<span>{txn.user.slackUsername ? `@${txn.user.slackUsername}` : ''}</span>
								<span class="font-mono text-xs">({txn.user.slackUserId})</span>
							{:else}
								<span class="text-ds-text-placeholder">not linked</span>
							{/if}
						</p>
						<p class="text-ds-text-secondary">
							Phone:
							{#if txn.user.phoneNumber}
								<span class="text-ds-text">{txn.user.phoneNumber}</span>
								{#if txn.user.phoneNumberVerified}
									<span class="ml-1 rounded-xs bg-green-500/15 px-1 text-[11px] text-green-700 dark:text-green-300">verified</span>
								{:else if txn.user.phoneNumberVerified === false}
									<span class="text-ds-text-placeholder">(unverified)</span>
								{/if}
							{:else}
								<span class="text-ds-text-placeholder">not set</span>
							{/if}
						</p>
					</div>
					<div class="border-t border-ds-border pt-3">
						<h3 class="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ds-text-secondary">Address</h3>
						{#if txn.user.addressLine1 || txn.user.city}
							<address class="not-italic text-sm leading-relaxed text-ds-text">
								<span class="font-medium">{shipName}</span>
								{#if txn.user.addressFirstName === null}
									<span class="text-xs text-ds-text-placeholder">(account name; address name not synced yet)</span>
								{/if}<br />
								{txn.user.addressLine1}<br />
								{#if txn.user.addressLine2}{txn.user.addressLine2}<br />{/if}
								{[txn.user.city, txn.user.state, txn.user.zipCode].filter(Boolean).join(', ')}
								{#if txn.user.city || txn.user.state || txn.user.zipCode}<br />{/if}
								{txn.user.country}
							</address>
						{:else}
							<p class="text-sm text-ds-text-placeholder">No address on file.</p>
						{/if}
					</div>
					<NoteCard
						title="User Notes"
						targetType="user"
						targetId={txn.user.userId}
						bind:content={userNote}
						loading={notesLoading}
						cardClass="border-orange-500/40 bg-orange-500/8"
						labelClass="text-orange-600 dark:text-orange-400"
					/>
				</div>

				<!-- Item details -->
				<div class="space-y-3 rounded-lg border border-ds-border bg-ds-surface p-5 shadow-[var(--color-ds-shadow)]">
					<h2 class="text-sm font-semibold uppercase tracking-wide text-ds-text-secondary">
						{txn.kind === 'EventTicket' ? 'Event' : 'Item'}
					</h2>
					{#if txn.item}
						<div class="flex items-start gap-3">
							{#if txn.item.imageUrl}
								<img src={txn.item.imageUrl} alt={txn.item.name} class="w-16 h-16 rounded-md border border-ds-border object-cover" />
							{/if}
							<div class="space-y-1 text-sm">
								<p class="font-medium text-ds-text">{txn.item.name}</p>
								{#if txn.item.description}
									<p class="text-ds-text-secondary">{txn.item.description}</p>
								{/if}
								{#if txn.item.cost !== null && txn.item.cost !== undefined}
									<p class="text-xs text-ds-text-secondary">List price: <span class="font-mono">{txn.item.cost}h</span></p>
								{/if}
								{#if txn.variant?.name}
									<p class="text-xs text-ds-text-secondary">
										Variant: {txn.variant.name}{#if txn.variant.cost !== null && txn.variant.cost !== undefined} (<span class="font-mono">{txn.variant.cost}h</span>){/if}
									</p>
								{/if}
								{#if txn.item.shop}
									<p class="text-xs text-ds-text-secondary">Shop: {txn.item.shop.slug}</p>
								{/if}
							</div>
						</div>
					{:else if txn.event}
						<div class="space-y-1 text-sm">
							<p class="font-medium text-ds-text">{txn.event.title}</p>
							{#if txn.event.slug}
								<p class="text-xs font-mono text-ds-text-secondary">{txn.event.slug}</p>
							{/if}
							{#if txn.event.location}
								<p class="text-ds-text-secondary">{txn.event.location}</p>
							{/if}
						</div>
					{:else}
						<p class="text-sm text-ds-text-secondary">
							{txn.kind === 'AdminAdjustment'
								? `Manual balance adjustment \u2014 no associated item.`
								: txn.itemDescription}
						</p>
					{/if}
				</div>
			</div>

			<!-- Balance adjustment history -->
			<div class="space-y-3 rounded-lg border border-ds-border bg-ds-surface p-5 shadow-[var(--color-ds-shadow)]">
				<h2 class="text-sm font-semibold uppercase tracking-wide text-ds-text-secondary">
					Balance adjustment history
				</h2>
				{#if txn.adjustments.length === 0}
					<p class="text-sm text-ds-text-placeholder">No admin balance adjustments for this user.</p>
				{:else}
					<div class="overflow-x-auto">
						<table class="w-full text-sm">
							<thead>
								<tr class="border-b border-ds-border text-left text-[11px] uppercase tracking-wide text-ds-text-secondary">
									<th class="px-3 py-2 font-semibold">ID</th>
									<th class="px-3 py-2 text-right font-semibold">Hours</th>
									<th class="px-3 py-2 font-semibold">Reason</th>
									<th class="px-3 py-2 font-semibold">Date</th>
									<th class="px-3 py-2 font-semibold">Status</th>
								</tr>
							</thead>
							<tbody>
								{#each txn.adjustments as adj (adj.transactionId)}
									<tr class="border-b border-ds-border/60 {adj.transactionId === txn.transactionId ? 'bg-ds-surface2/50' : ''}">
										<td class="px-3 py-2 font-mono text-xs text-ds-text-secondary">
											{#if adj.transactionId === txn.transactionId}
												<span title="This transaction">#{adj.transactionId}</span>
											{:else}
												<a
													href="{base}/transactions/{adj.transactionId}"
													class="hover:text-ds-text hover:underline"
													title="Open adjustment detail"
												>#{adj.transactionId}</a>
											{/if}
										</td>
										<td class="px-3 py-2 text-right font-mono {adj.cost < 0 ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'}">
											{adj.cost < 0 ? `+${-adj.cost}` : `\u2212${adj.cost}`}h
										</td>
										<td class="px-3 py-2 text-ds-text-secondary">{adj.itemDescription}</td>
										<td class="px-3 py-2 text-xs text-ds-text-secondary">{formatDateTime(adj.createdAt)}</td>
										<td class="px-3 py-2 text-xs">
											{#if adj.refundedAt}
												<span class="text-red-700 dark:text-red-300" title="Reversed {formatDateTime(adj.refundedAt)}">Reversed</span>
											{:else}
												<span class="text-ds-text-secondary">Active</span>
											{/if}
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{/if}
			</div>
		{/if}
	</div>
</div>
