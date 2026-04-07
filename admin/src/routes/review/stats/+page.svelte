<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { theme, toggleTheme } from '$lib/themeStore';
	import { api, type components } from '$lib/api';

	type ReviewStats = components['schemas']['ReviewStatsResponse'];
	type LeaderboardEntry = components['schemas']['LeaderboardEntry'];

	let stats = $state<ReviewStats | null>(null);
	let loading = $state(true);
	let error = $state<string | null>(null);

	let leaderboardTab = $state<'allTime' | 'week' | 'day'>('allTime');

	let currentLeaderboard = $derived<LeaderboardEntry[]>(
		stats ? stats.leaderboard[leaderboardTab] : [],
	);

	onMount(async () => {
		const { data: me, error: authErr } = await api.GET('/api/user/auth/me');
		if (authErr || !me) {
			goto('/login');
			return;
		}
		if (me.role !== 'admin' && me.role !== 'reviewer') {
			goto('/app/projects');
			return;
		}
		await loadStats();
	});

	async function loadStats() {
		loading = true;
		error = null;
		try {
			const { data, error: fetchErr } = await api.GET('/api/reviewer/stats');
			if (fetchErr) throw new Error('Failed to fetch review stats');
			stats = data ?? null;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load stats';
		} finally {
			loading = false;
		}
	}

	function formatHours(hours: number | null): string {
		if (hours === null) return '--';
		if (hours < 1) return `${Math.round(hours * 60)}min`;
		const h = Math.floor(hours);
		const m = Math.round((hours - h) * 60);
		if (m === 0) return `${h}h`;
		return `${h}h ${m}min`;
	}

	const tabBtnClass =
		'px-3.5 py-1.5 rounded-md text-[12px] font-medium cursor-pointer transition-all duration-150 border';
</script>

<svelte:head>
	<link
		href="https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Inter:wght@400;500;600;700&display=swap"
		rel="stylesheet"
	/>
	<title>Horizons — Review Stats</title>
</svelte:head>

<div class="font-[Inter,sans-serif] bg-rv-bg text-rv-text min-h-screen">
	<!-- Top bar -->
	<div
		class="flex items-center justify-between px-5 py-2.5 bg-rv-surface border-b border-rv-border"
	>
		<a
			href="/admin/review"
			class="bg-rv-surface2 border border-rv-border text-rv-dim px-3.5 py-1.5 rounded-md text-[12px] font-medium no-underline transition-all duration-150 hover:text-rv-text hover:border-rv-accent"
		>
			← Back to Review
		</a>
		<div class="flex items-center gap-3">
			<span class="text-[12px] text-rv-dim">Review Stats</span>
			<button
				class="bg-rv-surface2 border border-rv-border text-rv-dim p-1.5 rounded-md cursor-pointer transition-all duration-150 hover:border-rv-accent hover:text-rv-accent"
				onclick={toggleTheme}
				title="Toggle dark/light mode"
			>
				{#if $theme === 'dark'}
					<svg
						class="w-4 h-4"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<circle cx="12" cy="12" r="5" />
						<line x1="12" y1="1" x2="12" y2="3" />
						<line x1="12" y1="21" x2="12" y2="23" />
						<line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
						<line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
						<line x1="1" y1="12" x2="3" y2="12" />
						<line x1="21" y1="12" x2="23" y2="12" />
						<line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
						<line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
					</svg>
				{:else}
					<svg
						class="w-4 h-4"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
					</svg>
				{/if}
			</button>
		</div>
	</div>

	{#if loading}
		<div class="flex items-center justify-center h-64 text-rv-dim">
			<p>Loading stats...</p>
		</div>
	{:else if error}
		<div class="flex flex-col items-center justify-center h-64 gap-2 text-rv-red">
			<p>{error}</p>
			<button
				class="mt-2 bg-rv-surface2 border border-rv-border text-rv-text px-4 py-1.5 rounded-md cursor-pointer text-sm"
				onclick={loadStats}>Retry</button
			>
		</div>
	{:else if stats}
		<div class="max-w-4xl mx-auto px-5 py-6 flex flex-col gap-6">
			<!-- General stats cards -->
			<section>
				<h2 class="text-[13px] uppercase tracking-wider text-rv-dim mb-3 font-semibold">
					Last 30 Days
				</h2>
				<div class="grid grid-cols-2 md:grid-cols-4 gap-3">
					<div class="bg-rv-surface border border-rv-border rounded-lg p-4">
						<div class="text-[11px] text-rv-dim uppercase tracking-wide mb-1">
							Avg Review Time
						</div>
						<div class="text-xl font-bold text-rv-accent">
							{formatHours(stats.general.avgReviewTimeLast30Days)}
						</div>
					</div>
					<div class="bg-rv-surface border border-rv-border rounded-lg p-4">
						<div class="text-[11px] text-rv-dim uppercase tracking-wide mb-1">
							Median Review Time
						</div>
						<div class="text-xl font-bold text-rv-accent">
							{formatHours(stats.general.medianReviewTimeLast30Days)}
						</div>
					</div>
					<div class="bg-rv-surface border border-rv-border rounded-lg p-4">
						<div class="text-[11px] text-rv-dim uppercase tracking-wide mb-1">
							Longest Wait
						</div>
						<div class="text-xl font-bold text-rv-red">
							{formatHours(stats.general.longestWaitLast30Days)}
						</div>
					</div>
					<div class="bg-rv-surface border border-rv-border rounded-lg p-4">
						<div class="text-[11px] text-rv-dim uppercase tracking-wide mb-1">
							Current Longest Wait
						</div>
						<div class="text-xl font-bold text-rv-red">
							{formatHours(stats.general.longestCurrentWait)}
						</div>
					</div>
				</div>
				<div class="mt-2 text-[11px] text-rv-dim">
					{stats.general.reviewsLast30Days} reviews completed in the last 30 days
				</div>
			</section>

			<!-- Leaderboard -->
			<section>
				<div class="flex items-center justify-between mb-3">
					<h2 class="text-[13px] uppercase tracking-wider text-rv-dim font-semibold">
						Reviewer Leaderboard
					</h2>
					<div class="flex gap-1.5">
						<button
							class="{tabBtnClass} {leaderboardTab === 'allTime'
								? 'bg-rv-accent text-rv-bg border-rv-accent'
								: 'bg-rv-surface2 text-rv-dim border-rv-border hover:text-rv-text hover:border-rv-accent'}"
							onclick={() => (leaderboardTab = 'allTime')}>All Time</button
						>
						<button
							class="{tabBtnClass} {leaderboardTab === 'week'
								? 'bg-rv-accent text-rv-bg border-rv-accent'
								: 'bg-rv-surface2 text-rv-dim border-rv-border hover:text-rv-text hover:border-rv-accent'}"
							onclick={() => (leaderboardTab = 'week')}>This Week</button
						>
						<button
							class="{tabBtnClass} {leaderboardTab === 'day'
								? 'bg-rv-accent text-rv-bg border-rv-accent'
								: 'bg-rv-surface2 text-rv-dim border-rv-border hover:text-rv-text hover:border-rv-accent'}"
							onclick={() => (leaderboardTab = 'day')}>Today</button
						>
					</div>
				</div>

				{#if currentLeaderboard.length === 0}
					<div
						class="bg-rv-surface border border-rv-border rounded-lg p-6 text-center text-rv-dim text-sm"
					>
						No reviews in this period
					</div>
				{:else}
					<div class="bg-rv-surface border border-rv-border rounded-lg overflow-hidden">
						<table class="w-full text-sm">
							<thead>
								<tr class="border-b border-rv-border text-rv-dim text-[11px] uppercase tracking-wide">
									<th class="text-left px-4 py-2.5 w-12">#</th>
									<th class="text-left px-4 py-2.5">Reviewer</th>
									<th class="text-right px-4 py-2.5 w-24">Reviews</th>
								</tr>
							</thead>
							<tbody>
								{#each currentLeaderboard as entry, i}
									<tr
										class="border-b border-rv-divider last:border-b-0 hover:bg-rv-surface2 transition-colors"
									>
										<td class="px-4 py-2.5 text-rv-dim font-mono text-xs">
											{#if i === 0}
												<span class="text-rv-accent font-bold">1</span>
											{:else if i === 1}
												<span class="text-rv-dim font-bold">2</span>
											{:else if i === 2}
												<span class="text-rv-dim font-bold">3</span>
											{:else}
												{i + 1}
											{/if}
										</td>
										<td class="px-4 py-2.5 font-medium">{entry.name}</td>
										<td class="px-4 py-2.5 text-right font-mono text-rv-accent font-bold"
											>{entry.count}</td
										>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{/if}
			</section>
		</div>
	{/if}
</div>
