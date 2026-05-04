<script lang="ts">
	import { onMount } from 'svelte';
	import { base } from '$app/paths';
	import { api, type components } from '$lib/api';

	type FraudQueueResponse = components['schemas']['FraudQueueResponse'];
	type FraudProject = components['schemas']['FraudQueueProjectResponse'];

	let data = $state<FraudQueueResponse | null>(null);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let refreshing = $state(false);
	let search = $state('');
	let now = $state(Date.now());

	async function load() {
		const { data: res, error: err } = await api.GET('/api/admin/fraud-queue');
		if (err) {
			error = 'Failed to load fraud queue. Admin role required.';
			data = null;
			return;
		}
		data = res ?? null;
		now = Date.now();
	}

	onMount(async () => {
		// Guard against non-admin users hitting the route directly. The backend
		// already 403s, but this gives them a clearer redirect.
		const { data: me } = await api.GET('/api/user/auth/me');
		if (me && me.role !== 'admin' && me.role !== 'superadmin') {
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

	function formatDuration(ms: number | null): string {
		if (ms === null) return '—';
		const seconds = Math.floor(ms / 1000);
		if (seconds < 60) return `${seconds}s`;
		const minutes = Math.floor(seconds / 60);
		if (minutes < 60) return `${minutes}m`;
		const hours = Math.floor(minutes / 60);
		if (hours < 24) {
			const remM = minutes - hours * 60;
			return remM ? `${hours}h ${remM}m` : `${hours}h`;
		}
		const days = Math.floor(hours / 24);
		const remH = hours - days * 24;
		return remH ? `${days}d ${remH}h` : `${days}d`;
	}

	function userLabel(u: FraudProject['user']): string {
		const name = [u.firstName, u.lastName].filter(Boolean).join(' ').trim();
		return name || u.email;
	}

	function formatTypeName(type: string): string {
		return type
			.replace(/_/g, ' ')
			.replace(/\b\w/g, (c) => c.toUpperCase());
	}

	function statusLabel(p: FraudProject): { text: string; cls: string } {
		if (p.joeFraudPassed === true) {
			return { text: 'Passed', cls: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/40' };
		}
		if (p.joeFraudPassed === false) {
			return { text: 'Failed', cls: 'bg-red-500/15 text-red-500 border-red-500/40' };
		}
		if (!p.joeProjectId) {
			return { text: 'Not submitted', cls: 'bg-rv-tag-bg text-rv-dim border-rv-border' };
		}
		return { text: 'Pending', cls: 'bg-yellow-500/15 text-yellow-600 border-yellow-500/40' };
	}

	// Tint the fraud-queue wait pill warmer as the wait grows so stale items pop.
	function waitPillCls(ms: number | null): string {
		if (ms === null) return 'bg-rv-tag-bg text-rv-dim border-rv-border';
		const hours = ms / 3_600_000;
		if (hours >= 72) return 'bg-red-500/15 text-red-500 border-red-500/40';
		if (hours >= 24) return 'bg-orange-500/15 text-orange-500 border-orange-500/40';
		return 'bg-rv-tag-bg text-rv-dim border-rv-border';
	}

	function formatTrust(score: number | null): string {
		return score === null ? '—' : score.toFixed(2);
	}

	function matchesSearch(p: FraudProject): boolean {
		const q = search.toLowerCase().trim();
		if (!q) return true;
		return (
			p.projectTitle.toLowerCase().includes(q) ||
			userLabel(p.user).toLowerCase().includes(q) ||
			p.user.email.toLowerCase().includes(q) ||
			(p.joeProjectId?.toLowerCase().includes(q) ?? false)
		);
	}

	let inQueue = $derived(data?.inQueue.filter(matchesSearch) ?? []);
	let notInQueue = $derived(data?.notInQueue.filter(matchesSearch) ?? []);
</script>

<div class="flex flex-col h-screen overflow-hidden">
	<div class="flex items-center justify-between px-6 py-4 bg-rv-surface border-b border-rv-border shrink-0">
		<div class="flex items-center gap-3">
			<a
				href="{base}/review"
				class="text-rv-dim hover:text-rv-text text-[13px] no-underline"
			>
				← Back to review
			</a>
			<div class="font-[Space_Mono,monospace] font-bold text-[18px] text-rv-accent">
				HORIZONS <span class="text-rv-text font-normal text-[13px] ml-2">Fraud Queue</span>
			</div>
		</div>
		<button
			class="py-1.5 px-3.5 rounded-md border border-rv-border bg-rv-surface2 text-rv-dim text-[12px] font-inherit cursor-pointer transition-all duration-150 hover:border-rv-accent hover:text-rv-text disabled:opacity-40 disabled:cursor-not-allowed"
			onclick={refresh}
			disabled={refreshing}
		>
			{refreshing ? 'Refreshing…' : 'Refresh'}
		</button>
	</div>

	<div class="overflow-y-auto flex-1">
		{#if loading}
			<p class="text-rv-dim p-6 text-sm">Loading fraud queue…</p>
		{:else if error}
			<p class="text-red-500 p-6 text-sm">{error}</p>
		{:else if data}
			<!-- Stats -->
			<section class="px-6 pt-6">
				{#if !data.stats.enabled}
					<div class="mb-4 py-2 px-3 rounded-md border border-yellow-500/40 bg-yellow-500/10 text-yellow-600 text-[12px]">
						Fraud review (Joe) integration is currently disabled. Pending counts may not progress.
					</div>
				{/if}
				<div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
					<div class="p-4 bg-rv-surface border border-rv-border rounded-[10px]">
						<p class="text-[11px] uppercase tracking-wider text-rv-dim m-0">Total projects</p>
						<p class="text-[22px] font-semibold text-rv-text m-0 mt-1">{data.stats.totalProjects}</p>
					</div>
					<div class="p-4 bg-rv-surface border border-rv-border rounded-[10px]">
						<p class="text-[11px] uppercase tracking-wider text-rv-dim m-0">In queue</p>
						<p class="text-[22px] font-semibold text-yellow-600 m-0 mt-1">{data.stats.pendingCount}</p>
						<p class="text-[11px] text-rv-dim m-0 mt-0.5">{data.stats.notSubmittedCount} not yet submitted to Joe</p>
					</div>
					<div class="p-4 bg-rv-surface border border-rv-border rounded-[10px]">
						<p class="text-[11px] uppercase tracking-wider text-rv-dim m-0">Passed / Failed</p>
						<p class="text-[22px] font-semibold m-0 mt-1">
							<span class="text-emerald-500">{data.stats.passedCount}</span>
							<span class="text-rv-dim mx-1">/</span>
							<span class="text-red-500">{data.stats.failedCount}</span>
						</p>
					</div>
					<div class="p-4 bg-rv-surface border border-rv-border rounded-[10px]">
						<p class="text-[11px] uppercase tracking-wider text-rv-dim m-0">Fraud wait (resolved)</p>
						<p class="text-[18px] font-semibold text-rv-text m-0 mt-1">
							avg {formatDuration(data.stats.avgResolvedFraudWaitMs)}
						</p>
						<p class="text-[11px] text-rv-dim m-0 mt-0.5">
							median {formatDuration(data.stats.medianResolvedFraudWaitMs)}
						</p>
					</div>
					<div class="p-4 bg-rv-surface border border-rv-border rounded-[10px]">
						<p class="text-[11px] uppercase tracking-wider text-rv-dim m-0">Longest pending</p>
						<p class="text-[18px] font-semibold text-rv-text m-0 mt-1">
							{formatDuration(data.stats.longestPendingFraudWaitMs)}
						</p>
						<p class="text-[11px] text-rv-dim m-0 mt-0.5">
							avg trust {formatTrust(data.stats.avgTrustScore)}
						</p>
					</div>
				</div>
			</section>

			<div class="px-6 pt-4">
				<input
					type="text"
					class="w-full py-2.5 px-3.5 bg-rv-bg border border-rv-border rounded-lg text-rv-text text-sm font-inherit outline-none transition-all duration-150 placeholder:text-rv-dim focus:border-rv-accent"
					placeholder="Search by project, author, email, or Joe project ID…"
					bind:value={search}
				/>
			</div>

			<!-- In fraud queue -->
			<section class="px-6 pt-6 pb-2">
				<h2 class="text-[13px] uppercase tracking-wider text-rv-dim font-semibold mb-3">
					In Fraud Queue
					<span class="text-rv-text/60 font-normal normal-case ml-1">({inQueue.length})</span>
				</h2>
				{#if inQueue.length === 0}
					<p class="text-rv-dim py-6 text-sm">Nothing pending. Joe is caught up.</p>
				{:else}
					<div class="grid grid-cols-1 lg:grid-cols-2 gap-3">
						{#each inQueue as p (p.projectId)}
							{@const status = statusLabel(p)}
							<a
								href="{base}/review/{p.projectId}"
								class="flex flex-col gap-2 p-4 bg-rv-surface border border-rv-border rounded-[10px] no-underline hover:border-rv-accent hover:bg-rv-surface2 transition-all duration-150"
							>
								<div class="flex items-start justify-between gap-3">
									<div class="min-w-0">
										<p class="text-[15px] font-semibold text-rv-text m-0 truncate">{p.projectTitle}</p>
										<p class="text-[12px] text-rv-dim m-0">
											{userLabel(p.user)} · {p.user.email}
										</p>
									</div>
									<span class="shrink-0 inline-block py-0.5 px-2 rounded-xl text-[11px] border {status.cls}">{status.text}</span>
								</div>
								<div class="flex flex-wrap items-center gap-1.5">
									<span class="inline-block py-0.5 px-2 rounded-xl text-[11px] bg-rv-tag-bg text-rv-accent">{formatTypeName(p.projectType)}</span>
									{#if p.user.isFraud}
										<span class="inline-block py-0.5 px-2 rounded-xl text-[11px] bg-red-500/15 text-red-500 border border-red-500/40">User: fraud</span>
									{/if}
									{#if p.user.isSus}
										<span class="inline-block py-0.5 px-2 rounded-xl text-[11px] bg-orange-500/15 text-orange-500 border border-orange-500/40">User: sus</span>
									{/if}
									{#if p.submissionCount > 1}
										<span class="inline-block py-0.5 px-2 rounded-xl text-[11px] bg-rv-tag-bg text-rv-accent">{p.submissionCount} submissions</span>
									{/if}
								</div>
								<div class="grid grid-cols-2 gap-2 text-[12px]">
									<div class="flex flex-col gap-0.5">
										<span class="text-rv-dim text-[11px] uppercase tracking-wide">Fraud wait</span>
										<span class="inline-flex items-center self-start py-0.5 px-2 rounded-xl border {waitPillCls(p.fraudQueueWaitMs)}">
											{formatDuration(p.fraudQueueWaitMs)}
										</span>
									</div>
									<div class="flex flex-col gap-0.5">
										<span class="text-rv-dim text-[11px] uppercase tracking-wide">Overall wait</span>
										<span class="inline-flex items-center self-start py-0.5 px-2 rounded-xl border {waitPillCls(p.overallWaitMs)}">
											{formatDuration(p.overallWaitMs)}
										</span>
									</div>
								</div>
								<div class="grid grid-cols-2 gap-2 text-[12px] pt-1 border-t border-rv-border">
									<div>
										<span class="text-rv-dim text-[11px]">Joe ID</span>
										<p class="m-0 text-rv-text font-mono text-[11px] truncate">{p.joeProjectId ?? '—'}</p>
									</div>
									<div>
										<span class="text-rv-dim text-[11px]">Trust</span>
										<p class="m-0 text-rv-text">{formatTrust(p.joeTrustScore)}</p>
									</div>
								</div>
								{#if p.joeJustification}
									<details class="text-[12px]">
										<summary class="cursor-pointer text-rv-dim hover:text-rv-text">Joe justification</summary>
										<p class="m-0 mt-1 text-rv-text whitespace-pre-wrap">{p.joeJustification}</p>
									</details>
								{/if}
							</a>
						{/each}
					</div>
				{/if}
			</section>

			<hr class="border-none border-t border-rv-border mx-6 my-4" />

			<!-- Not in fraud queue -->
			<section class="px-6 py-2 pb-6">
				<h2 class="text-[13px] uppercase tracking-wider text-rv-dim font-semibold mb-3">
					Not In Fraud Queue
					<span class="text-rv-text/60 font-normal normal-case ml-1">({notInQueue.length})</span>
				</h2>
				{#if notInQueue.length === 0}
					<p class="text-rv-dim py-6 text-sm">No resolved projects yet.</p>
				{:else}
					<div class="grid grid-cols-1 lg:grid-cols-2 gap-3">
						{#each notInQueue as p (p.projectId)}
							{@const status = statusLabel(p)}
							<a
								href="{base}/review/{p.projectId}"
								class="flex flex-col gap-2 p-4 bg-rv-surface border border-rv-border rounded-[10px] no-underline hover:border-rv-accent hover:bg-rv-surface2 transition-all duration-150"
							>
								<div class="flex items-start justify-between gap-3">
									<div class="min-w-0">
										<p class="text-[15px] font-semibold text-rv-text m-0 truncate">{p.projectTitle}</p>
										<p class="text-[12px] text-rv-dim m-0">
											{userLabel(p.user)} · {p.user.email}
										</p>
									</div>
									<span class="shrink-0 inline-block py-0.5 px-2 rounded-xl text-[11px] border {status.cls}">{status.text}</span>
								</div>
								<div class="flex flex-wrap items-center gap-1.5">
									<span class="inline-block py-0.5 px-2 rounded-xl text-[11px] bg-rv-tag-bg text-rv-accent">{formatTypeName(p.projectType)}</span>
									{#if p.user.isFraud}
										<span class="inline-block py-0.5 px-2 rounded-xl text-[11px] bg-red-500/15 text-red-500 border border-red-500/40">User: fraud</span>
									{/if}
									{#if p.user.isSus}
										<span class="inline-block py-0.5 px-2 rounded-xl text-[11px] bg-orange-500/15 text-orange-500 border border-orange-500/40">User: sus</span>
									{/if}
									{#if p.submissionCount > 1}
										<span class="inline-block py-0.5 px-2 rounded-xl text-[11px] bg-rv-tag-bg text-rv-accent">{p.submissionCount} submissions</span>
									{/if}
								</div>
								<div class="grid grid-cols-2 gap-2 text-[12px]">
									<div class="flex flex-col gap-0.5">
										<span class="text-rv-dim text-[11px] uppercase tracking-wide">Fraud wait</span>
										<span class="inline-flex items-center self-start py-0.5 px-2 rounded-xl border bg-rv-tag-bg text-rv-dim border-rv-border">
											{formatDuration(p.fraudQueueWaitMs)}
										</span>
									</div>
									<div class="flex flex-col gap-0.5">
										<span class="text-rv-dim text-[11px] uppercase tracking-wide">Overall wait</span>
										<span class="inline-flex items-center self-start py-0.5 px-2 rounded-xl border bg-rv-tag-bg text-rv-dim border-rv-border">
											{formatDuration(p.overallWaitMs)}
										</span>
									</div>
								</div>
								<div class="grid grid-cols-2 gap-2 text-[12px] pt-1 border-t border-rv-border">
									<div>
										<span class="text-rv-dim text-[11px]">Joe ID</span>
										<p class="m-0 text-rv-text font-mono text-[11px] truncate">{p.joeProjectId ?? '—'}</p>
									</div>
									<div>
										<span class="text-rv-dim text-[11px]">Trust</span>
										<p class="m-0 text-rv-text">{formatTrust(p.joeTrustScore)}</p>
									</div>
									<div>
										<span class="text-rv-dim text-[11px]">Outcome</span>
										<p class="m-0 text-rv-text">{p.joeOutcomeStatus ?? '—'}</p>
									</div>
									<div>
										<span class="text-rv-dim text-[11px]">Reviewed at</span>
										<p class="m-0 text-rv-text text-[11px]">
											{p.joeFraudReviewedAt ? new Date(p.joeFraudReviewedAt).toLocaleString() : '—'}
										</p>
									</div>
								</div>
								{#if p.joeJustification}
									<details class="text-[12px]">
										<summary class="cursor-pointer text-rv-dim hover:text-rv-text">Joe justification</summary>
										<p class="m-0 mt-1 text-rv-text whitespace-pre-wrap">{p.joeJustification}</p>
									</details>
								{/if}
								{#if p.joeOutcomeReason}
									<details class="text-[12px]">
										<summary class="cursor-pointer text-rv-dim hover:text-rv-text">Outcome reason</summary>
										<p class="m-0 mt-1 text-rv-text whitespace-pre-wrap">{p.joeOutcomeReason}</p>
									</details>
								{/if}
							</a>
						{/each}
					</div>
				{/if}
			</section>
		{/if}
	</div>
</div>
