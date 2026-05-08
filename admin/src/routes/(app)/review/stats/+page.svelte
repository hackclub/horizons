<script lang="ts">
	import { onMount, onDestroy, tick } from 'svelte';
	import { goto } from '$app/navigation';
	import { theme, toggleTheme } from '$lib/themeStore';
	import { api, type components } from '$lib/api';
	import * as echarts from 'echarts';
	import { Skeleton } from '$lib/components';
	import StatCard from './StatCard.svelte';

	type ReviewStats = components['schemas']['ReviewStatsResponse'];
	type LeaderboardEntry = components['schemas']['LeaderboardEntry'];
	type FunnelMatrix = components['schemas']['StatsFunnelMatrix'];
	type FraudRow = components['schemas']['StatsFunnelMatrixRow'];
	type DataPoint = { date: string; value: number };
	type EChart = echarts.ECharts;

	let stats = $state<ReviewStats | null>(null);
	let loading = $state(true);
	let error = $state<string | null>(null);

	let leaderboardTab = $state<'allTime' | 'week' | 'day'>('allTime');
	let breakdownTab = $state<'hours' | 'median' | 'projects' | 'leaderboard'>('projects');
	let hoursDistMode = $state<'unshipped' | 'shipped' | 'approved'>('approved');

	let currentLeaderboard = $derived<LeaderboardEntry[]>(
		stats ? stats.leaderboard[leaderboardTab] : [],
	);

	const funnelMatrix = $derived<FunnelMatrix | null>(
		stats ? (stats.reviewProjects.funnelMatrix ?? null) : null,
	);
	const finalApproved = $derived(funnelMatrix ? funnelMatrix.reviewApproved.fraudPassed : 0);
	const finalSilentReject = $derived(
		funnelMatrix
			? funnelMatrix.reviewApproved.fraudFailed +
					funnelMatrix.reviewPending.fraudFailed +
					funnelMatrix.reviewRejected.fraudFailed
			: 0,
	);
	const finalInFlight = $derived(
		funnelMatrix
			? funnelMatrix.reviewApproved.fraudPending +
					funnelMatrix.reviewPending.fraudPassed +
					funnelMatrix.reviewPending.fraudPending
			: 0,
	);
	const finalRejected = $derived(
		funnelMatrix
			? funnelMatrix.reviewRejected.fraudPassed +
					funnelMatrix.reviewRejected.fraudPending
			: 0,
	);

	type MatrixCellMeaning =
		| 'approved'
		| 'silent-reject'
		| 'awaiting-fraud'
		| 'awaiting-review'
		| 'awaiting-both'
		| 'rejected';

	const matrixRows = $derived<
		{
			key: keyof FunnelMatrix;
			label: string;
			data: FraudRow;
			cellMeaning: Record<keyof FraudRow, MatrixCellMeaning>;
		}[]
	>(
		funnelMatrix
			? [
					{
						key: 'reviewApproved',
						label: 'Reviewer: approved',
						data: funnelMatrix.reviewApproved,
						cellMeaning: {
							fraudPassed: 'approved',
							fraudPending: 'awaiting-fraud',
							fraudFailed: 'silent-reject',
						},
					},
					{
						key: 'reviewPending',
						label: 'Reviewer: pending',
						data: funnelMatrix.reviewPending,
						cellMeaning: {
							fraudPassed: 'awaiting-review',
							fraudPending: 'awaiting-both',
							fraudFailed: 'silent-reject',
						},
					},
					{
						key: 'reviewRejected',
						label: 'Reviewer: rejected',
						data: funnelMatrix.reviewRejected,
						cellMeaning: {
							fraudPassed: 'rejected',
							fraudPending: 'rejected',
							fraudFailed: 'silent-reject',
						},
					},
				]
			: [],
	);

	function cellStyle(meaning: MatrixCellMeaning) {
		switch (meaning) {
			case 'approved':
				return 'bg-green-500/15 border-green-500 text-green-700 dark:text-green-300';
			case 'silent-reject':
				return 'bg-orange-500/15 border-orange-500 text-orange-700 dark:text-orange-300';
			case 'awaiting-fraud':
			case 'awaiting-review':
			case 'awaiting-both':
				return 'bg-yellow-500/15 border-yellow-500 text-yellow-800 dark:text-yellow-200';
			case 'rejected':
				return 'bg-red-500/15 border-red-500 text-red-700 dark:text-red-300';
		}
	}
	function cellLabel(meaning: MatrixCellMeaning) {
		switch (meaning) {
			case 'approved':
				return 'Final approved';
			case 'silent-reject':
				return 'Silent reject';
			case 'awaiting-fraud':
				return 'Awaiting fraud';
			case 'awaiting-review':
				return 'Awaiting reviewer';
			case 'awaiting-both':
				return 'Awaiting both';
			case 'rejected':
				return 'Rejected';
		}
	}

	let charts: EChart[] = [];
	let medianReviewEl = $state<HTMLDivElement | null>(null);
	let medianFraudCheckEl = $state<HTMLDivElement | null>(null);
	let projectFunnelEl = $state<HTMLDivElement | null>(null);
	let projectsReviewedEl = $state<HTMLDivElement | null>(null);
	let hoursDistributionEl = $state<HTMLDivElement | null>(null);

	onMount(async () => {
		const { data: me, error: authErr } = await api.GET('/api/user/auth/me');
		if (authErr || !me) {
			goto('/login');
			return;
		}
		if (me.role !== 'admin' && me.role !== 'superadmin' && me.role !== 'reviewer') {
			goto('/app/projects');
			return;
		}
		await loadStats();
		window.addEventListener('resize', handleResize);
	});

	onDestroy(() => {
		charts.forEach((c) => c.dispose());
		charts = [];
		if (typeof window !== 'undefined') window.removeEventListener('resize', handleResize);
	});

	function handleResize() {
		charts.forEach((c) => c.resize());
	}

	async function loadStats() {
		loading = true;
		error = null;
		try {
			const { data, error: fetchErr } = await api.GET('/api/reviewer/stats');
			if (fetchErr) throw new Error('Failed to fetch review stats');
			stats = data ?? null;
			loading = false;
			await tick();
			renderCharts();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load stats';
		} finally {
			loading = false;
		}
	}

	function isDark() {
		return $theme === 'dark';
	}
	function textColor() {
		return isDark() ? '#e2e8f0' : '#334155';
	}
	function dimColor() {
		return isDark() ? '#94a3b8' : '#64748b';
	}
	function gridColor() {
		return isDark() ? '#334155' : '#e2e8f0';
	}

	function initChart(el: HTMLDivElement | null): EChart | null {
		if (!el) return null;
		const existing = echarts.getInstanceByDom(el);
		if (existing) existing.dispose();
		const chart = echarts.init(el, undefined, { renderer: 'canvas' });
		charts.push(chart);
		return chart;
	}

	function renderCharts() {
		if (!stats) return;
		charts.forEach((c) => c.dispose());
		charts = [];
		renderLineChart(
			medianReviewEl,
			stats.historical.medianReviewTimeHours,
			'#f97316',
			'rgba(249,115,22,0.15)',
			'h',
		);
		renderLineChart(
			medianFraudCheckEl,
			stats.historical.medianFraudCheckTimeHours,
			'#ef4444',
			'rgba(239,68,68,0.15)',
			'h',
		);
		renderProjectFunnel();
		renderProjectsMultiLine();
		renderHoursDistribution();
	}

	function renderHoursDistribution() {
		const chart = initChart(hoursDistributionEl);
		if (!chart || !stats) return;

		const data = stats.hoursDistribution[hoursDistMode];
		const axisName =
			hoursDistMode === 'approved' ? 'approved hours' : 'tracked hours';
		const barColor =
			hoursDistMode === 'approved'
				? '#16a34a'
				: hoursDistMode === 'shipped'
					? '#f97316'
					: '#3b82f6';

		chart.setOption({
			backgroundColor: 'transparent',
			grid: { left: 45, right: 12, top: 16, bottom: 32 },
			xAxis: {
				type: 'category',
				data: data.map((d) => d.bucket),
				axisLabel: { color: dimColor(), fontSize: 10 },
				axisLine: { lineStyle: { color: gridColor() } },
				axisTick: { show: false },
				name: axisName,
				nameLocation: 'middle',
				nameGap: 26,
				nameTextStyle: { color: dimColor(), fontSize: 10 },
			},
			yAxis: {
				type: 'value',
				axisLabel: { color: dimColor(), fontSize: 10 },
				splitLine: { lineStyle: { color: gridColor(), type: 'dashed' } },
				axisLine: { show: false },
				min: 0,
			},
			tooltip: {
				trigger: 'axis',
				formatter: (params: any) => {
					const p = params[0];
					return `${p.axisValue}h<br/><b>${p.value}</b> projects`;
				},
			},
			series: [
				{
					type: 'bar',
					data: data.map((d) => d.count),
					itemStyle: { color: barColor },
					barWidth: '70%',
				},
			],
		});
	}

	$effect(() => {
		// Re-render charts when theme flips or tab changes so axis colors track
		// and bindings into newly-mounted DOM nodes get hooked up.
		$theme;
		breakdownTab;
		hoursDistMode;
		if (stats) tick().then(() => renderCharts());
	});

	function renderLineChart(
		el: HTMLDivElement | null,
		data: DataPoint[],
		color: string,
		areaColor: string,
		suffix = '',
	) {
		const chart = initChart(el);
		if (!chart) return;

		const hasData = data && data.length > 0;
		const emptyLabels = Array.from({ length: 30 }, (_, i) => {
			const d = new Date();
			d.setDate(d.getDate() - 29 + i);
			return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
		});

		chart.setOption({
			backgroundColor: 'transparent',
			grid: { left: 45, right: 12, top: 10, bottom: 24 },
			xAxis: {
				type: 'category',
				data: hasData ? data.map((d) => d.date.slice(5)) : emptyLabels,
				axisLabel: { color: dimColor(), fontSize: 10 },
				axisLine: { lineStyle: { color: gridColor() } },
				axisTick: { show: false },
			},
			yAxis: {
				type: 'value',
				axisLabel: { color: dimColor(), fontSize: 10, formatter: `{value}${suffix}` },
				splitLine: { lineStyle: { color: gridColor(), type: 'dashed' } },
				axisLine: { show: false },
				min: 0,
				max: hasData ? undefined : 100,
			},
			tooltip: hasData
				? {
						trigger: 'axis',
						formatter: (params: any) => {
							const p = params[0];
							return `${p.axisValue}<br/>${p.value}${suffix}`;
						},
					}
				: { show: false },
			series: [
				{
					type: 'line',
					data: hasData ? data.map((d) => d.value) : [],
					smooth: true,
					symbol: 'circle',
					symbolSize: 5,
					lineStyle: { color, width: 2 },
					itemStyle: { color },
					areaStyle: { color: areaColor },
				},
			],
		});
	}

	function renderProjectFunnel() {
		const chart = initChart(projectFunnelEl);
		if (!chart || !stats) return;

		const m = stats.reviewProjects.funnelMatrix;
		if (!m) return;
		const dark = isDark();
		const axis = textColor();

		const greenBg = dark ? '#22c55e' : '#16a34a';
		const yellowBg = dark ? '#eab308' : '#ca8a04';
		const redBg = dark ? '#ef4444' : '#dc2626';
		const blueBg = dark ? '#60a5fa' : '#3b82f6';
		const orangeBg = dark ? '#fb923c' : '#ea580c';

		const shippedTotal =
			m.reviewApproved.fraudPassed + m.reviewApproved.fraudFailed + m.reviewApproved.fraudPending +
			m.reviewPending.fraudPassed + m.reviewPending.fraudFailed + m.reviewPending.fraudPending +
			m.reviewRejected.fraudPassed + m.reviewRejected.fraudFailed + m.reviewRejected.fraudPending;

		const fraudPassedTotal =
			m.reviewApproved.fraudPassed + m.reviewPending.fraudPassed + m.reviewRejected.fraudPassed;
		const fraudPendingTotal =
			m.reviewApproved.fraudPending + m.reviewPending.fraudPending + m.reviewRejected.fraudPending;
		const fraudFailedTotal =
			m.reviewApproved.fraudFailed + m.reviewPending.fraudFailed + m.reviewRejected.fraudFailed;

		const reviewerApprovedTotal = m.reviewApproved.fraudPassed + m.reviewApproved.fraudPending;
		const reviewerPendingTotal = m.reviewPending.fraudPassed + m.reviewPending.fraudPending;
		const reviewerRejectedTotal = m.reviewRejected.fraudPassed + m.reviewRejected.fraudPending;

		const nodes = [
			{ name: `Shipped\n${shippedTotal}`, itemStyle: { color: blueBg } },
			{ name: `Fraud: passed\n${fraudPassedTotal}`, itemStyle: { color: greenBg } },
			{ name: `Fraud: pending\n${fraudPendingTotal}`, itemStyle: { color: yellowBg } },
			{ name: `Fraud: failed\n${fraudFailedTotal}`, itemStyle: { color: redBg } },
			{ name: `Reviewer: approved\n${reviewerApprovedTotal}`, itemStyle: { color: greenBg } },
			{ name: `Reviewer: pending\n${reviewerPendingTotal}`, itemStyle: { color: yellowBg } },
			{ name: `Reviewer: rejected\n${reviewerRejectedTotal}`, itemStyle: { color: redBg } },
			{ name: `Silent reject\n${fraudFailedTotal}`, itemStyle: { color: orangeBg } },
		];

		const links = [
			{ source: nodes[0].name, target: nodes[1].name, value: fraudPassedTotal || 0.0001 },
			{ source: nodes[0].name, target: nodes[2].name, value: fraudPendingTotal || 0.0001 },
			{ source: nodes[0].name, target: nodes[3].name, value: fraudFailedTotal || 0.0001 },
			{ source: nodes[1].name, target: nodes[4].name, value: m.reviewApproved.fraudPassed || 0.0001 },
			{ source: nodes[1].name, target: nodes[5].name, value: m.reviewPending.fraudPassed || 0.0001 },
			{ source: nodes[1].name, target: nodes[6].name, value: m.reviewRejected.fraudPassed || 0.0001 },
			{ source: nodes[2].name, target: nodes[4].name, value: m.reviewApproved.fraudPending || 0.0001 },
			{ source: nodes[2].name, target: nodes[5].name, value: m.reviewPending.fraudPending || 0.0001 },
			{ source: nodes[2].name, target: nodes[6].name, value: m.reviewRejected.fraudPending || 0.0001 },
			{ source: nodes[3].name, target: nodes[7].name, value: fraudFailedTotal || 0.0001 },
		];

		chart.setOption({
			backgroundColor: 'transparent',
			tooltip: {
				trigger: 'item',
				triggerOn: 'mousemove',
				formatter: (p: any) => {
					if (p.dataType === 'edge') {
						return `${p.data.source.split('\n')[0]} → ${p.data.target.split('\n')[0]}<br/><b>${Math.round(p.data.value).toLocaleString()}</b> projects`;
					}
					return `<b>${p.name.split('\n')[0]}</b><br/>${p.name.split('\n')[1]} projects`;
				},
			},
			series: [
				{
					type: 'sankey',
					left: 8,
					right: 160,
					top: 8,
					bottom: 8,
					nodeWidth: 18,
					nodeGap: 12,
					draggable: false,
					data: nodes,
					links,
					lineStyle: { color: 'gradient', curveness: 0.5, opacity: 0.5 },
					label: { color: axis, fontSize: 11, fontWeight: 600 },
					emphasis: { focus: 'adjacency' },
				},
			],
		});
	}

	function renderProjectsMultiLine() {
		const chart = initChart(projectsReviewedEl);
		if (!chart || !stats) return;

		const reviewed = stats.historical.reviewsCompleted;
		const shipped = stats.historical.projectsShipped;
		const fraudChecked = stats.historical.projectsFraudChecked;
		const hasData =
			(reviewed && reviewed.length > 0) ||
			(shipped && shipped.length > 0) ||
			(fraudChecked && fraudChecked.length > 0);

		const allDates = new Set<string>();
		[reviewed, shipped, fraudChecked].forEach((arr) =>
			(arr || []).forEach((d) => allDates.add(d.date.slice(5))),
		);
		const dates = [...allDates].sort();

		const emptyLabels = Array.from({ length: 30 }, (_, i) => {
			const d = new Date();
			d.setDate(d.getDate() - 29 + i);
			return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
		});

		const toMap = (arr: DataPoint[]) => {
			const m = new Map<string, number>();
			(arr || []).forEach((d) => m.set(d.date.slice(5), d.value));
			return m;
		};
		const reviewedMap = toMap(reviewed);
		const shippedMap = toMap(shipped);
		const fraudCheckedMap = toMap(fraudChecked);
		const xLabels = hasData ? dates : emptyLabels;

		chart.setOption({
			backgroundColor: 'transparent',
			grid: { left: 45, right: 12, top: 30, bottom: 24 },
			legend: {
				top: 0,
				textStyle: { color: dimColor(), fontSize: 10 },
				itemWidth: 14,
				itemHeight: 8,
			},
			xAxis: {
				type: 'category',
				data: xLabels,
				axisLabel: { color: dimColor(), fontSize: 10 },
				axisLine: { lineStyle: { color: gridColor() } },
				axisTick: { show: false },
			},
			yAxis: {
				type: 'value',
				axisLabel: { color: dimColor(), fontSize: 10 },
				splitLine: { lineStyle: { color: gridColor(), type: 'dashed' } },
				axisLine: { show: false },
				min: 0,
				max: hasData ? undefined : 100,
			},
			tooltip: hasData ? { trigger: 'axis' } : { show: false },
			series: [
				{
					name: 'Shipped',
					type: 'line',
					data: hasData ? xLabels.map((d) => shippedMap.get(d) ?? null) : [],
					smooth: true,
					symbol: 'circle',
					symbolSize: 4,
					lineStyle: { color: '#3b82f6', width: 2 },
					itemStyle: { color: '#3b82f6' },
				},
				{
					name: 'Fraud Checked',
					type: 'line',
					data: hasData ? xLabels.map((d) => fraudCheckedMap.get(d) ?? null) : [],
					smooth: true,
					symbol: 'circle',
					symbolSize: 4,
					lineStyle: { color: '#f97316', width: 2 },
					itemStyle: { color: '#f97316' },
				},
				{
					name: 'Reviewed',
					type: 'line',
					data: hasData ? xLabels.map((d) => reviewedMap.get(d) ?? null) : [],
					smooth: true,
					symbol: 'circle',
					symbolSize: 4,
					lineStyle: { color: '#22c55e', width: 2 },
					itemStyle: { color: '#22c55e' },
				},
			],
		});
	}

	function formatHours(hours: number | null): string {
		if (hours === null) return '--';
		if (hours < 1) return `${Math.round(hours * 60)}min`;
		const h = Math.floor(hours);
		const m = Math.round((hours - h) * 60);
		if (m === 0) return `${h}h`;
		return `${h}h ${m}min`;
	}

	function formatTotal(value: number): string {
		return value.toLocaleString(undefined, { maximumFractionDigits: 1 });
	}

	function formatCount(value: number): string {
		return value.toLocaleString();
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

	{#if error}
		<div class="flex flex-col items-center justify-center h-64 gap-2 text-rv-red">
			<p>{error}</p>
			<button
				class="mt-2 bg-rv-surface2 border border-rv-border text-rv-text px-4 py-1.5 rounded-md cursor-pointer text-sm"
				onclick={loadStats}>Retry</button
			>
		</div>
	{:else}
		<div class="max-w-6xl mx-auto px-5 py-6 flex flex-col gap-6">
			<!-- General stats cards -->
			<section>
				<h2 class="text-[13px] uppercase tracking-wider text-rv-dim mb-3 font-semibold">
					Last 30 Days
				</h2>
				<div class="grid grid-cols-2 md:grid-cols-4 gap-3">
					<StatCard
						label="Avg Review Time"
						value={formatHours(stats?.general.avgReviewTimeLast30Days ?? null)}
						valueClass="text-rv-accent"
						{loading}
					/>
					<StatCard
						label="Median Review Time"
						value={formatHours(stats?.general.medianReviewTimeLast30Days ?? null)}
						valueClass="text-rv-accent"
						{loading}
					/>
					<StatCard
						label="Longest Wait"
						value={formatHours(stats?.general.longestWaitLast30Days ?? null)}
						valueClass="text-rv-red"
						{loading}
					/>
					<StatCard
						label="Current Longest Wait"
						value={formatHours(stats?.general.longestCurrentWait ?? null)}
						valueClass="text-rv-red"
						{loading}
					/>
				</div>
				<div class="mt-2 text-[11px] text-rv-dim">
					{#if loading}
						<Skeleton class="h-3 w-64 inline-block align-middle" />
					{:else}
						{stats?.general.reviewsLast30Days ?? 0} reviews completed in the last 30 days
					{/if}
				</div>
			</section>

			<!-- Breakdown tabs -->
			<div class="flex gap-1.5 border-b border-rv-border -mb-2">
				<button
					class="px-4 py-2 text-[12px] font-medium cursor-pointer transition-all duration-150 border-b-2 {breakdownTab ===
					'projects'
						? 'border-rv-accent text-rv-accent'
						: 'border-transparent text-rv-dim hover:text-rv-text'}"
					onclick={() => (breakdownTab = 'projects')}>Projects</button
				>
				<button
					class="px-4 py-2 text-[12px] font-medium cursor-pointer transition-all duration-150 border-b-2 {breakdownTab ===
					'leaderboard'
						? 'border-rv-accent text-rv-accent'
						: 'border-transparent text-rv-dim hover:text-rv-text'}"
					onclick={() => (breakdownTab = 'leaderboard')}>Leaderboard</button
				>
				<button
					class="px-4 py-2 text-[12px] font-medium cursor-pointer transition-all duration-150 border-b-2 {breakdownTab ===
					'hours'
						? 'border-rv-accent text-rv-accent'
						: 'border-transparent text-rv-dim hover:text-rv-text'}"
					onclick={() => (breakdownTab = 'hours')}>Hours</button
				>
				<button
					class="px-4 py-2 text-[12px] font-medium cursor-pointer transition-all duration-150 border-b-2 {breakdownTab ===
					'median'
						? 'border-rv-accent text-rv-accent'
						: 'border-transparent text-rv-dim hover:text-rv-text'}"
					onclick={() => (breakdownTab = 'median')}>Median Review Time</button
				>
			</div>

			{#if breakdownTab === 'hours'}
			<!-- Hours breakdown -->
			<section>
				<div class="grid grid-cols-2 md:grid-cols-3 gap-3">
					<StatCard
						label="Tracked Hours"
						value={stats ? formatTotal(stats.hours.trackedHours) : ''}
						{loading}
					/>
					<StatCard
						label="Unshipped Hours"
						value={stats ? formatTotal(stats.hours.unshippedHours) : ''}
						{loading}
					/>
					<StatCard
						label="Shipped Hours"
						value={stats ? formatTotal(stats.hours.shippedHours) : ''}
						{loading}
					/>
					<StatCard
						label="Hours in Review"
						value={stats ? formatTotal(stats.hours.hoursInReview) : ''}
						{loading}
					/>
					<StatCard
						label="Approved Hours"
						value={stats ? formatTotal(stats.hours.approvedHours) : ''}
						sublabel={stats ? `${formatTotal(stats.hours.weightedGrants)} weighted grants` : null}
						{loading}
					/>
					<StatCard
						label="Rejected Hours"
						value={stats ? formatTotal(stats.hours.rejectedHours) : ''}
						{loading}
					/>
				</div>

				<div class="bg-rv-surface border border-rv-border rounded-lg p-4 mt-3">
					<div class="mb-2 flex items-center justify-between gap-2">
						<div class="text-[11px] text-rv-dim uppercase tracking-wide">
							Project distribution by hours
						</div>
						<select
							bind:value={hoursDistMode}
							class="rounded-md border border-rv-border bg-rv-surface2 px-2 py-1 text-xs text-rv-text"
							disabled={loading}
						>
							<option value="unshipped">Unshipped (incl. pending/approved)</option>
							<option value="shipped">Shipped but pending (incl. approved)</option>
							<option value="approved">Approved hours</option>
						</select>
					</div>
					{#if loading}
						<Skeleton class="h-55 w-full" />
					{:else}
						<div bind:this={hoursDistributionEl} style="height: 220px;"></div>
					{/if}
				</div>
			</section>
			{/if}

			{#if breakdownTab === 'median'}
				<!-- Median Review Time -->
				<section>
					<div class="grid gap-3 sm:grid-cols-2 mb-3">
						<StatCard
							label="Median Fraud Check Time This Week"
							value={stats?.reviewStats.medianFraudCheckTimeThisWeek != null
								? formatHours(stats.reviewStats.medianFraudCheckTimeThisWeek)
								: '—'}
							{loading}
						/>
						<StatCard
							label="Last Project Fraud Check Time"
							value={stats?.reviewStats.lastProjectFraudCheckTime != null
								? formatHours(stats.reviewStats.lastProjectFraudCheckTime)
								: '—'}
							{loading}
						/>
					</div>
					<div class="bg-rv-surface border border-rv-border rounded-lg p-4 mb-3">
						<div class="text-[11px] text-rv-dim uppercase tracking-wide mb-2">
							Median Fraud Check Time — Weekly Avg
						</div>
						{#if loading}
							<Skeleton class="h-45 w-full" />
						{:else}
							<div bind:this={medianFraudCheckEl} style="height: 180px;"></div>
							{#if stats && stats.historical.medianFraudCheckTimeHours.length === 0}
								<p class="text-[10px] text-rv-dim text-center mt-1">No historical data yet</p>
							{/if}
						{/if}
					</div>
					<hr class="my-4 border-rv-border opacity-50" />
					<div class="grid gap-3 sm:grid-cols-2 mb-3">
						<StatCard
							label="Median Review Time This Week"
							value={stats?.reviewStats.medianReviewTimeThisWeek != null
								? formatHours(stats.reviewStats.medianReviewTimeThisWeek)
								: '—'}
							{loading}
						/>
						<StatCard
							label="Last Project Review Time"
							value={stats?.reviewStats.lastProjectReviewTime != null
								? formatHours(stats.reviewStats.lastProjectReviewTime)
								: '—'}
							{loading}
						/>
					</div>
					<div class="bg-rv-surface border border-rv-border rounded-lg p-4">
						<div class="text-[11px] text-rv-dim uppercase tracking-wide mb-2">
							Median Review Time — Weekly Avg
						</div>
						{#if loading}
							<Skeleton class="h-45 w-full" />
						{:else}
							<div bind:this={medianReviewEl} style="height: 180px;"></div>
							{#if stats && stats.historical.medianReviewTimeHours.length === 0}
								<p class="text-[10px] text-rv-dim text-center mt-1">No historical data yet</p>
							{/if}
						{/if}
					</div>
				</section>
			{/if}

			{#if breakdownTab === 'projects'}
				<!-- Review Stats — Projects -->
				<section>
					<div class="bg-rv-surface border border-rv-border rounded-lg p-4 mb-3">
						<div class="text-[11px] text-rv-dim uppercase tracking-wide mb-2">
							Project flow through the two gates
						</div>
						{#if loading}
							<Skeleton class="h-80 w-full" />
						{:else}
							<div bind:this={projectFunnelEl} style="height: 320px;"></div>
						{/if}
					</div>

					{#if loading}
						<div class="bg-rv-surface border border-rv-border rounded-lg p-4 mb-3">
							<Skeleton class="h-3 w-72 mb-3" />
							<div class="grid grid-cols-[max-content_repeat(3,minmax(0,1fr))] gap-2">
								<div></div>
								{#each Array(3) as _}
									<Skeleton class="h-3 w-24 mx-auto" />
								{/each}
								{#each Array(3) as _}
									<Skeleton class="h-4 w-32" />
									{#each Array(3) as _}
										<Skeleton class="h-14 w-full" />
									{/each}
								{/each}
							</div>
						</div>
						<div class="grid gap-3 sm:grid-cols-4 mb-3">
							{#each Array(4) as _}
								<div class="rounded-lg border border-rv-border bg-rv-surface p-4">
									<Skeleton class="h-3 w-20 mb-2" />
									<Skeleton class="h-7 w-16" />
								</div>
							{/each}
						</div>
					{:else if funnelMatrix}
						<div class="bg-rv-surface border border-rv-border rounded-lg p-4 mb-3">
							<div class="text-[11px] text-rv-dim uppercase tracking-wide mb-3">
								Where every project sits right now (latest submission)
							</div>
							<div class="grid grid-cols-[max-content_repeat(3,minmax(0,1fr))] gap-2">
								<div></div>
								<div class="text-center text-[11px] font-semibold text-rv-dim pb-1">
									Fraud: passed
								</div>
								<div class="text-center text-[11px] font-semibold text-rv-dim pb-1">
									Fraud: pending
								</div>
								<div class="text-center text-[11px] font-semibold text-rv-dim pb-1">
									Fraud: failed
								</div>
								{#each matrixRows as row}
									<div
										class="flex items-center text-[11px] font-semibold text-rv-dim pr-3 whitespace-nowrap"
									>
										{row.label}
									</div>
									{#each ['fraudPassed', 'fraudPending', 'fraudFailed'] as const as fraudKey}
										<div
											class={`rounded-md border px-3 py-2.5 ${cellStyle(row.cellMeaning[fraudKey])}`}
										>
											<div class="text-[10px] font-semibold uppercase tracking-wide opacity-80">
												{cellLabel(row.cellMeaning[fraudKey])}
											</div>
											<div class="text-lg font-bold">{formatCount(row.data[fraudKey])}</div>
										</div>
									{/each}
								{/each}
							</div>
						</div>

						<div class="grid gap-3 sm:grid-cols-4 mb-3">
							<div class="space-y-1 rounded-lg border border-green-500/40 bg-green-500/5 p-4">
								<div class="text-[11px] font-semibold uppercase tracking-wide text-green-700 dark:text-green-300">
									✓ Approved
								</div>
								<div class="text-2xl font-bold text-rv-text">{formatCount(finalApproved)}</div>
							</div>
							<div class="space-y-1 rounded-lg border border-yellow-500/40 bg-yellow-500/5 p-4">
								<div class="text-[11px] font-semibold uppercase tracking-wide text-yellow-700 dark:text-yellow-300">
									↻ In-flight
								</div>
								<div class="text-2xl font-bold text-rv-text">{formatCount(finalInFlight)}</div>
							</div>
							<div class="space-y-1 rounded-lg border border-red-500/40 bg-red-500/5 p-4">
								<div class="text-[11px] font-semibold uppercase tracking-wide text-red-700 dark:text-red-300">
									✗ Rejected
								</div>
								<div class="text-2xl font-bold text-rv-text">{formatCount(finalRejected)}</div>
							</div>
							<div class="space-y-1 rounded-lg border border-orange-500/40 bg-orange-500/5 p-4">
								<div class="text-[11px] font-semibold uppercase tracking-wide text-orange-700 dark:text-orange-300">
									⚠ Silent reject
								</div>
								<div class="text-2xl font-bold text-rv-text">
									{formatCount(finalSilentReject)}
								</div>
							</div>
						</div>
					{/if}

					<div class="grid gap-3 sm:grid-cols-3 mb-3">
						<StatCard
							label="Fraud Queue"
							value={stats ? formatCount(stats.reviewProjects.fraudQueue) : ''}
							{loading}
						/>
						<StatCard
							label="Review Queue"
							value={stats ? formatCount(stats.reviewProjects.reviewQueue) : ''}
							{loading}
						/>
						<StatCard
							label="Reviewed"
							value={stats ? formatCount(stats.reviewProjects.reviewed) : ''}
							{loading}
						/>
					</div>
					<hr class="my-4 border-rv-border opacity-50" />
					<div class="grid gap-3 sm:grid-cols-3 mb-3">
						<StatCard
							label="Shipped This Week"
							value={stats ? formatCount(stats.reviewProjects.shippedThisWeek) : ''}
							{loading}
						/>
						<StatCard
							label="Fraud Checked This Week"
							value={stats ? formatCount(stats.reviewProjects.fraudCheckedThisWeek) : ''}
							{loading}
						/>
						<StatCard
							label="Reviewed This Week"
							value={stats ? formatCount(stats.reviewProjects.reviewedThisWeek) : ''}
							{loading}
						/>
					</div>
					<div class="bg-rv-surface border border-rv-border rounded-lg p-4">
						<div class="text-[11px] text-rv-dim uppercase tracking-wide mb-2">Projects (30d)</div>
						{#if loading}
							<Skeleton class="h-50 w-full" />
						{:else}
							<div bind:this={projectsReviewedEl} style="height: 200px;"></div>
							{#if stats && stats.historical.reviewsCompleted.length === 0 && (!stats.historical.projectsShipped || stats.historical.projectsShipped.length === 0)}
								<p class="text-[10px] text-rv-dim text-center mt-1">No historical data yet</p>
							{/if}
						{/if}
					</div>
				</section>
			{/if}

			{#if breakdownTab === 'leaderboard'}
			<!-- Leaderboard -->
			<section>
				<div class="flex items-center justify-end mb-3">
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

				{#if loading}
					<div class="bg-rv-surface border border-rv-border rounded-lg overflow-hidden p-4 flex flex-col gap-2">
						{#each Array(5) as _}
							<div class="flex items-center gap-3 py-1">
								<Skeleton class="h-3 w-6" />
								<Skeleton class="h-3 flex-1" />
								<Skeleton class="h-3 w-10" />
							</div>
						{/each}
					</div>
				{:else if currentLeaderboard.length === 0}
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
			{/if}
		</div>
	{/if}
</div>
