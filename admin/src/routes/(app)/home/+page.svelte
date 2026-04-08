<script lang="ts">
	import { base } from '$app/paths';
	import { onMount } from 'svelte';
	import { api } from '$lib/api';
	import { Button } from '$lib/components';
	import { theme } from '$lib/themeStore';

	type Metrics = {
		totalHackatimeHours: number;
		totalApprovedHours: number;
		totalUsers: number;
		totalProjects: number;
		totalSubmittedHackatimeHours: number;
	};

	let metrics = $state<Metrics>({
		totalHackatimeHours: 0,
		totalApprovedHours: 0,
		totalUsers: 0,
		totalProjects: 0,
		totalSubmittedHackatimeHours: 0,
	});
	let metricsLoading = $state(false);
	let recalcAllBusy = $state(false);
	let bulkProjectMessage = $state('');
	let bulkProjectError = $state('');

	onMount(() => loadMetrics());

	function formatHours(value: number) {
		return value.toLocaleString(undefined, { maximumFractionDigits: 1 });
	}

	function formatCount(value: number) {
		return value.toLocaleString();
	}

	async function loadMetrics() {
		metricsLoading = true;
		try {
			const { data: result } = await api.GET('/api/admin/metrics');
			if (result) metrics = result.totals;
		} finally {
			metricsLoading = false;
		}
	}

	async function recalculateAllProjectsHours() {
		if (recalcAllBusy) return;
		recalcAllBusy = true;
		bulkProjectMessage = '';
		bulkProjectError = '';
		try {
			const { data: body, error } = await api.POST('/api/admin/projects/recalculate-all');
			if (error) { bulkProjectError = 'Failed to recalculate projects'; return; }
			const updatedCount = body?.updated ?? 0;
			bulkProjectMessage = `Recalculated ${updatedCount} project${updatedCount === 1 ? '' : 's'}.`;
			await loadMetrics();
		} catch (err) {
			bulkProjectError = err instanceof Error ? err.message : 'Failed to recalculate projects';
		} finally {
			recalcAllBusy = false;
		}
	}
</script>

<!-- Program Header -->
<div class="relative h-[160px] w-full overflow-hidden bg-ds-banner">
	<!-- Fractal checkerboard pattern -->
	<div
		class="pointer-events-none absolute -inset-x-full -inset-y-[200%] -rotate-[19.5deg] opacity-15"
		class:invert={$theme === 'dark'}
		style="background-image: url('{base}/content/bg-pattern.svg'); background-size: 1000px 1000px; background-repeat: repeat;"
	></div>

	<!-- Horizons wordmark -->
	<img
		src="{base}/logos/horizons.svg"
		alt="Horizons"
		class="absolute bottom-[25px] left-[24px] h-[45px] w-auto"
		class:invert={$theme === 'dark'}
	/>
</div>

<!-- Body -->
<div class="p-6">
	<div class="mx-auto max-w-6xl space-y-6">
		<!-- Metrics cards -->
		<section class="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
			<div class="space-y-1 rounded-lg border border-ds-border bg-ds-surface p-4 shadow-[var(--color-ds-shadow)]">
				<p class="text-[11px] font-semibold uppercase tracking-wide text-ds-text-secondary">Hackatime Hours</p>
				<p class="text-2xl font-bold text-ds-text">{formatHours(metrics.totalHackatimeHours)}</p>
			</div>
			<div class="space-y-1 rounded-lg border border-ds-border bg-ds-surface p-4 shadow-[var(--color-ds-shadow)]">
				<p class="text-[11px] font-semibold uppercase tracking-wide text-ds-text-secondary">Approved Hours</p>
				<p class="text-2xl font-bold text-ds-text">{formatHours(metrics.totalApprovedHours)}</p>
			</div>
			<div class="space-y-1 rounded-lg border border-ds-border bg-ds-surface p-4 shadow-[var(--color-ds-shadow)]">
				<p class="text-[11px] font-semibold uppercase tracking-wide text-ds-text-secondary">Submitted Hours</p>
				<p class="text-2xl font-bold text-ds-text">{formatHours(metrics.totalSubmittedHackatimeHours)}</p>
			</div>
			<div class="space-y-1 rounded-lg border border-ds-border bg-ds-surface p-4 shadow-[var(--color-ds-shadow)]">
				<p class="text-[11px] font-semibold uppercase tracking-wide text-ds-text-secondary">Projects</p>
				<p class="text-2xl font-bold text-ds-text">{formatCount(metrics.totalProjects)}</p>
			</div>
			<div class="space-y-1 rounded-lg border border-ds-border bg-ds-surface p-4 shadow-[var(--color-ds-shadow)]">
				<p class="text-[11px] font-semibold uppercase tracking-wide text-ds-text-secondary">Users</p>
				<p class="text-2xl font-bold text-ds-text">{formatCount(metrics.totalUsers)}</p>
			</div>
		</section>

		<!-- Action bar -->
		<div class="flex items-center gap-2">
			<Button onclick={loadMetrics} disabled={metricsLoading}>
				{metricsLoading ? 'Refreshing...' : 'Refresh totals'}
			</Button>
			<Button onclick={recalculateAllProjectsHours} disabled={recalcAllBusy}>
				{recalcAllBusy ? 'Recalculating...' : 'Recalculate all projects'}
			</Button>
			{#if bulkProjectError}
				<span class="text-xs text-red-600">{bulkProjectError}</span>
			{:else if bulkProjectMessage}
				<span class="text-xs text-green-700">{bulkProjectMessage}</span>
			{/if}
		</div>
	</div>
</div>
