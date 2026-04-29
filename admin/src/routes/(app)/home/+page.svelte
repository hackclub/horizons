<script lang="ts">
	import { base } from '$app/paths';
	import { onMount, onDestroy, tick } from 'svelte';
	import { api, type components } from '$lib/api';
	import { Button } from '$lib/components';
	import { theme } from '$lib/themeStore';
	import * as echarts from 'echarts';

	let worldMapRegistered = false;

	type Stats = components['schemas']['AdminStatsResponse'];
	type DataPoint = { date: string; value: number };
	type EChart = echarts.ECharts;

	let stats = $state<Stats | null>(null);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let selectedEventFilter = $state<string>('all');
	let unmatchedOriginCountries = $state<string[]>([]);
	let unmatchedEventCountries = $state<string[]>([]);

	const validCountryNames = new Set<string>();

	// Derived state-matrix data for the Review Stats — Projects section.
	type FunnelMatrix = components['schemas']['StatsFunnelMatrix'];
	type FraudRow = components['schemas']['StatsFunnelMatrixRow'];
	const funnelMatrix = $derived<FunnelMatrix | null>(
		stats ? (stats.reviewProjects.funnelMatrix ?? null) : null,
	);
	const finalApproved = $derived(funnelMatrix ? funnelMatrix.reviewApproved.fraudPassed : 0);
	// Fraud-wins rule: any fraud-failed cell is a silent reject regardless of
	// what the reviewer recorded.
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
							// Fraud failed before reviewer acted — the state machine
							// removes it from the queue and silent-rejects it.
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
							// Fraud-wins rule: a fraud failure silent-rejects regardless of
							// what the reviewer recorded.
							fraudFailed: 'silent-reject',
						},
					},
				]
			: [],
	);

	function cellStyle(meaning: MatrixCellMeaning) {
		switch (meaning) {
			case 'approved':
				return 'bg-green-500/15 border-green-500 text-green-700';
			case 'silent-reject':
				return 'bg-orange-500/15 border-orange-500 text-orange-700';
			case 'awaiting-fraud':
			case 'awaiting-review':
			case 'awaiting-both':
				return 'bg-yellow-500/15 border-yellow-500 text-yellow-800';
			case 'rejected':
				return 'bg-red-500/15 border-red-500 text-red-700';
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

	// Chart instances for cleanup
	let charts: EChart[] = [];

	// Container refs
	let funnelEl = $state<HTMLDivElement | null>(null);
	let userGrowthEl = $state<HTMLDivElement | null>(null);
	let dauEl = $state<HTMLDivElement | null>(null);
	let dailyHoursEl = $state<HTMLDivElement | null>(null);
	let medianReviewEl = $state<HTMLDivElement | null>(null);
	let medianFraudCheckEl = $state<HTMLDivElement | null>(null);
	let projectFunnelEl = $state<HTMLDivElement | null>(null);
	let projectsReviewedEl = $state<HTMLDivElement | null>(null);
	let signupsEl = $state<HTMLDivElement | null>(null);
	let signupMapEl = $state<HTMLDivElement | null>(null);
	let signupQualificationEl = $state<HTMLDivElement | null>(null);
	let signupQualificationMode = $state<'unshipped' | 'shipped' | 'approved'>('approved');
	let utmEl = $state<HTMLDivElement | null>(null);

	onMount(() => {
		loadStats();
		window.addEventListener('resize', handleResize);
	});

	$effect(() => {
		// Re-render qualification chart when mode toggle changes (after stats load).
		signupQualificationMode;
		if (stats && signupQualificationEl) renderSignupQualificationChart();
	});

	onDestroy(() => {
		charts.forEach((c) => c.dispose());
		charts = [];
		if (typeof window !== 'undefined') window.removeEventListener('resize', handleResize);
	});

	function handleResize() {
		charts.forEach((c) => c.resize());
	}

	function formatHours(value: number) {
		return value.toLocaleString(undefined, { maximumFractionDigits: 1 });
	}

	function formatCount(value: number) {
		return value.toLocaleString();
	}

	function formatPercent(value: number) {
		const sign = value >= 0 ? '+' : '';
		return `${sign}${value.toFixed(1)}%`;
	}

	function isDark() {
		return $theme === 'dark';
	}

	function textColor() { return isDark() ? '#e2e8f0' : '#334155'; }
	function dimColor() { return isDark() ? '#94a3b8' : '#64748b'; }
	function gridColor() { return isDark() ? '#334155' : '#e2e8f0'; }
	function bgColor() { return 'transparent'; }

	async function loadStats() {
		loading = true;
		error = null;
		try {
			const { data, error: fetchErr } = await api.GET('/api/admin/stats');
			if (fetchErr) throw new Error('Failed to fetch stats');
			stats = data ?? null;
			loading = false;
			await tick();
			renderAll();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load stats';
		} finally {
			loading = false;
		}
	}

	function initChart(el: HTMLDivElement | null): EChart | null {
		if (!el) return null;
		const existing = echarts.getInstanceByDom(el);
		if (existing) existing.dispose();
		const chart = echarts.init(el, undefined, { renderer: 'canvas' });
		charts.push(chart);
		return chart;
	}

	function renderAll() {
		if (!stats) return;
		// Dispose old charts
		charts.forEach((c) => c.dispose());
		charts = [];

		renderFunnel();
		renderLineChart(userGrowthEl, stats.historical.newSignups, '#3b82f6', 'rgba(59,130,246,0.15)');
		renderLineChart(dauEl, stats.historical.dau, '#3b82f6', 'rgba(59,130,246,0.15)');
		renderLineChart(dailyHoursEl, stats.historical.dailyHoursLogged, '#22c55e', 'rgba(34,197,94,0.15)', 'h');
		renderLineChart(medianReviewEl, stats.historical.medianReviewTimeHours, '#f97316', 'rgba(249,115,22,0.15)', 'h');
		renderLineChart(medianFraudCheckEl, stats.historical.medianFraudCheckTimeHours, '#ef4444', 'rgba(239,68,68,0.15)', 'h');
		renderProjectFunnel();
		renderProjectsMultiLine();
		renderLineChart(signupsEl, stats.historical.newSignups, '#22c55e', 'rgba(34,197,94,0.15)');
		renderSignupQualificationChart();
		renderSignupMap();
		renderUtmChart();
	}

	function renderFunnel() {
		if (!funnelEl || !stats) return;
		funnelEl.innerHTML = '';

		const funnel = stats.funnel;
		const total = funnel.totalUsers || 1;

		const stages = [
			{ value: funnel.totalUsers, name: 'Total Users' },
			{ value: funnel.hasHackatime, name: 'Has Hackatime\nAccount' },
			{ value: funnel.createdProject, name: 'Created\nProject' },
			{ value: funnel.project10PlusHours, name: '10+ Hackatime\nHours' },
			{ value: funnel.atLeast1Submission, name: 'At Least 1\nSubmission' },
			{ value: funnel.atLeast1ApprovedHour, name: 'At Least 1\nApproved Hour' },
			{ value: funnel.approved10Plus, name: '10+ Approved\nHours' },
			{ value: funnel.approved30Plus, name: '30+ Approved\nHours' },
			{ value: funnel.approved60Plus, name: '60+ Approved\nHours' },
		];

		const w = funnelEl.clientWidth;
		const h = funnelEl.clientHeight || 420;
		const dark = isDark();
		const fill = '#3b82f6';
		const labelColor = dark ? '#e2e8f0' : '#334155';
		const dimLabel = dark ? '#94a3b8' : '#64748b';

		const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		svg.setAttribute('width', String(w));
		svg.setAttribute('height', String(h));
		svg.style.display = 'block';
		funnelEl.appendChild(svg);

		const n = stages.length;
		const headerH = 40;
		const footerH = 44;
		const bodyTop = headerH;
		const bodyBottom = h - footerH;
		const bodyH = bodyBottom - bodyTop;
		const midY = bodyTop + bodyH / 2;
		const maxHalfH = bodyH / 2;
		const colW = w / n;
		const minHalfH = 2;

		// Compute half-heights for each stage
		const halfHeights = stages.map((s) => {
			const ratio = total > 0 ? s.value / total : 0;
			return Math.max(minHalfH, ratio * maxHalfH);
		});

		// Draw filled polygon connecting all stages
		const topPoints: string[] = [];
		const bottomPoints: string[] = [];
		for (let i = 0; i < n; i++) {
			const cx = colW * i + colW / 2;
			topPoints.push(`${cx},${midY - halfHeights[i]}`);
			bottomPoints.push(`${cx},${midY + halfHeights[i]}`);
		}
		const polyPoints = [...topPoints, ...bottomPoints.reverse()].join(' ');
		const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
		polygon.setAttribute('points', polyPoints);
		polygon.setAttribute('fill', fill);
		polygon.setAttribute('opacity', '0.85');
		svg.appendChild(polygon);

		// Draw stage divider lines, header labels, footer labels
		for (let i = 0; i < n; i++) {
			const cx = colW * i + colW / 2;
			const leftX = colW * i;
			const pct = total > 0 ? ((stages[i].value / total) * 100).toFixed(2) : '0.00';

			// Vertical divider lines (except first)
			if (i > 0) {
				const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
				line.setAttribute('x1', String(leftX));
				line.setAttribute('y1', String(bodyTop));
				line.setAttribute('x2', String(leftX));
				line.setAttribute('y2', String(bodyBottom));
				line.setAttribute('stroke', dark ? '#475569' : '#cbd5e1');
				line.setAttribute('stroke-width', '1');
				line.setAttribute('stroke-dasharray', '3,3');
				line.setAttribute('opacity', '0.5');
				svg.appendChild(line);
			}

			// Header: stage name
			const headerLines = stages[i].name.split('\n');
			for (let li = 0; li < headerLines.length; li++) {
				const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
				text.setAttribute('x', String(cx));
				text.setAttribute('y', String(8 + li * 14));
				text.setAttribute('text-anchor', 'middle');
				text.setAttribute('dominant-baseline', 'hanging');
				text.setAttribute('fill', labelColor);
				text.setAttribute('font-size', '11');
				text.setAttribute('font-weight', '600');
				text.textContent = headerLines[li];
				svg.appendChild(text);
			}

			// Footer: percentage
			const pctText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
			pctText.setAttribute('x', String(cx));
			pctText.setAttribute('y', String(bodyBottom + 14));
			pctText.setAttribute('text-anchor', 'middle');
			pctText.setAttribute('fill', dimLabel);
			pctText.setAttribute('font-size', '11');
			pctText.textContent = `${pct} %`;
			svg.appendChild(pctText);

			// Footer: count
			const countText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
			countText.setAttribute('x', String(cx));
			countText.setAttribute('y', String(bodyBottom + 30));
			countText.setAttribute('text-anchor', 'middle');
			countText.setAttribute('fill', labelColor);
			countText.setAttribute('font-size', '12');
			countText.setAttribute('font-weight', '700');
			countText.textContent = stages[i].value.toLocaleString();
			svg.appendChild(countText);
		}

		// Y-axis label (left side)
		const yLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
		yLabel.setAttribute('x', String(4));
		yLabel.setAttribute('y', String(midY));
		yLabel.setAttribute('text-anchor', 'start');
		yLabel.setAttribute('dominant-baseline', 'middle');
		yLabel.setAttribute('fill', dimLabel);
		yLabel.setAttribute('font-size', '11');
		yLabel.textContent = String(total);
		svg.appendChild(yLabel);

		const ySubLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
		ySubLabel.setAttribute('x', String(4));
		ySubLabel.setAttribute('y', String(midY + 14));
		ySubLabel.setAttribute('text-anchor', 'start');
		ySubLabel.setAttribute('dominant-baseline', 'middle');
		ySubLabel.setAttribute('fill', dimLabel);
		ySubLabel.setAttribute('font-size', '10');
		ySubLabel.textContent = 'user_count';
		svg.appendChild(ySubLabel);
	}

	// Render a Sankey flow showing how projects move through the two independent
	// gates. Left column = Shipped. Middle = Fraud gate (passed / pending / failed).
	// Right = Review gate (approved / pending / rejected). Link widths reflect
	// project counts, using the project's most recent submission for review state.
	function renderProjectFunnel() {
		const chart = initChart(projectFunnelEl);
		if (!chart || !stats) return;

		const m = stats.reviewProjects.funnelMatrix;
		if (!m) return;
		const dark = isDark();
		const axis = textColor();

		// Colors per gate state
		const greenBg = dark ? '#22c55e' : '#16a34a';
		const yellowBg = dark ? '#eab308' : '#ca8a04';
		const redBg = dark ? '#ef4444' : '#dc2626';
		const blueBg = dark ? '#60a5fa' : '#3b82f6';

		const shippedTotal =
			m.reviewApproved.fraudPassed + m.reviewApproved.fraudFailed + m.reviewApproved.fraudPending +
			m.reviewPending.fraudPassed + m.reviewPending.fraudFailed + m.reviewPending.fraudPending +
			m.reviewRejected.fraudPassed + m.reviewRejected.fraudFailed + m.reviewRejected.fraudPending;

		const fraudPassedTotal = m.reviewApproved.fraudPassed + m.reviewPending.fraudPassed + m.reviewRejected.fraudPassed;
		const fraudPendingTotal = m.reviewApproved.fraudPending + m.reviewPending.fraudPending + m.reviewRejected.fraudPending;
		const fraudFailedTotal = m.reviewApproved.fraudFailed + m.reviewPending.fraudFailed + m.reviewRejected.fraudFailed;

		// Fraud-wins rule: anything that fails fraud terminates at Silent reject,
		// no matter what the reviewer recorded. So fraud-failed flow bypasses the
		// reviewer column entirely. The reviewer column only counts fraud-passed
		// and fraud-pending projects.
		const reviewerApprovedTotal = m.reviewApproved.fraudPassed + m.reviewApproved.fraudPending;
		const reviewerPendingTotal = m.reviewPending.fraudPassed + m.reviewPending.fraudPending;
		const reviewerRejectedTotal = m.reviewRejected.fraudPassed + m.reviewRejected.fraudPending;

		const orangeBg = dark ? '#fb923c' : '#ea580c';

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
			// Shipped → Fraud gate
			{ source: nodes[0].name, target: nodes[1].name, value: fraudPassedTotal || 0.0001 },
			{ source: nodes[0].name, target: nodes[2].name, value: fraudPendingTotal || 0.0001 },
			{ source: nodes[0].name, target: nodes[3].name, value: fraudFailedTotal || 0.0001 },
			// Fraud passed → Reviewer
			{ source: nodes[1].name, target: nodes[4].name, value: m.reviewApproved.fraudPassed || 0.0001 },
			{ source: nodes[1].name, target: nodes[5].name, value: m.reviewPending.fraudPassed || 0.0001 },
			{ source: nodes[1].name, target: nodes[6].name, value: m.reviewRejected.fraudPassed || 0.0001 },
			// Fraud pending → Reviewer
			{ source: nodes[2].name, target: nodes[4].name, value: m.reviewApproved.fraudPending || 0.0001 },
			{ source: nodes[2].name, target: nodes[5].name, value: m.reviewPending.fraudPending || 0.0001 },
			{ source: nodes[2].name, target: nodes[6].name, value: m.reviewRejected.fraudPending || 0.0001 },
			// Fraud failed → Silent reject (terminal — reviewer outcome is moot)
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
			backgroundColor: bgColor(),
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
			tooltip: hasData ? {
				trigger: 'axis',
				formatter: (params: any) => {
					const p = params[0];
					return `${p.axisValue}<br/>${p.value}${suffix}`;
				},
			} : { show: false },
			series: [{
				type: 'line',
				data: hasData ? data.map((d) => d.value) : [],
				smooth: true,
				symbol: 'circle',
				symbolSize: 5,
				lineStyle: { color, width: 2 },
				itemStyle: { color },
				areaStyle: { color: areaColor },
			}],
		});
	}

	function renderProjectsMultiLine() {
		const chart = initChart(projectsReviewedEl);
		if (!chart || !stats) return;

		const reviewed = stats.historical.reviewsCompleted;
		const shipped = stats.historical.projectsShipped;
		const fraudChecked = stats.historical.projectsFraudChecked;
		const hasData = (reviewed && reviewed.length > 0) || (shipped && shipped.length > 0) || (fraudChecked && fraudChecked.length > 0);

		// Collect all unique dates
		const allDates = new Set<string>();
		[reviewed, shipped, fraudChecked].forEach((arr) => (arr || []).forEach((d) => allDates.add(d.date.slice(5))));
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
			backgroundColor: bgColor(),
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
			tooltip: hasData ? {
				trigger: 'axis',
			} : { show: false },
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

	// ISO 3166-1 alpha-2 → Natural Earth country name (matches world-atlas
	// `properties.name`). Covers the codes most likely to appear in user data;
	// unknown codes pass through unchanged so the GeoJSON's own name still
	// works for full names like "United States".
	const COUNTRY_NAME_BY_CODE: Record<string, string> = {
		AE: 'United Arab Emirates', AF: 'Afghanistan', AL: 'Albania', AM: 'Armenia',
		AO: 'Angola', AR: 'Argentina', AT: 'Austria', AU: 'Australia',
		AZ: 'Azerbaijan', BA: 'Bosnia and Herz.', BD: 'Bangladesh', BE: 'Belgium',
		BG: 'Bulgaria', BH: 'Bahrain', BJ: 'Benin', BO: 'Bolivia',
		BR: 'Brazil', BW: 'Botswana', BY: 'Belarus', CA: 'Canada',
		CD: 'Dem. Rep. Congo', CF: 'Central African Rep.', CG: 'Congo', CH: 'Switzerland',
		CI: "Côte d'Ivoire", CL: 'Chile', CM: 'Cameroon', CN: 'China',
		CO: 'Colombia', CR: 'Costa Rica', CU: 'Cuba', CY: 'Cyprus',
		CZ: 'Czechia', DE: 'Germany', DK: 'Denmark', DO: 'Dominican Rep.',
		DZ: 'Algeria', EC: 'Ecuador', EE: 'Estonia', EG: 'Egypt',
		ER: 'Eritrea', ES: 'Spain', ET: 'Ethiopia', FI: 'Finland',
		FR: 'France', GA: 'Gabon', GB: 'United Kingdom', GE: 'Georgia',
		GH: 'Ghana', GN: 'Guinea', GR: 'Greece', GT: 'Guatemala',
		HK: 'Hong Kong', HN: 'Honduras', HR: 'Croatia', HT: 'Haiti',
		HU: 'Hungary', ID: 'Indonesia', IE: 'Ireland', IL: 'Israel',
		IN: 'India', IQ: 'Iraq', IR: 'Iran', IS: 'Iceland',
		IT: 'Italy', JM: 'Jamaica', JO: 'Jordan', JP: 'Japan',
		KE: 'Kenya', KG: 'Kyrgyzstan', KH: 'Cambodia', KP: 'North Korea',
		KR: 'South Korea', KW: 'Kuwait', KZ: 'Kazakhstan', LA: 'Laos',
		LB: 'Lebanon', LK: 'Sri Lanka', LT: 'Lithuania', LU: 'Luxembourg',
		LV: 'Latvia', LY: 'Libya', MA: 'Morocco', MD: 'Moldova',
		ME: 'Montenegro', MG: 'Madagascar', MK: 'North Macedonia', ML: 'Mali',
		MM: 'Myanmar', MN: 'Mongolia', MR: 'Mauritania', MT: 'Malta',
		MU: 'Mauritius', MW: 'Malawi', MX: 'Mexico', MY: 'Malaysia',
		MZ: 'Mozambique', NA: 'Namibia', NE: 'Niger', NG: 'Nigeria',
		NI: 'Nicaragua', NL: 'Netherlands', NO: 'Norway', NP: 'Nepal',
		NZ: 'New Zealand', OM: 'Oman', PA: 'Panama', PE: 'Peru',
		PG: 'Papua New Guinea', PH: 'Philippines', PK: 'Pakistan', PL: 'Poland',
		PR: 'Puerto Rico', PT: 'Portugal', PY: 'Paraguay', QA: 'Qatar',
		RO: 'Romania', RS: 'Serbia', RU: 'Russia', RW: 'Rwanda',
		SA: 'Saudi Arabia', SD: 'Sudan', SE: 'Sweden', SG: 'Singapore',
		SI: 'Slovenia', SK: 'Slovakia', SL: 'Sierra Leone', SN: 'Senegal',
		SO: 'Somalia', SR: 'Suriname', SS: 'S. Sudan', SV: 'El Salvador',
		SY: 'Syria', SZ: 'eSwatini', TD: 'Chad', TG: 'Togo',
		TH: 'Thailand', TJ: 'Tajikistan', TM: 'Turkmenistan', TN: 'Tunisia',
		TR: 'Turkey', TT: 'Trinidad and Tobago', TW: 'Taiwan', TZ: 'Tanzania',
		UA: 'Ukraine', UG: 'Uganda', US: 'United States of America', UY: 'Uruguay',
		UZ: 'Uzbekistan', VE: 'Venezuela', VN: 'Vietnam', YE: 'Yemen',
		ZA: 'South Africa', ZM: 'Zambia', ZW: 'Zimbabwe',
	};

	function normalizeCountry(value: string): string {
		const trimmed = value.trim();
		const upper = trimmed.toUpperCase();
		return COUNTRY_NAME_BY_CODE[upper] ?? trimmed;
	}

	async function ensureWorldMap() {
		if (worldMapRegistered) return;
		const [topojson, worldData, antimeridianCutMod] = await Promise.all([
			import('topojson-client'),
			import('world-atlas/countries-110m.json'),
			// @ts-expect-error — package ships no type declarations.
			import('geojson-antimeridian-cut'),
		]);
		const data = (worldData as any).default ?? worldData;
		const geo = topojson.feature(data, data.objects.countries) as any;
		const antimeridianCut =
			(antimeridianCutMod as any).default ?? (antimeridianCutMod as any);
		for (const feature of geo.features) {
			try {
				feature.geometry = antimeridianCut(feature.geometry);
			} catch {
				/* leave as-is if the cut fails */
			}
			if (feature.properties?.name) validCountryNames.add(feature.properties.name);
		}
		echarts.registerMap('world', geo);
		worldMapRegistered = true;
	}

	async function renderSignupMap() {
		if (!signupMapEl || !stats) return;
		await ensureWorldMap();

		const chart = initChart(signupMapEl);
		if (!chart) return;

		const dark = isDark();
		const routes = selectedEventFilter === 'all'
			? stats.signups.routes
			: stats.signups.routes.filter((r) => r.eventTitle === selectedEventFilter);

		const originCounts = new Map<string, number>();
		const eventCountries = new Map<string, { titles: Set<string>; total: number }>();
		const unmatchedOrigin = new Set<string>();
		const unmatchedEvent = new Set<string>();
		for (const route of routes) {
			const origin = normalizeCountry(route.originCountry);
			if (!validCountryNames.has(origin)) unmatchedOrigin.add(route.originCountry);
			originCounts.set(origin, (originCounts.get(origin) ?? 0) + route.count);

			if (route.eventCountry) {
				const eventName = normalizeCountry(route.eventCountry);
				if (!validCountryNames.has(eventName)) unmatchedEvent.add(route.eventCountry);
				const ev = eventCountries.get(eventName) ?? { titles: new Set<string>(), total: 0 };
				ev.titles.add(route.eventTitle);
				ev.total += route.count;
				eventCountries.set(eventName, ev);
			}
		}
		unmatchedOriginCountries = [...unmatchedOrigin].sort();
		unmatchedEventCountries = [...unmatchedEvent].sort();

		const choroplethData = [...originCounts].map(([name, value]) => ({ name, value }));
		const maxCount = choroplethData.reduce((m, d) => Math.max(m, d.value), 1);

		// Highlight event-host countries with a regions override (orange).
		const eventRegionStyle = dark
			? { areaColor: '#ea580c', borderColor: '#fb923c' }
			: { areaColor: '#fb923c', borderColor: '#ea580c' };
		const regions = [...eventCountries].map(([name]) => ({
			name,
			itemStyle: eventRegionStyle,
			emphasis: { itemStyle: eventRegionStyle },
		}));

		chart.setOption({
			backgroundColor: bgColor(),
			tooltip: {
				trigger: 'item',
				formatter: (p: any) => {
					const ev = eventCountries.get(p.name);
					const origin = originCounts.get(p.name) ?? 0;
					const lines = [`<b>${p.name}</b>`];
					if (origin > 0) {
						lines.push(`Signups originating: ${origin}`);
					}
					if (ev) {
						lines.push(
							`Hosts ${ev.titles.size} event${ev.titles.size === 1 ? '' : 's'} (${ev.total} attendee${ev.total === 1 ? '' : 's'})`,
						);
					}
					return origin > 0 || ev ? lines.join('<br/>') : `<b>${p.name}</b><br/>No signups`;
				},
			},
			visualMap: {
				left: 12,
				bottom: 12,
				min: 0,
				max: maxCount,
				calculable: false,
				orient: 'horizontal',
				// Neutral gray → green so the choropleth doesn't fight with the
				// blue accents used elsewhere on the dashboard.
				inRange: {
					color: dark
						? ['#1e293b', '#16a34a', '#86efac']
						: ['#f1f5f9', '#22c55e', '#15803d'],
				},
				textStyle: { color: dimColor(), fontSize: 10 },
				text: ['Many', 'Few'],
				itemWidth: 10,
				itemHeight: 80,
			},
			series: [
				{
					type: 'map',
					map: 'world',
					roam: true,
					data: choroplethData,
					regions,
					itemStyle: {
						areaColor: dark ? '#0f172a' : '#f8fafc',
						borderColor: dark ? '#334155' : '#cbd5e1',
						borderWidth: 0.5,
					},
					emphasis: {
						label: { show: false },
						itemStyle: { areaColor: dark ? '#475569' : '#cbd5e1' },
					},
					select: { disabled: true },
					label: { show: false },
				},
			],
		});
	}

	function renderSignupQualificationChart() {
		if (!stats || !stats.signups.qualification?.length) return;
		const chart = initChart(signupQualificationEl);
		if (!chart) return;

		const data = stats.signups.qualification;
		const dark = isDark();
		const mode = signupQualificationMode;

		// Four-segment funnel per event:
		// Qualified (≥30h) ⊂ Pending RSVPed (≥15h) ⊂ Engaged (≥1h) ⊂ Signed up.
		const qualifiedColor = dark ? '#15803d' : '#166534';
		const rsvpedColor = dark ? '#3b82f6' : '#2563eb';
		const engagedColor = dark ? '#22c55e' : '#16a34a';
		const signedUpOnlyColor = dark ? '#475569' : '#e2e8f0';

		const counts = (d: (typeof data)[number]) => d.modes?.[mode] ?? { engaged: d.engaged, rsvped: d.rsvped, qualified: d.qualified };
		const qualifiedData = data.map((d) => counts(d).qualified);
		const rsvpedOnlyData = data.map((d) => Math.max(0, counts(d).rsvped - counts(d).qualified));
		const engagedOnlyData = data.map((d) => Math.max(0, counts(d).engaged - counts(d).rsvped));
		const signedUpOnlyData = data.map((d) => Math.max(0, d.signedUp - counts(d).engaged));

		const segmentLabel = (value: number, total: number) => {
			if (!value || !total) return '';
			const pct = (value / total) * 100;
			return pct >= 8 ? `${value} (${pct.toFixed(0)}%)` : '';
		};

		chart.setOption({
			backgroundColor: bgColor(),
			grid: { left: 140, right: 60, top: 32, bottom: 8 },
			legend: {
				top: 0,
				textStyle: { color: dimColor(), fontSize: 10 },
				itemWidth: 14,
				itemHeight: 8,
				data: ['Qualified (≥30h)', 'Pending RSVPed (≥15h)', 'Engaged (≥1h)', 'Signed up'],
			},
			xAxis: {
				type: 'value',
				axisLabel: { color: dimColor(), fontSize: 10 },
				splitLine: { lineStyle: { color: gridColor(), type: 'dashed' } },
				axisLine: { show: false },
			},
			yAxis: {
				type: 'category',
				data: data.map((d) => d.title),
				axisLabel: { color: textColor(), fontSize: 11 },
				axisLine: { lineStyle: { color: gridColor() } },
				axisTick: { show: false },
				inverse: true,
			},
			tooltip: {
				trigger: 'axis',
				axisPointer: { type: 'shadow' },
				formatter: (params: any) => {
					const idx = params[0].dataIndex;
					const d = data[idx];
					const c = counts(d);
					const pct = (n: number) => (d.signedUp ? ((n / d.signedUp) * 100).toFixed(1) : '0.0');
					return `<b>${d.title}</b><br/>`
						+ `Signed up: ${d.signedUp} (100%)<br/>`
						+ `Engaged (≥1h): ${c.engaged} (${pct(c.engaged)}%)<br/>`
						+ `Pending RSVPed (≥15h): ${c.rsvped} (${pct(c.rsvped)}%)<br/>`
						+ `Qualified (≥30h): ${c.qualified} (${pct(c.qualified)}%)`;
				},
			},
			series: [
				{
					name: 'Qualified (≥30h)',
					type: 'bar',
					stack: 'qualification',
					data: qualifiedData,
					barWidth: 22,
					itemStyle: { color: qualifiedColor },
					label: {
						show: true,
						position: 'inside',
						color: '#fff',
						fontSize: 10,
						fontWeight: 600,
						formatter: (p: any) => segmentLabel(p.value, data[p.dataIndex].signedUp),
					},
				},
				{
					name: 'Pending RSVPed (≥15h)',
					type: 'bar',
					stack: 'qualification',
					data: rsvpedOnlyData,
					barWidth: 22,
					itemStyle: { color: rsvpedColor },
					label: {
						show: true,
						position: 'inside',
						color: '#fff',
						fontSize: 10,
						fontWeight: 600,
						formatter: (p: any) => segmentLabel(p.value, data[p.dataIndex].signedUp),
					},
				},
				{
					name: 'Engaged (≥1h)',
					type: 'bar',
					stack: 'qualification',
					data: engagedOnlyData,
					barWidth: 22,
					itemStyle: { color: engagedColor },
					label: {
						show: true,
						position: 'inside',
						color: '#fff',
						fontSize: 10,
						fontWeight: 600,
						formatter: (p: any) => segmentLabel(p.value, data[p.dataIndex].signedUp),
					},
				},
				{
					name: 'Signed up',
					type: 'bar',
					stack: 'qualification',
					data: signedUpOnlyData,
					barWidth: 22,
					itemStyle: {
						color: signedUpOnlyColor,
						borderRadius: [0, 3, 3, 0],
					},
					label: {
						show: true,
						position: 'right',
						color: dimColor(),
						fontSize: 11,
						formatter: (p: any) => String(data[p.dataIndex].signedUp),
					},
				},
			],
		});
	}

	function renderUtmChart() {
		if (!stats || stats.utm.sources.length === 0) return;
		const chart = initChart(utmEl);
		if (!chart) return;

		const data = stats.utm.sources;
		const dark = isDark();

		const shippedColor = dark ? '#6d28d9' : '#6d28d9';
		const onboardedColor = dark ? '#a78bfa' : '#a78bfa';
		const remainderColor = dark ? '#475569' : '#e2e8f0';

		const shippedData = data.map((d) => d.shipped10HoursCount);
		const onboardedOnlyData = data.map((d) =>
			Math.max(0, d.onboardedCount - d.shipped10HoursCount),
		);
		const notOnboardedData = data.map((d) => Math.max(0, d.count - d.onboardedCount));

		const segmentLabel = (value: number, total: number) => {
			if (!value || !total) return '';
			const pct = (value / total) * 100;
			return pct >= 8 ? `${value} (${pct.toFixed(0)}%)` : '';
		};

		chart.setOption({
			backgroundColor: bgColor(),
			grid: { left: 120, right: 60, top: 32, bottom: 8 },
			legend: {
				top: 0,
				textStyle: { color: dimColor(), fontSize: 10 },
				itemWidth: 14,
				itemHeight: 8,
				data: ['Shipped 10+ hrs', 'Onboarded', 'Not onboarded'],
			},
			xAxis: {
				type: 'value',
				axisLabel: { color: dimColor(), fontSize: 10 },
				splitLine: { lineStyle: { color: gridColor(), type: 'dashed' } },
				axisLine: { show: false },
			},
			yAxis: {
				type: 'category',
				data: data.map((d) => d.source),
				axisLabel: { color: textColor(), fontSize: 11 },
				axisLine: { lineStyle: { color: gridColor() } },
				axisTick: { show: false },
				inverse: true,
			},
			tooltip: {
				trigger: 'axis',
				axisPointer: { type: 'shadow' },
				formatter: (params: any) => {
					const idx = params[0].dataIndex;
					const d = data[idx];
					const onboardedPct = d.count ? ((d.onboardedCount / d.count) * 100).toFixed(1) : '0.0';
					const shippedPct = d.count ? ((d.shipped10HoursCount / d.count) * 100).toFixed(1) : '0.0';
					return `<b>${d.source}</b><br/>`
						+ `Total: ${d.count}<br/>`
						+ `Onboarded: ${d.onboardedCount} (${onboardedPct}%)<br/>`
						+ `Shipped 10+ hrs: ${d.shipped10HoursCount} (${shippedPct}%)`;
				},
			},
			series: [
				{
					name: 'Shipped 10+ hrs',
					type: 'bar',
					stack: 'utm',
					data: shippedData,
					barWidth: 22,
					itemStyle: { color: shippedColor },
					label: {
						show: true,
						position: 'inside',
						color: '#fff',
						fontSize: 10,
						fontWeight: 600,
						formatter: (p: any) => segmentLabel(p.value, data[p.dataIndex].count),
					},
				},
				{
					name: 'Onboarded',
					type: 'bar',
					stack: 'utm',
					data: onboardedOnlyData,
					barWidth: 22,
					itemStyle: { color: onboardedColor },
					label: {
						show: true,
						position: 'inside',
						color: '#fff',
						fontSize: 10,
						fontWeight: 600,
						formatter: (p: any) => segmentLabel(p.value, data[p.dataIndex].count),
					},
				},
				{
					name: 'Not onboarded',
					type: 'bar',
					stack: 'utm',
					data: notOnboardedData,
					barWidth: 22,
					itemStyle: {
						color: remainderColor,
						borderRadius: [0, 3, 3, 0],
					},
					label: {
						show: true,
						position: 'right',
						color: dimColor(),
						fontSize: 11,
						formatter: (p: any) => String(data[p.dataIndex].count),
					},
				},
			],
		});
	}

	// Re-render on theme change
	$effect(() => {
		$theme;
		if (stats) tick().then(() => renderAll());
	});

	// Re-render the map when the event filter changes (cheap — only the map).
	$effect(() => {
		selectedEventFilter;
		if (stats) tick().then(() => renderSignupMap());
	});

	const eventFilterOptions = $derived(
		stats ? stats.signups.perEvent.map((e) => e.title) : [],
	);
</script>

<!-- Program Header -->
<div class="relative h-[160px] w-full overflow-hidden bg-ds-banner">
	<div
		class="pointer-events-none absolute -inset-x-full -inset-y-[200%] -rotate-[19.5deg] opacity-15"
		class:invert={$theme === 'dark'}
		style="background-image: url('{base}/content/bg-pattern.svg'); background-size: 1000px 1000px; background-repeat: repeat;"
	></div>
	<img
		src="{base}/logos/horizons.svg"
		alt="Horizons"
		class="absolute bottom-[25px] left-[24px] h-[45px] w-auto"
		class:invert={$theme === 'dark'}
	/>
</div>

<div class="p-6">
	<div class="mx-auto max-w-6xl space-y-8">
		{#if loading}
			<div class="flex items-center justify-center h-64 text-ds-text-secondary">
				<p>Loading stats...</p>
			</div>
		{:else if error}
			<div class="flex flex-col items-center justify-center h-64 gap-2">
				<p class="text-red-500">{error}</p>
				<Button onclick={loadStats}>Retry</Button>
			</div>
		{:else if stats}
			<!-- 1. User Funnel -->
			<section>
				<h2 class="text-xs font-semibold uppercase tracking-wide text-ds-text-secondary mb-3">User Funnel</h2>
				<div class="rounded-lg border border-ds-border bg-ds-surface p-4 shadow-[var(--color-ds-shadow)]">
					<div bind:this={funnelEl} style="height: 420px;"></div>
				</div>
			</section>

			<!-- 2. User Growth -->
			<section>
				<h2 class="text-xs font-semibold uppercase tracking-wide text-ds-text-secondary mb-3">User Growth</h2>
				<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-3">
					<div class="space-y-1 rounded-lg border border-ds-border bg-ds-surface p-4 shadow-[var(--color-ds-shadow)]">
						<p class="text-[11px] font-semibold uppercase tracking-wide text-ds-text-secondary">Total Users</p>
						<p class="text-2xl font-bold text-ds-text">{formatCount(stats.userGrowth.totalUsers)}</p>
					</div>
					<div class="space-y-1 rounded-lg border border-ds-border bg-ds-surface p-4 shadow-[var(--color-ds-shadow)]">
						<p class="text-[11px] font-semibold uppercase tracking-wide text-ds-text-secondary">New users in the past 7 days</p>
						<p class="text-2xl font-bold text-ds-text">{formatCount(stats.userGrowth.newLast7Days)}</p>
					</div>
					<div class="space-y-1 rounded-lg border border-ds-border bg-ds-surface p-4 shadow-[var(--color-ds-shadow)]">
						<p class="text-[11px] font-semibold uppercase tracking-wide text-ds-text-secondary">New users in the past 30 days</p>
						<p class="text-2xl font-bold text-ds-text">{formatCount(stats.userGrowth.newLast30Days)}</p>
					</div>
					<div class="space-y-1 rounded-lg border border-ds-border bg-ds-surface p-4 shadow-[var(--color-ds-shadow)]">
						<p class="text-[11px] font-semibold uppercase tracking-wide text-ds-text-secondary">% User growth in the past 7 days</p>
						<p class="text-2xl font-bold" class:text-green-600={stats.userGrowth.growthPercent >= 0} class:text-red-500={stats.userGrowth.growthPercent < 0}>
							{formatPercent(stats.userGrowth.growthPercent)}
						</p>
					</div>
				</div>
				<div class="rounded-lg border border-ds-border bg-ds-surface p-4 shadow-[var(--color-ds-shadow)]">
					<p class="text-[11px] font-semibold uppercase tracking-wide text-ds-text-secondary mb-2">New Users (30d)</p>
					<div bind:this={userGrowthEl} style="height: 200px;"></div>
					{#if stats.historical.newSignups.length === 0}
						<p class="text-[10px] text-ds-text-secondary text-center mt-1">No historical data yet</p>
					{/if}
				</div>
			</section>

			<!-- 3. Daily Active Users -->
			<section>
				<h2 class="text-xs font-semibold uppercase tracking-wide text-ds-text-secondary mb-3">Daily Active Users</h2>
				<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-3">
					<div class="space-y-1 rounded-lg border border-ds-border bg-ds-surface p-4 shadow-[var(--color-ds-shadow)]">
						<p class="text-[11px] font-semibold uppercase tracking-wide text-ds-text-secondary">DAUs yesterday</p>
						<p class="text-2xl font-bold text-ds-text">{formatCount(stats.dau.yesterday)}</p>
					</div>
					<div class="space-y-1 rounded-lg border border-ds-border bg-ds-surface p-4 shadow-[var(--color-ds-shadow)]">
						<p class="text-[11px] font-semibold uppercase tracking-wide text-ds-text-secondary">Avg. DAU in the past 7 days</p>
						<p class="text-2xl font-bold text-ds-text">{formatHours(stats.dau.avg7)}</p>
					</div>
					<div class="space-y-1 rounded-lg border border-ds-border bg-ds-surface p-4 shadow-[var(--color-ds-shadow)]">
						<p class="text-[11px] font-semibold uppercase tracking-wide text-ds-text-secondary">Avg. DAU in the past 30 days</p>
						<p class="text-2xl font-bold text-ds-text">{formatHours(stats.dau.avg30)}</p>
					</div>
					<div class="space-y-1 rounded-lg border border-ds-border bg-ds-surface p-4 shadow-[var(--color-ds-shadow)]">
						<p class="text-[11px] font-semibold uppercase tracking-wide text-ds-text-secondary">Avg. DAU % growth in the past 7 days</p>
						<p class="text-2xl font-bold" class:text-green-600={stats.dau.growthPercent7 >= 0} class:text-red-500={stats.dau.growthPercent7 < 0}>
							{formatPercent(stats.dau.growthPercent7)}
						</p>
					</div>
				</div>
				<div class="rounded-lg border border-ds-border bg-ds-surface p-4 shadow-[var(--color-ds-shadow)] mb-3">
					<p class="text-[11px] font-semibold uppercase tracking-wide text-ds-text-secondary mb-2">DAU over time (30d)</p>
					<div bind:this={dauEl} style="height: 200px;"></div>
					{#if stats.historical.dau.length === 0}
						<p class="text-[10px] text-ds-text-secondary text-center mt-1">No historical data yet</p>
					{/if}
				</div>
				<div class="rounded-lg border border-ds-border bg-ds-surface p-4 shadow-[var(--color-ds-shadow)] mb-3">
					<p class="text-[11px] font-semibold uppercase tracking-wide text-ds-text-secondary mb-2">Daily Hours Logged (30d)</p>
					<div bind:this={dailyHoursEl} style="height: 200px;"></div>
					{#if stats.historical.dailyHoursLogged.length === 0}
						<p class="text-[10px] text-ds-text-secondary text-center mt-1">No historical data yet</p>
					{/if}
				</div>
				{#if stats.dau.perEvent.length > 0}
					<div class="rounded-lg border border-ds-border bg-ds-surface shadow-[var(--color-ds-shadow)] overflow-hidden">
						<table class="w-full text-sm">
							<thead>
								<tr class="border-b border-ds-border text-ds-text-secondary text-[11px] uppercase tracking-wide">
									<th class="text-left px-4 py-2.5">Event</th>
									<th class="text-right px-4 py-2.5 w-24">DAUs yesterday</th>
								</tr>
							</thead>
							<tbody>
								{#each stats.dau.perEvent as event}
									<tr class="border-b border-ds-border last:border-b-0">
										<td class="px-4 py-2.5 text-ds-text">{event.title}</td>
										<td class="px-4 py-2.5 text-right font-mono font-bold text-ds-text">{formatCount(event.count)}</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{/if}
			</section>

			<!-- 4. Review Stats (Hours) -->
			<section>
				<h2 class="text-xs font-semibold uppercase tracking-wide text-ds-text-secondary mb-3">Review Stats — Hours</h2>
				<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
					<div class="space-y-1 rounded-lg border border-ds-border bg-ds-surface p-4 shadow-[var(--color-ds-shadow)]">
						<p class="text-[11px] font-semibold uppercase tracking-wide text-ds-text-secondary">Tracked Hours</p>
						<p class="text-2xl font-bold text-ds-text">{formatHours(stats.reviewStats.trackedHours)}</p>
					</div>
					<div class="space-y-1 rounded-lg border border-ds-border bg-ds-surface p-4 shadow-[var(--color-ds-shadow)]">
						<p class="text-[11px] font-semibold uppercase tracking-wide text-ds-text-secondary">Unshipped Hours</p>
						<p class="text-2xl font-bold text-ds-text">{formatHours(stats.reviewStats.unshippedHours)}</p>
					</div>
					<div class="space-y-1 rounded-lg border border-ds-border bg-ds-surface p-4 shadow-[var(--color-ds-shadow)]">
						<p class="text-[11px] font-semibold uppercase tracking-wide text-ds-text-secondary">Shipped Hours</p>
						<p class="text-2xl font-bold text-ds-text">{formatHours(stats.reviewStats.shippedHours)}</p>
					</div>
					<div class="space-y-1 rounded-lg border border-ds-border bg-ds-surface p-4 shadow-[var(--color-ds-shadow)]">
						<p class="text-[11px] font-semibold uppercase tracking-wide text-ds-text-secondary">Hours in Review</p>
						<p class="text-2xl font-bold text-ds-text">{formatHours(stats.reviewStats.hoursInReview)}</p>
					</div>
					<div class="space-y-1 rounded-lg border border-ds-border bg-ds-surface p-4 shadow-[var(--color-ds-shadow)]">
						<p class="text-[11px] font-semibold uppercase tracking-wide text-ds-text-secondary">Approved Hours</p>
						<p class="text-2xl font-bold text-ds-text">{formatHours(stats.reviewStats.approvedHours)}</p>
					</div>
					<div class="space-y-1 rounded-lg border border-ds-border bg-ds-surface p-4 shadow-[var(--color-ds-shadow)]">
						<p class="text-[11px] font-semibold uppercase tracking-wide text-ds-text-secondary">Weighted Grants</p>
						<p class="text-2xl font-bold text-ds-text">{formatHours(stats.reviewStats.weightedGrants)}</p>
					</div>
				</div>
			</section>

			<!-- 4b. Median Review Time -->
			<section>
				<h2 class="text-xs font-semibold uppercase tracking-wide text-ds-text-secondary mb-3">Median Review Time</h2>
				<div class="grid gap-3 sm:grid-cols-2 mb-3">
					<div class="space-y-1 rounded-lg border border-ds-border bg-ds-surface p-4 shadow-[var(--color-ds-shadow)]">
						<p class="text-[11px] font-semibold uppercase tracking-wide text-ds-text-secondary">Median Fraud Check Time This Week</p>
						<p class="text-2xl font-bold text-ds-text">{stats.reviewStats.medianFraudCheckTimeThisWeek != null ? formatHours(stats.reviewStats.medianFraudCheckTimeThisWeek) + 'h' : '—'}</p>
					</div>
					<div class="space-y-1 rounded-lg border border-ds-border bg-ds-surface p-4 shadow-[var(--color-ds-shadow)]">
						<p class="text-[11px] font-semibold uppercase tracking-wide text-ds-text-secondary">Last Project Fraud Check Time</p>
						<p class="text-2xl font-bold text-ds-text">{stats.reviewStats.lastProjectFraudCheckTime != null ? formatHours(stats.reviewStats.lastProjectFraudCheckTime) + 'h' : '—'}</p>
					</div>
				</div>
				<div class="rounded-lg border border-ds-border bg-ds-surface p-4 shadow-[var(--color-ds-shadow)] mb-3">
					<p class="text-[11px] font-semibold uppercase tracking-wide text-ds-text-secondary mb-2">Median Fraud Check Time — Weekly Avg</p>
					<div bind:this={medianFraudCheckEl} style="height: 180px;"></div>
					{#if stats.historical.medianFraudCheckTimeHours.length === 0}
						<p class="text-[10px] text-ds-text-secondary text-center mt-1">No historical data yet</p>
					{/if}
				</div>
				<hr class="my-4 border-ds-border opacity-50" />
				<div class="grid gap-3 sm:grid-cols-2 mb-3">
					<div class="space-y-1 rounded-lg border border-ds-border bg-ds-surface p-4 shadow-[var(--color-ds-shadow)]">
						<p class="text-[11px] font-semibold uppercase tracking-wide text-ds-text-secondary">Median Review Time This Week</p>
						<p class="text-2xl font-bold text-ds-text">{stats.reviewStats.medianReviewTimeThisWeek != null ? formatHours(stats.reviewStats.medianReviewTimeThisWeek) + 'h' : '—'}</p>
					</div>
					<div class="space-y-1 rounded-lg border border-ds-border bg-ds-surface p-4 shadow-[var(--color-ds-shadow)]">
						<p class="text-[11px] font-semibold uppercase tracking-wide text-ds-text-secondary">Last Project Review Time</p>
						<p class="text-2xl font-bold text-ds-text">{stats.reviewStats.lastProjectReviewTime != null ? formatHours(stats.reviewStats.lastProjectReviewTime) + 'h' : '—'}</p>
					</div>
				</div>
				<div class="rounded-lg border border-ds-border bg-ds-surface p-4 shadow-[var(--color-ds-shadow)]">
					<p class="text-[11px] font-semibold uppercase tracking-wide text-ds-text-secondary mb-2">Median Review Time — Weekly Avg</p>
					<div bind:this={medianReviewEl} style="height: 180px;"></div>
					{#if stats.historical.medianReviewTimeHours.length === 0}
						<p class="text-[10px] text-ds-text-secondary text-center mt-1">No historical data yet</p>
					{/if}
				</div>
			</section>

			<!-- 5. Review Stats (Projects) -->
			<section>
				<h2 class="text-xs font-semibold uppercase tracking-wide text-ds-text-secondary mb-3">Review Stats — Projects</h2>

				<!-- Sankey: shipped → fraud gate → reviewer gate -->
				<div class="rounded-lg border border-ds-border bg-ds-surface p-4 shadow-[var(--color-ds-shadow)] mb-3">
					<p class="text-[11px] font-semibold uppercase tracking-wide text-ds-text-secondary mb-2">Project flow through the two gates</p>
					<div bind:this={projectFunnelEl} style="height: 320px;"></div>
				</div>

				<!-- 3×3 state matrix: reviewer × fraud, with derived final outcome per cell -->
				{#if funnelMatrix}
					<div class="rounded-lg border border-ds-border bg-ds-surface p-4 shadow-[var(--color-ds-shadow)] mb-3">
						<p class="text-[11px] font-semibold uppercase tracking-wide text-ds-text-secondary mb-3">Where every project sits right now (latest submission)</p>
						<div class="grid grid-cols-[max-content_repeat(3,minmax(0,1fr))] gap-2">
							<div></div>
							<div class="text-center text-[11px] font-semibold text-ds-text-secondary pb-1">Fraud: passed</div>
							<div class="text-center text-[11px] font-semibold text-ds-text-secondary pb-1">Fraud: pending</div>
							<div class="text-center text-[11px] font-semibold text-ds-text-secondary pb-1">Fraud: failed</div>
							{#each matrixRows as row}
								<div class="flex items-center text-[11px] font-semibold text-ds-text-secondary pr-3 whitespace-nowrap">{row.label}</div>
								{#each ['fraudPassed', 'fraudPending', 'fraudFailed'] as const as fraudKey}
									<div class={`rounded-md border px-3 py-2.5 ${cellStyle(row.cellMeaning[fraudKey])}`}>
										<div class="text-[10px] font-semibold uppercase tracking-wide opacity-80">{cellLabel(row.cellMeaning[fraudKey])}</div>
										<div class="text-lg font-bold">{formatCount(row.data[fraudKey])}</div>
									</div>
								{/each}
							{/each}
						</div>
					</div>

					<!-- Final-state totals derived from the matrix -->
					<div class="grid gap-3 sm:grid-cols-4 mb-3">
						<div class="space-y-1 rounded-lg border border-green-500/40 bg-green-500/5 p-4 shadow-[var(--color-ds-shadow)]">
							<p class="text-[11px] font-semibold uppercase tracking-wide text-green-700">✓ Approved</p>
							<p class="text-2xl font-bold text-ds-text">{formatCount(finalApproved)}</p>
						</div>
						<div class="space-y-1 rounded-lg border border-yellow-500/40 bg-yellow-500/5 p-4 shadow-[var(--color-ds-shadow)]">
							<p class="text-[11px] font-semibold uppercase tracking-wide text-yellow-700">↻ In-flight</p>
							<p class="text-2xl font-bold text-ds-text">{formatCount(finalInFlight)}</p>
						</div>
						<div class="space-y-1 rounded-lg border border-red-500/40 bg-red-500/5 p-4 shadow-[var(--color-ds-shadow)]">
							<p class="text-[11px] font-semibold uppercase tracking-wide text-red-700">✗ Rejected</p>
							<p class="text-2xl font-bold text-ds-text">{formatCount(finalRejected)}</p>
						</div>
						<div class="space-y-1 rounded-lg border border-orange-500/40 bg-orange-500/5 p-4 shadow-[var(--color-ds-shadow)]">
							<p class="text-[11px] font-semibold uppercase tracking-wide text-orange-700">⚠ Silent reject</p>
							<p class="text-2xl font-bold text-ds-text">{formatCount(finalSilentReject)}</p>
						</div>
					</div>
				{/if}

				<div class="grid gap-3 sm:grid-cols-3 mb-3">
					<div class="space-y-1 rounded-lg border border-ds-border bg-ds-surface p-4 shadow-[var(--color-ds-shadow)]">
						<p class="text-[11px] font-semibold uppercase tracking-wide text-ds-text-secondary">Fraud Queue</p>
						<p class="text-2xl font-bold text-ds-text">{formatCount(stats.reviewProjects.fraudQueue)}</p>
					</div>
					<div class="space-y-1 rounded-lg border border-ds-border bg-ds-surface p-4 shadow-[var(--color-ds-shadow)]">
						<p class="text-[11px] font-semibold uppercase tracking-wide text-ds-text-secondary">Review Queue</p>
						<p class="text-2xl font-bold text-ds-text">{formatCount(stats.reviewProjects.reviewQueue)}</p>
					</div>
					<div class="space-y-1 rounded-lg border border-ds-border bg-ds-surface p-4 shadow-[var(--color-ds-shadow)]">
						<p class="text-[11px] font-semibold uppercase tracking-wide text-ds-text-secondary">Reviewed</p>
						<p class="text-2xl font-bold text-ds-text">{formatCount(stats.reviewProjects.reviewed)}</p>
					</div>
				</div>
				<hr class="my-4 border-ds-border opacity-50" />
				<div class="grid gap-3 sm:grid-cols-3 mb-3">
					<div class="space-y-1 rounded-lg border border-ds-border bg-ds-surface p-4 shadow-[var(--color-ds-shadow)]">
						<p class="text-[11px] font-semibold uppercase tracking-wide text-ds-text-secondary">Shipped This Week</p>
						<p class="text-2xl font-bold text-ds-text">{formatCount(stats.reviewProjects.shippedThisWeek)}</p>
					</div>
					<div class="space-y-1 rounded-lg border border-ds-border bg-ds-surface p-4 shadow-[var(--color-ds-shadow)]">
						<p class="text-[11px] font-semibold uppercase tracking-wide text-ds-text-secondary">Fraud Checked This Week</p>
						<p class="text-2xl font-bold text-ds-text">{formatCount(stats.reviewProjects.fraudCheckedThisWeek)}</p>
					</div>
					<div class="space-y-1 rounded-lg border border-ds-border bg-ds-surface p-4 shadow-[var(--color-ds-shadow)]">
						<p class="text-[11px] font-semibold uppercase tracking-wide text-ds-text-secondary">Reviewed This Week</p>
						<p class="text-2xl font-bold text-ds-text">{formatCount(stats.reviewProjects.reviewedThisWeek)}</p>
					</div>
				</div>
				<div class="rounded-lg border border-ds-border bg-ds-surface p-4 shadow-[var(--color-ds-shadow)]">
					<p class="text-[11px] font-semibold uppercase tracking-wide text-ds-text-secondary mb-2">Projects (30d)</p>
					<div bind:this={projectsReviewedEl} style="height: 200px;"></div>
					{#if stats.historical.reviewsCompleted.length === 0 && (!stats.historical.projectsShipped || stats.historical.projectsShipped.length === 0)}
						<p class="text-[10px] text-ds-text-secondary text-center mt-1">No historical data yet</p>
					{/if}
				</div>
			</section>

			<!-- 6. Signups -->
			<section>
				<h2 class="text-xs font-semibold uppercase tracking-wide text-ds-text-secondary mb-3">Signups</h2>
				<div class="grid gap-3 lg:grid-cols-2">
					<div>
						<div class="space-y-1 rounded-lg border border-ds-border bg-ds-surface p-4 shadow-[var(--color-ds-shadow)] mb-3">
							<p class="text-[11px] font-semibold uppercase tracking-wide text-ds-text-secondary">Total Signups</p>
							<p class="text-2xl font-bold text-ds-text">{formatCount(stats.signups.total)}</p>
						</div>
						<div class="rounded-lg border border-ds-border bg-ds-surface p-4 shadow-[var(--color-ds-shadow)]">
							<p class="text-[11px] font-semibold uppercase tracking-wide text-ds-text-secondary mb-2">Signups (30d)</p>
							<div bind:this={signupsEl} style="height: 180px;"></div>
							{#if stats.historical.newSignups.length === 0}
								<p class="text-[10px] text-ds-text-secondary text-center mt-1">No historical data yet</p>
							{/if}
						</div>
					</div>
					{#if stats.signups.perEvent.length > 0}
						<div class="rounded-lg border border-ds-border bg-ds-surface shadow-[var(--color-ds-shadow)] overflow-hidden">
							<table class="w-full text-sm">
								<thead>
									<tr class="border-b border-ds-border text-ds-text-secondary text-[11px] uppercase tracking-wide">
										<th class="text-left px-4 py-2.5">Event</th>
										<th class="text-right px-4 py-2.5 w-24">Signups</th>
									</tr>
								</thead>
								<tbody>
									{#each stats.signups.perEvent as event}
										<tr class="border-b border-ds-border last:border-b-0">
											<td class="px-4 py-2.5 text-ds-text">{event.title}</td>
											<td class="px-4 py-2.5 text-right font-mono font-bold text-ds-text">{formatCount(event.count)}</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					{/if}
				</div>
				{#if stats.signups.qualification.length > 0}
					<div class="rounded-lg border border-ds-border bg-ds-surface p-4 shadow-[var(--color-ds-shadow)] mt-3">
						<div class="mb-2 flex items-center justify-between gap-2">
							<p class="text-[11px] font-semibold uppercase tracking-wide text-ds-text-secondary">Qualification Funnel by Event</p>
							<select
								bind:value={signupQualificationMode}
								class="rounded-md border border-ds-border bg-ds-surface px-2 py-1 text-xs text-ds-text"
							>
								<option value="unshipped">Unshipped (incl. pending/approved)</option>
								<option value="shipped">Shipped but pending (incl. approved)</option>
								<option value="approved">Approved hours</option>
							</select>
						</div>
						<div
							bind:this={signupQualificationEl}
							style="height: {Math.max(180, stats.signups.qualification.length * 38 + 48)}px;"
						></div>
					</div>
				{/if}
				<div class="rounded-lg border border-ds-border bg-ds-surface p-4 shadow-[var(--color-ds-shadow)] mt-3">
					<div class="mb-2 flex items-center justify-between gap-2">
						<p class="text-[11px] font-semibold uppercase tracking-wide text-ds-text-secondary">Signup Origins → Event Destinations</p>
						{#if eventFilterOptions.length > 0}
							<select
								bind:value={selectedEventFilter}
								class="rounded-md border border-ds-border bg-ds-surface px-2 py-1 text-xs text-ds-text"
							>
								<option value="all">All events</option>
								{#each eventFilterOptions as title}
									<option value={title}>{title}</option>
								{/each}
							</select>
						{/if}
					</div>
					<div bind:this={signupMapEl} style="width: 100%; height: 400px;"></div>
					{#if stats.signups.signupsMissingOrigin > 0 || stats.signups.eventsMissingCountry.length > 0 || unmatchedOriginCountries.length > 0 || unmatchedEventCountries.length > 0}
						<div class="mt-3 rounded-md border border-yellow-500/40 bg-yellow-500/10 px-3 py-2 text-[11px] text-yellow-800 dark:text-yellow-200">
							<p class="font-semibold uppercase tracking-wide mb-1">Map data warnings</p>
							<ul class="list-disc pl-4 space-y-0.5">
								{#if stats.signups.signupsMissingOrigin > 0}
									<li>{stats.signups.signupsMissingOrigin} signup{stats.signups.signupsMissingOrigin === 1 ? '' : 's'} not shown — origin country missing on the user.</li>
								{/if}
								{#if stats.signups.eventsMissingCountry.length > 0}
									<li>Events with no host country set: {stats.signups.eventsMissingCountry.join(', ')}.</li>
								{/if}
								{#if unmatchedOriginCountries.length > 0}
									<li>Origin country values that don't match a world country: {unmatchedOriginCountries.join(', ')}.</li>
								{/if}
								{#if unmatchedEventCountries.length > 0}
									<li>Event country values that don't match a world country: {unmatchedEventCountries.join(', ')}.</li>
								{/if}
							</ul>
						</div>
					{/if}
				</div>
			</section>

			<!-- 7. UTM Sources -->
			<section>
				<h2 class="text-xs font-semibold uppercase tracking-wide text-ds-text-secondary mb-3">Referral Sources (UTM)</h2>
				{#if stats.utm.sources.length > 0}
					<div class="rounded-lg border border-ds-border bg-ds-surface p-4 shadow-[var(--color-ds-shadow)]">
						<div bind:this={utmEl} style="height: {Math.max(180, stats.utm.sources.length * 38 + 48)}px;"></div>
					</div>
				{:else}
					<div class="rounded-lg border border-ds-border bg-ds-surface p-6 text-center text-ds-text-secondary text-sm">
						No UTM data recorded yet.
					</div>
				{/if}
			</section>

			<!-- Action bar -->
			<div class="flex items-center gap-2 pt-2">
				<Button onclick={loadStats} disabled={loading}>
					{loading ? 'Refreshing...' : 'Refresh stats'}
				</Button>
			</div>
		{/if}
	</div>
</div>
