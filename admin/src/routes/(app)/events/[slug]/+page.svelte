<script lang="ts">
	import { base } from '$app/paths';
	import { page } from '$app/stores';
	import { onMount, onDestroy, tick } from 'svelte';
	import { api } from '$lib/api';
	import { Button, TextField, Checkbox } from '$lib/components';
	import { theme } from '$lib/themeStore';
	import * as echarts from 'echarts';
	import yaml from 'js-yaml';

	const slug = $derived($page.params.slug);

	interface QualificationModeCounts {
		engaged: number;
		rsvped: number;
		qualified: number;
	}

	interface EventStats {
		event: {
			eventId: number;
			slug: string;
			title: string;
			description: string | null;
			imageUrl: string | null;
			location: string | null;
			country: string | null;
			startDate: string;
			endDate: string;
			hourCost: number;
			isActive: boolean;
		};
		pinnedCount: number;
		metHourGoal: number;
		notMetHourGoal: number;
		dauYesterday: number;
		pinnedTimeline: { date: string; value: number }[];
		dauTimeline: { date: string; value: number }[];
		qualification: {
			signedUp: number;
			engaged: number;
			rsvped: number;
			qualified: number;
			modes: {
				approved: QualificationModeCounts;
				shipped: QualificationModeCounts;
				unshipped: QualificationModeCounts;
			};
		};
	}

	type QualificationMode = 'approved' | 'shipped' | 'unshipped';

	interface EventConfig {
		name: string;
		logo: string;
		tagline: string;
		colors: { primary: string; background: string; dark: string };
	}

	let stats = $state<EventStats | null>(null);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let eventConfigs = $state<Record<string, EventConfig>>({});
	let charts: echarts.ECharts[] = [];

	// Edit form state
	let editing = $state(false);
	let saving = $state(false);
	let editForm = $state({
		title: '',
		description: '',
		imageUrl: '',
		location: '',
		country: '',
		startDate: '',
		endDate: '',
		hourCost: '',
		isActive: true,
	});

	let pinnedChartEl = $state<HTMLDivElement | null>(null);
	let dauChartEl = $state<HTMLDivElement | null>(null);
	let qualificationChartEl = $state<HTMLDivElement | null>(null);
	let qualificationMode = $state<QualificationMode>('approved');

	onMount(async () => {
		await Promise.all([loadStats(), loadEventConfigs()]);
	});

	onDestroy(() => {
		charts.forEach((c) => c.dispose());
		charts = [];
	});

	async function loadStats() {
		loading = true;
		error = null;
		try {
			const resp = await fetch(`/api/admin/events/${slug}/stats`, { credentials: 'include' });
			if (!resp.ok) throw new Error('Failed to load event stats');
			stats = await resp.json();
			populateEditForm();
			loading = false;
			await tick();
			renderCharts();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load';
			loading = false;
		}
	}

	async function loadEventConfigs() {
		try {
			const resp = await fetch(`${base}/events.yaml`);
			if (resp.ok) eventConfigs = (yaml.load(await resp.text()) as Record<string, EventConfig>) ?? {};
		} catch {}
	}

	function populateEditForm() {
		if (!stats) return;
		const e = stats.event;
		editForm = {
			title: e.title,
			description: e.description ?? '',
			imageUrl: e.imageUrl ?? '',
			location: e.location ?? '',
			country: e.country ?? '',
			startDate: e.startDate ? new Date(e.startDate).toISOString().slice(0, 10) : '',
			endDate: e.endDate ? new Date(e.endDate).toISOString().slice(0, 10) : '',
			hourCost: String(e.hourCost),
			isActive: e.isActive,
		};
	}

	async function saveEvent() {
		if (!stats) return;
		saving = true;
		try {
			const { error: err } = await api.PUT('/api/events/admin/{slug}', {
				params: { path: { slug: stats.event.slug } },
				body: {
					title: editForm.title,
					description: editForm.description || undefined,
					imageUrl: editForm.imageUrl || undefined,
					location: editForm.location || undefined,
					country: editForm.country || undefined,
					startDate: editForm.startDate || undefined,
					endDate: editForm.endDate || undefined,
					hourCost: parseFloat(editForm.hourCost),
					isActive: editForm.isActive,
				},
			});
			if (!err) {
				editing = false;
				await loadStats();
			}
		} finally {
			saving = false;
		}
	}

	function getEventLogo(): string | null {
		if (!slug) return null;
		const config = eventConfigs[slug];
		return config?.logo ? `${base}${config.logo}` : null;
	}

	function formatDate(d: string) {
		return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
	}

	function isDark() { return $theme === 'dark'; }
	function textColor() { return isDark() ? '#e2e8f0' : '#0f172a'; }
	function dimColor() { return isDark() ? '#94a3b8' : '#64748b'; }
	function gridColor() { return isDark() ? '#334155' : '#e2e8f0'; }

	function renderLineChart(
		el: HTMLDivElement | null,
		data: { date: string; value: number }[],
		color: string,
		areaColor: string,
	) {
		if (!el) return;
		const chart = echarts.init(el);
		charts.push(chart);

		const hasData = data.length > 0;
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
				axisLabel: { color: dimColor(), fontSize: 10 },
				splitLine: { lineStyle: { color: gridColor(), type: 'dashed' } },
				axisLine: { show: false },
				min: 0,
				max: hasData ? undefined : 100,
			},
			tooltip: hasData ? { trigger: 'axis' } : { show: false },
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

	function renderQualificationChart() {
		if (!stats || !qualificationChartEl) return;
		const chart = echarts.init(qualificationChartEl);
		charts.push(chart);

		const q = stats.qualification;
		const counts = q.modes[qualificationMode];
		const dark = isDark();

		// Mutually exclusive segments: nested funnel split into rings.
		const qualifiedColor = dark ? '#15803d' : '#166534';
		const rsvpedColor = dark ? '#3b82f6' : '#2563eb';
		const engagedColor = dark ? '#22c55e' : '#16a34a';
		const signedUpOnlyColor = dark ? '#475569' : '#cbd5e1';

		const slices = [
			{ name: 'Qualified (≥30h)', value: counts.qualified, color: qualifiedColor },
			{ name: 'Pending RSVPed (≥15h)', value: Math.max(0, counts.rsvped - counts.qualified), color: rsvpedColor },
			{ name: 'Engaged (≥1h)', value: Math.max(0, counts.engaged - counts.rsvped), color: engagedColor },
			{ name: 'Signed up only', value: Math.max(0, q.signedUp - counts.engaged), color: signedUpOnlyColor },
		].filter((s) => s.value > 0);

		chart.setOption({
			backgroundColor: 'transparent',
			tooltip: {
				trigger: 'item',
				formatter: (p: any) => {
					const pct = q.signedUp ? ((p.value / q.signedUp) * 100).toFixed(1) : '0.0';
					return `<b>${p.name}</b><br/>${p.value} of ${q.signedUp} (${pct}%)`;
				},
			},
			legend: {
				orient: 'vertical',
				left: 'left',
				top: 'middle',
				textStyle: { color: dimColor(), fontSize: 11 },
				itemWidth: 12,
				itemHeight: 8,
			},
			series: [
				{
					type: 'pie',
					radius: ['45%', '75%'],
					center: ['65%', '50%'],
					avoidLabelOverlap: true,
					itemStyle: {
						borderColor: dark ? '#0f172a' : '#ffffff',
						borderWidth: 2,
					},
					label: {
						color: textColor(),
						fontSize: 11,
						formatter: (p: any) => {
							const pct = q.signedUp ? ((p.value / q.signedUp) * 100).toFixed(0) : '0';
							return `${p.value} (${pct}%)`;
						},
					},
					labelLine: { lineStyle: { color: dimColor() } },
					data: slices.map((s) => ({
						name: s.name,
						value: s.value,
						itemStyle: { color: s.color },
					})),
				},
			],
		});
	}

	function renderCharts() {
		charts.forEach((c) => c.dispose());
		charts = [];
		if (!stats) return;

		renderLineChart(pinnedChartEl, stats.pinnedTimeline, '#3b82f6', 'rgba(59,130,246,0.15)');
		renderLineChart(dauChartEl, stats.dauTimeline, '#22c55e', 'rgba(34,197,94,0.15)');
		renderQualificationChart();
	}

	$effect(() => {
		$theme;
		qualificationMode;
		if (stats) tick().then(() => renderCharts());
	});
</script>

<div class="p-6">
	<div class="mx-auto max-w-3xl space-y-6">
		<!-- Back link -->
		<a href="{base}/events" class="text-xs text-ds-text-secondary hover:text-ds-text">&larr; Back to Events</a>

		{#if loading}
			<p class="text-sm text-ds-text-secondary">Loading event...</p>
		{:else if error}
			<div class="flex flex-col items-center gap-2 py-12">
				<p class="text-ds-red">{error}</p>
				<Button onclick={loadStats}>Retry</Button>
			</div>
		{:else if stats}
			<!-- Header -->
			<div class="flex items-start justify-between gap-4">
				<div class="flex flex-col gap-2">
					{#if getEventLogo()}
						<img src={getEventLogo()} alt={stats.event.title} class="h-8 w-auto object-contain object-left" />
					{/if}
					<div class="flex items-center gap-2">
						<h1 class="text-2xl font-semibold text-ds-text">{stats.event.title}</h1>
						<span class="rounded-lg bg-ds-surface2 px-1.5 py-0.5 text-xs text-ds-text-secondary">{stats.event.slug}</span>
						{#if !stats.event.isActive}
							<span class="rounded bg-red-600/20 px-1.5 py-0.5 text-xs text-red-700 dark:text-red-300">Inactive</span>
						{/if}
					</div>
					{#if stats.event.location}
						<p class="text-xs text-ds-text-secondary">{stats.event.location}</p>
					{/if}
					<p class="text-xs text-ds-text-secondary">
						{formatDate(stats.event.startDate)} — {formatDate(stats.event.endDate)} &middot; {stats.event.hourCost}h goal
					</p>
				</div>
				<Button onclick={() => (editing = !editing)}>
					{editing ? 'Cancel' : 'Edit Event'}
				</Button>
			</div>

			{#if stats.event.description}
				<p class="text-sm text-ds-text-secondary">{stats.event.description}</p>
			{/if}

			<!-- Stats cards -->
			<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
				<div class="space-y-1 rounded-lg border border-ds-border bg-ds-surface p-4 shadow-[var(--color-ds-shadow)]">
					<p class="text-[11px] font-semibold uppercase tracking-wide text-ds-text-secondary">Pinned Users</p>
					<p class="text-2xl font-bold text-ds-text">{stats.pinnedCount}</p>
				</div>
				<div class="space-y-1 rounded-lg border border-ds-border bg-ds-surface p-4 shadow-[var(--color-ds-shadow)]">
					<p class="text-[11px] font-semibold uppercase tracking-wide text-ds-text-secondary">Met Hour Goal</p>
					<p class="text-2xl font-bold text-green-700 dark:text-green-300">{stats.metHourGoal}</p>
				</div>
				<div class="space-y-1 rounded-lg border border-ds-border bg-ds-surface p-4 shadow-[var(--color-ds-shadow)]">
					<p class="text-[11px] font-semibold uppercase tracking-wide text-ds-text-secondary">Haven't Met Goal</p>
					<p class="text-2xl font-bold text-ds-text">{stats.notMetHourGoal}</p>
				</div>
				<div class="space-y-1 rounded-lg border border-ds-border bg-ds-surface p-4 shadow-[var(--color-ds-shadow)]">
					<p class="text-[11px] font-semibold uppercase tracking-wide text-ds-text-secondary">DAU (Yesterday)</p>
					<p class="text-2xl font-bold text-ds-text">{stats.dauYesterday}</p>
				</div>
			</div>

			<!-- Pinned over time chart -->
			<div class="rounded-lg border border-ds-border bg-ds-surface p-4 shadow-[var(--color-ds-shadow)]">
				<p class="text-[11px] font-semibold uppercase tracking-wide text-ds-text-secondary mb-2">Users Pinned to Event (30d)</p>
				<div bind:this={pinnedChartEl} style="height: 200px;"></div>
				{#if stats.pinnedTimeline.length === 0}
					<p class="text-[10px] text-ds-text-secondary text-center mt-1">No historical data yet</p>
				{/if}
			</div>

			<!-- DAU per event chart -->
			<div class="rounded-lg border border-ds-border bg-ds-surface p-4 shadow-[var(--color-ds-shadow)]">
				<p class="text-[11px] font-semibold uppercase tracking-wide text-ds-text-secondary mb-2">DAU for Event (30d)</p>
				<div bind:this={dauChartEl} style="height: 200px;"></div>
				{#if stats.dauTimeline.length === 0}
					<p class="text-[10px] text-ds-text-secondary text-center mt-1">No historical data yet</p>
				{/if}
			</div>

			<!-- Signups by qualification pie chart -->
			<div class="rounded-lg border border-ds-border bg-ds-surface p-4 shadow-[var(--color-ds-shadow)]">
				<div class="mb-2 flex items-center justify-between gap-2">
					<p class="text-[11px] font-semibold uppercase tracking-wide text-ds-text-secondary">Signups by Qualification</p>
					<select
						bind:value={qualificationMode}
						class="rounded-md border border-ds-border bg-ds-surface px-2 py-1 text-xs text-ds-text"
					>
						<option value="unshipped">Unshipped (incl. pending/approved)</option>
						<option value="shipped">Shipped but pending (incl. approved)</option>
						<option value="approved">Approved hours</option>
					</select>
				</div>
				{#if stats.qualification.signedUp === 0}
					<p class="text-[10px] text-ds-text-secondary text-center py-12">No signups yet</p>
				{:else}
					<div bind:this={qualificationChartEl} style="height: 240px;"></div>
				{/if}
			</div>

			<!-- Edit form -->
			{#if editing}
				<div class="rounded-lg border border-ds-border bg-ds-surface p-6 shadow-[var(--color-ds-shadow)] space-y-4">
					<h2 class="text-lg font-semibold text-ds-text">Edit Event</h2>
					<div class="grid gap-4 sm:grid-cols-2">
						<div class="space-y-1">
							<label class="text-sm font-medium text-ds-text-secondary" for="edit-title">Title</label>
							<TextField id="edit-title" bind:value={editForm.title} />
						</div>
						<div class="space-y-1">
							<label class="text-sm font-medium text-ds-text-secondary" for="edit-location">Location</label>
							<TextField id="edit-location" bind:value={editForm.location} />
						</div>
						<div class="space-y-1">
							<label class="text-sm font-medium text-ds-text-secondary" for="edit-country">Country</label>
							<TextField id="edit-country" placeholder="United States" bind:value={editForm.country} />
						</div>
						<div class="space-y-1">
							<label class="text-sm font-medium text-ds-text-secondary" for="edit-image">Image URL</label>
							<TextField id="edit-image" bind:value={editForm.imageUrl} />
						</div>
						<div class="space-y-1">
							<label class="text-sm font-medium text-ds-text-secondary" for="edit-start">Start Date</label>
							<TextField id="edit-start" type="date" bind:value={editForm.startDate} />
						</div>
						<div class="space-y-1">
							<label class="text-sm font-medium text-ds-text-secondary" for="edit-end">End Date</label>
							<TextField id="edit-end" type="date" bind:value={editForm.endDate} />
						</div>
						<div class="space-y-1">
							<label class="text-sm font-medium text-ds-text-secondary" for="edit-cost">Hour Cost</label>
							<TextField id="edit-cost" type="number" bind:value={editForm.hourCost} />
						</div>
						<div class="flex items-center gap-2 pt-6">
							<Checkbox id="edit-active" bind:checked={editForm.isActive} />
							<label class="text-sm text-ds-text" for="edit-active">Active</label>
						</div>
					</div>
					<div class="space-y-1">
						<label class="text-sm font-medium text-ds-text-secondary" for="edit-desc">Description</label>
						<TextField id="edit-desc" bind:value={editForm.description} />
					</div>
					<div class="flex gap-2">
						<Button onclick={saveEvent} disabled={saving}>
							{saving ? 'Saving...' : 'Save Changes'}
						</Button>
						<Button onclick={() => { editing = false; populateEditForm(); }}>Cancel</Button>
					</div>
				</div>
			{/if}
		{/if}
	</div>
</div>
