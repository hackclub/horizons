<script lang="ts">
	import { base } from '$app/paths';
	import { onMount, onDestroy, tick } from 'svelte';
	import { api, type components } from '$lib/api';
	import { Button } from '$lib/components';
	import { theme } from '$lib/themeStore';
	import * as echarts from 'echarts';
	import { getCountryCoords } from '$lib/geo';
	let leafletMap: any = null;
	let L: any = null;

	type Stats = components['schemas']['AdminStatsResponse'];
	type DataPoint = { date: string; value: number };
	type EChart = echarts.ECharts;

	let stats = $state<Stats | null>(null);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let recalcAllBusy = $state(false);
	let bulkProjectMessage = $state('');
	let bulkProjectError = $state('');

	// Chart instances for cleanup
	let charts: EChart[] = [];

	// Container refs
	let funnelEl = $state<HTMLDivElement | null>(null);
	let userGrowthEl = $state<HTMLDivElement | null>(null);
	let dauEl = $state<HTMLDivElement | null>(null);
	let dailyHoursEl = $state<HTMLDivElement | null>(null);
	let medianReviewEl = $state<HTMLDivElement | null>(null);
	let projectFunnelEl = $state<HTMLDivElement | null>(null);
	let projectsReviewedEl = $state<HTMLDivElement | null>(null);
	let signupsEl = $state<HTMLDivElement | null>(null);
	let signupMapEl = $state<HTMLDivElement | null>(null);
	let utmEl = $state<HTMLDivElement | null>(null);

	onMount(() => {
		loadStats();
		window.addEventListener('resize', handleResize);
	});

	onDestroy(() => {
		charts.forEach((c) => c.dispose());
		charts = [];
		if (leafletMap) { leafletMap.remove(); leafletMap = null; }
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
		} catch (err) {
			bulkProjectError = err instanceof Error ? err.message : 'Failed to recalculate projects';
		} finally {
			recalcAllBusy = false;
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
		renderProjectFunnel();
		renderLineChart(projectsReviewedEl, stats.historical.reviewsCompleted, '#3b82f6', 'rgba(59,130,246,0.15)');
		renderLineChart(signupsEl, stats.historical.newSignups, '#22c55e', 'rgba(34,197,94,0.15)');
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

	function renderProjectFunnel() {
		if (!projectFunnelEl || !stats) return;
		projectFunnelEl.innerHTML = '';

		const rp = stats.reviewProjects;
		const total = rp.shipped || 1;

		const stages = [
			{ value: rp.shipped, name: 'Shipped' },
			{ value: rp.fraudChecked, name: 'Fraud\nChecked' },
			{ value: rp.reviewed, name: 'Reviewed' },
			{ value: rp.approved, name: 'Approved' },
		];

		const w = projectFunnelEl.clientWidth;
		const h = projectFunnelEl.clientHeight || 220;
		const dark = isDark();
		const fill = dark ? '#818cf8' : '#6366f1';
		const labelColor = dark ? '#e2e8f0' : '#334155';
		const dimLabel = dark ? '#94a3b8' : '#64748b';

		const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		svg.setAttribute('width', String(w));
		svg.setAttribute('height', String(h));
		svg.style.display = 'block';
		projectFunnelEl.appendChild(svg);

		const n = stages.length;
		const headerH = 32;
		const footerH = 38;
		const bodyTop = headerH;
		const bodyBottom = h - footerH;
		const bodyH = bodyBottom - bodyTop;
		const midY = bodyTop + bodyH / 2;
		const maxHalfH = bodyH / 2;
		const colW = w / n;
		const minHalfH = 2;

		const halfHeights = stages.map((s) => {
			const ratio = total > 0 ? s.value / total : 0;
			return Math.max(minHalfH, ratio * maxHalfH);
		});

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

		for (let i = 0; i < n; i++) {
			const cx = colW * i + colW / 2;
			const leftX = colW * i;
			const pct = total > 0 ? ((stages[i].value / total) * 100).toFixed(1) : '0.0';

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

			const headerLines = stages[i].name.split('\n');
			for (let li = 0; li < headerLines.length; li++) {
				const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
				text.setAttribute('x', String(cx));
				text.setAttribute('y', String(4 + li * 13));
				text.setAttribute('text-anchor', 'middle');
				text.setAttribute('dominant-baseline', 'hanging');
				text.setAttribute('fill', labelColor);
				text.setAttribute('font-size', '11');
				text.setAttribute('font-weight', '600');
				text.textContent = headerLines[li];
				svg.appendChild(text);
			}

			const pctText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
			pctText.setAttribute('x', String(cx));
			pctText.setAttribute('y', String(bodyBottom + 12));
			pctText.setAttribute('text-anchor', 'middle');
			pctText.setAttribute('fill', dimLabel);
			pctText.setAttribute('font-size', '10');
			pctText.textContent = `${pct}%`;
			svg.appendChild(pctText);

			const countText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
			countText.setAttribute('x', String(cx));
			countText.setAttribute('y', String(bodyBottom + 26));
			countText.setAttribute('text-anchor', 'middle');
			countText.setAttribute('fill', labelColor);
			countText.setAttribute('font-size', '11');
			countText.setAttribute('font-weight', '700');
			countText.textContent = stages[i].value.toLocaleString();
			svg.appendChild(countText);
		}
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

	async function renderSignupMap() {
		if (!signupMapEl || !stats) return;

		if (!L) L = (await import('leaflet')).default;

		const routes = stats.signups.routes;
		const dark = isDark();
		const tileUrl = dark
			? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
			: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';

		// Destroy previous map
		if (leafletMap) {
			leafletMap.remove();
			leafletMap = null;
		}
		signupMapEl.innerHTML = '';

		leafletMap = L.map(signupMapEl, {
			center: [20, 0],
			zoom: 2,
			minZoom: 2,
			maxZoom: 6,
			zoomControl: true,
			attributionControl: false,
		});

		L.tileLayer(tileUrl, {
			attribution: '&copy; OpenStreetMap &copy; CARTO',
			detectRetina: true,
		}).addTo(leafletMap);

		// Collect origins and destinations
		const originsMap = new Map<string, { coords: [number, number]; total: number }>();
		const destsMap = new Map<string, { coords: [number, number]; total: number; title: string }>();

		const unmatchedCountries: string[] = [];

		for (const route of routes) {
			const oCoords = getCountryCoords(route.originCountry);
			const dCoords = getCountryCoords(route.eventCountry);
			if (!oCoords) unmatchedCountries.push(`origin: "${route.originCountry}"`);
			if (!dCoords) unmatchedCountries.push(`event: "${route.eventCountry}"`);
			if (!oCoords || !dCoords) continue;

			const oKey = route.originCountry.toLowerCase();
			if (!originsMap.has(oKey)) originsMap.set(oKey, { coords: oCoords, total: 0 });
			originsMap.get(oKey)!.total += route.count;

			const dKey = route.eventCountry.toLowerCase();
			if (!destsMap.has(dKey)) destsMap.set(dKey, { coords: dCoords, total: 0, title: route.eventTitle });
			destsMap.get(dKey)!.total += route.count;
		}

		if (unmatchedCountries.length > 0) {
			console.warn('[Signup Map] Unmatched countries:', unmatchedCountries);
		}

		const maxCount = Math.max(...[...originsMap.values(), ...destsMap.values()].map((v) => v.total), 1);

		// Draw route arcs
		for (const route of routes) {
			const oCoords = getCountryCoords(route.originCountry);
			const dCoords = getCountryCoords(route.eventCountry);
			if (!oCoords || !dCoords) continue;

			const fromLat = oCoords[1], fromLng = oCoords[0];
			const toLat = dCoords[1], toLng = dCoords[0];
			const sameCountry = route.originCountry.toLowerCase().trim() === route.eventCountry.toLowerCase().trim()
				|| (oCoords[0] === dCoords[0] && oCoords[1] === dCoords[1]);
			const weight = Math.max(1.5, Math.min(4, (route.count / maxCount) * 5));
			const color = dark ? 'rgba(96,165,250,0.6)' : 'rgba(37,99,235,0.5)';
			const tooltip = `${route.originCountry} → ${route.eventTitle}<br/>${route.count} user${route.count !== 1 ? 's' : ''}`;

			const points: [number, number][] = [];

			if (sameCountry) {
				// Same country — skip the line, info shown in destination tooltip
				continue;
			} else {
				// Quadratic bezier curve
				const midLat = (fromLat + toLat) / 2 + Math.abs(fromLng - toLng) * 0.12;
				const midLng = (fromLng + toLng) / 2;
				for (let t = 0; t <= 1; t += 0.04) {
					const lat = (1 - t) * (1 - t) * fromLat + 2 * (1 - t) * t * midLat + t * t * toLat;
					const lng = (1 - t) * (1 - t) * fromLng + 2 * (1 - t) * t * midLng + t * t * toLng;
					points.push([lat, lng]);
				}
			}

			L.polyline(points, { color, weight, opacity: 0.7 })
				.bindTooltip(tooltip, { sticky: true })
				.addTo(leafletMap);
		}

		// Origin markers (blue)
		for (const [name, { coords, total }] of originsMap) {
			const r = Math.max(5, Math.min(14, (total / maxCount) * 16));
			L.circleMarker([coords[1], coords[0]], {
				radius: r,
				fillColor: dark ? '#60a5fa' : '#3b82f6',
				fillOpacity: 0.85,
				color: '#fff',
				weight: 1,
			})
				.bindTooltip(`${name} — ${total} user${total !== 1 ? 's' : ''}`)
				.addTo(leafletMap);
		}

		// Build per-event breakdown by origin country
		const eventBreakdown = new Map<string, { origin: string; count: number }[]>();
		for (const route of routes) {
			const dKey = route.eventCountry.toLowerCase().trim();
			if (!eventBreakdown.has(dKey)) eventBreakdown.set(dKey, []);
			eventBreakdown.get(dKey)!.push({ origin: route.originCountry, count: route.count });
		}

		// Destination markers (orange, larger) with breakdown tooltip
		for (const [dKey, { coords, total, title }] of destsMap) {
			const r = Math.max(8, Math.min(18, (total / maxCount) * 20));
			const breakdown = (eventBreakdown.get(dKey) || [])
				.sort((a, b) => b.count - a.count)
				.map((r) => `From ${r.origin}: ${r.count}`)
				.join('<br/>');
			const tooltipHtml = `<b>${title}</b> — ${total} attendee${total !== 1 ? 's' : ''}<br/><hr style="margin:4px 0;border-color:${dark ? '#475569' : '#e2e8f0'}">${breakdown}`;

			L.circleMarker([coords[1], coords[0]], {
				radius: r,
				fillColor: dark ? '#fb923c' : '#ea580c',
				fillOpacity: 0.9,
				color: '#fff',
				weight: 2,
			})
				.bindTooltip(`${title} (${total})`, {
					permanent: true,
					direction: 'top',
					className: 'map-event-label',
				})
				.bindPopup(tooltipHtml)
				.addTo(leafletMap);
		}

		// Legend control
		const legend = new L.Control({ position: 'bottomleft' });
		legend.onAdd = () => {
			const div = L.DomUtil.create('div', 'leaflet-legend');
			div.style.cssText = `background:${dark ? 'rgba(15,23,42,0.85)' : 'rgba(255,255,255,0.9)'};padding:8px 12px;border-radius:6px;font-size:11px;line-height:1.8;color:${dark ? '#cbd5e1' : '#475569'};`;
			div.innerHTML = `
				<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${dark ? '#60a5fa' : '#3b82f6'};margin-right:6px;vertical-align:middle;"></span>Origin<br>
				<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${dark ? '#fb923c' : '#ea580c'};margin-right:6px;vertical-align:middle;"></span>Event
			`;
			return div;
		};
		legend.addTo(leafletMap);
	}

	function renderUtmChart() {
		if (!stats || stats.utm.sources.length === 0) return;
		const chart = initChart(utmEl);
		if (!chart) return;

		const data = stats.utm.sources;

		chart.setOption({
			backgroundColor: bgColor(),
			grid: { left: 120, right: 40, top: 4, bottom: 4 },
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
			tooltip: { trigger: 'axis' },
			series: [{
				type: 'bar',
				data: data.map((d) => d.count),
				barWidth: 20,
				itemStyle: {
					color: isDark() ? '#a78bfa' : '#7c3aed',
					borderRadius: [0, 3, 3, 0],
				},
				label: {
					show: true,
					position: 'right',
					color: dimColor(),
					fontSize: 11,
				},
			}],
		});
	}

	// Re-render on theme change
	$effect(() => {
		$theme;
		if (stats) tick().then(() => renderAll());
	});
</script>

<svelte:head>
	<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
</svelte:head>

<style>
	:global(.map-event-label) {
		background: none !important;
		border: none !important;
		box-shadow: none !important;
		font-weight: 600;
		font-size: 11px;
		color: #c2410c;
		text-shadow: 0 0 3px #fff, 0 0 3px #fff;
	}
	:global(.dark .map-event-label) {
		color: #fdba74;
		text-shadow: 0 0 3px #0f172a, 0 0 3px #0f172a;
	}
</style>

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
						<p class="text-[11px] font-semibold uppercase tracking-wide text-ds-text-secondary">DAUs today</p>
						<p class="text-2xl font-bold text-ds-text">{formatCount(stats.dau.today)}</p>
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
									<th class="text-right px-4 py-2.5 w-24">DAUs today</th>
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
				<div class="mt-3 rounded-lg border border-ds-border bg-ds-surface p-4 shadow-[var(--color-ds-shadow)]">
					<p class="text-[11px] font-semibold uppercase tracking-wide text-ds-text-secondary mb-2">Median Review Time (30d)</p>
					<div bind:this={medianReviewEl} style="height: 180px;"></div>
					{#if stats.historical.medianReviewTimeHours.length === 0}
						<p class="text-[10px] text-ds-text-secondary text-center mt-1">No historical data yet</p>
					{/if}
				</div>
			</section>

			<!-- 5. Review Stats (Projects) -->
			<section>
				<h2 class="text-xs font-semibold uppercase tracking-wide text-ds-text-secondary mb-3">Review Stats — Projects</h2>
				<div class="rounded-lg border border-ds-border bg-ds-surface p-4 shadow-[var(--color-ds-shadow)] mb-3">
					<div bind:this={projectFunnelEl} style="height: 220px;"></div>
				</div>
				<div class="grid gap-3 sm:grid-cols-2 mb-3">
					<div class="space-y-1 rounded-lg border border-ds-border bg-ds-surface p-4 shadow-[var(--color-ds-shadow)]">
						<p class="text-[11px] font-semibold uppercase tracking-wide text-ds-text-secondary">In Queue</p>
						<p class="text-2xl font-bold text-ds-text">{formatCount(stats.reviewProjects.inQueue)}</p>
					</div>
					<div class="space-y-1 rounded-lg border border-ds-border bg-ds-surface p-4 shadow-[var(--color-ds-shadow)]">
						<p class="text-[11px] font-semibold uppercase tracking-wide text-ds-text-secondary">Reviewed</p>
						<p class="text-2xl font-bold text-ds-text">{formatCount(stats.reviewProjects.reviewed)}</p>
					</div>
				</div>
				<div class="rounded-lg border border-ds-border bg-ds-surface p-4 shadow-[var(--color-ds-shadow)]">
					<p class="text-[11px] font-semibold uppercase tracking-wide text-ds-text-secondary mb-2">Projects Reviewed (30d)</p>
					<div bind:this={projectsReviewedEl} style="height: 180px;"></div>
					{#if stats.historical.reviewsCompleted.length === 0}
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
				<div class="rounded-lg border border-ds-border bg-ds-surface p-4 shadow-[var(--color-ds-shadow)] mt-3">
					<p class="text-[11px] font-semibold uppercase tracking-wide text-ds-text-secondary mb-2">Signup Origins → Event Destinations</p>
					<div bind:this={signupMapEl} style="width: 100%; height: 400px;"></div>
				</div>
			</section>

			<!-- 7. UTM Sources -->
			<section>
				<h2 class="text-xs font-semibold uppercase tracking-wide text-ds-text-secondary mb-3">Referral Sources (UTM)</h2>
				{#if stats.utm.sources.length > 0}
					<div class="rounded-lg border border-ds-border bg-ds-surface p-4 shadow-[var(--color-ds-shadow)]">
						<div bind:this={utmEl} style="height: {Math.max(120, stats.utm.sources.length * 32 + 8)}px;"></div>
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
				<Button onclick={recalculateAllProjectsHours} disabled={recalcAllBusy}>
					{recalcAllBusy ? 'Recalculating...' : 'Recalculate all projects'}
				</Button>
				{#if bulkProjectError}
					<span class="text-xs text-red-600">{bulkProjectError}</span>
				{:else if bulkProjectMessage}
					<span class="text-xs text-green-700">{bulkProjectMessage}</span>
				{/if}
			</div>
		{/if}
	</div>
</div>
