<script lang="ts">
	import { Skeleton } from '$lib/components';

	interface PerProject {
		name: string;
		hours: number;
	}

	interface Props {
		totalHours: number | null;
		aiHours: number | null;
		nonAiHours: number | null;
		perProject?: PerProject[];
		startDate?: string | null;
		loading?: boolean;
	}

	let {
		totalHours,
		aiHours,
		nonAiHours,
		perProject = [],
		startDate = null,
		loading = false,
	}: Props = $props();

	// "Feb 21" / "May 14, 2027". Year only when the date isn't this year so
	// short windows stay compact. Treat the YYYY-MM-DD input as UTC midnight
	// so the displayed day matches the backend's window edge.
	function fmtDate(ymd: string): string {
		const [y, m, d] = ymd.split('-').map(Number);
		const dt = new Date(Date.UTC(y, m - 1, d));
		const thisYear = new Date().getUTCFullYear();
		return dt.toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: y === thisYear ? undefined : 'numeric',
			timeZone: 'UTC',
		});
	}

	const sinceLabel = $derived(startDate ? `since ${fmtDate(startDate)}` : null);

	let expanded = $state(true);

	const aiPct = $derived(
		totalHours && totalHours > 0 && aiHours != null
			? Math.round((aiHours / totalHours) * 100)
			: 0,
	);
	const nonAiPct = $derived(totalHours && totalHours > 0 ? 100 - aiPct : 0);

	// SVG donut math. stroke-dasharray draws the AI arc on top of the
	// non-AI base circle; rotate(-90) puts the arc start at 12 o'clock.
	const radius = 18;
	const circumference = 2 * Math.PI * radius;
	const aiArc = $derived((aiPct / 100) * circumference);

	// Per-project bars are sized by share of the deduped total. Per-project
	// hours are raw (NOT deduped) and may sum to more than `totalHours` when
	// the user overlapped two projects in the same minute, so a single bar
	// can exceed 100% — cap the visual width but report the true percentage.
	function shareOfTotal(hours: number): number {
		if (!totalHours || totalHours <= 0) return 0;
		return (hours / totalHours) * 100;
	}
</script>

<div class="border-b border-rv-border">
	<button
		type="button"
		class="w-full flex items-center justify-between gap-2 px-4 py-3 text-left cursor-pointer hover:bg-rv-surface2 transition-colors duration-150"
		onclick={() => (expanded = !expanded)}
		aria-expanded={expanded}
	>
		<span class="flex items-baseline gap-2 min-w-0">
			<span class="text-[13px] font-semibold uppercase tracking-wider text-rv-text">
				Hours Breakdown
			</span>
			{#if sinceLabel}
				<span class="text-[11px] font-normal normal-case tracking-normal text-rv-dim truncate">
					{sinceLabel}
				</span>
			{/if}
		</span>
		<svg
			class="w-3.5 h-3.5 text-rv-dim shrink-0 transition-transform duration-150"
			style:transform={expanded ? 'rotate(180deg)' : 'rotate(0deg)'}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
		>
			<polyline points="6 9 12 15 18 9" />
		</svg>
	</button>

	{#if expanded}
		<div class="px-4 pb-4">
			{#if loading}
				<div class="flex items-center gap-3 mb-3">
					<Skeleton class="h-20 w-20 rounded-full" />
					<div class="flex flex-col gap-1.5 flex-1">
						<Skeleton class="h-4 w-full" />
						<Skeleton class="h-4 w-full" />
						<Skeleton class="h-3 w-2/3" />
					</div>
				</div>
			{:else if !totalHours || totalHours <= 0}
				<div class="text-[12px] text-rv-dim">No Hackatime activity yet.</div>
			{:else}
				<!-- Aggregate donut + legend -->
				<div class="flex items-center gap-3 mb-4">
					<svg
						viewBox="0 0 50 50"
						class="w-20 h-20 shrink-0"
						aria-label="AI vs non-AI hours"
					>
						<circle
							cx="25"
							cy="25"
							r={radius}
							fill="none"
							stroke="rgb(34,197,94)"
							stroke-width="10"
						/>
						{#if aiArc > 0}
							<circle
								cx="25"
								cy="25"
								r={radius}
								fill="none"
								stroke="rgb(239,68,68)"
								stroke-width="10"
								stroke-dasharray={`${aiArc} ${circumference - aiArc}`}
								transform="rotate(-90 25 25)"
							/>
						{/if}
					</svg>

					<div class="flex flex-col gap-1 text-[12px] flex-1 min-w-0">
						<div class="flex items-center gap-2">
							<span class="w-2.5 h-2.5 rounded-sm bg-red-500 shrink-0"></span>
							<span class="text-rv-text font-semibold">AI</span>
							<span
								class="text-rv-dim ml-auto whitespace-nowrap"
							>
								{(aiHours ?? 0).toFixed(1)}h · {aiPct}%
							</span>
						</div>
						<div class="flex items-center gap-2">
							<span class="w-2.5 h-2.5 rounded-sm bg-green-500 shrink-0"></span>
							<span class="text-rv-text font-semibold">Non-AI</span>
							<span
								class="text-rv-dim ml-auto whitespace-nowrap"
							>
								{(nonAiHours ?? 0).toFixed(1)}h · {nonAiPct}%
							</span>
						</div>
						<div class="text-[11px] text-rv-dim mt-0.5">
							of {totalHours.toFixed(1)}h total
						</div>
					</div>
				</div>

				<!-- Per-project share of the deduped total. -->
				{#if perProject.length > 0}
					<div class="text-[11px] uppercase tracking-wider text-rv-dim font-semibold mb-2">
						By project
					</div>
					<div class="flex flex-col gap-2">
						{#each perProject as p (p.name)}
							{@const share = shareOfTotal(p.hours)}
							{@const sharePct = Math.round(share)}
							{@const widthPct = Math.min(100, share)}
							<div class="flex flex-col gap-1">
								<div class="flex items-center justify-between gap-2 text-[12px]">
									<span class="text-rv-text font-medium truncate" title={p.name}>
										{p.name}
									</span>
									<span class="text-rv-dim whitespace-nowrap shrink-0">
										{p.hours.toFixed(1)}h · {sharePct}%
									</span>
								</div>
								<div
									class="h-2 rounded-sm bg-rv-surface2 overflow-hidden"
									title={`${p.hours.toFixed(1)}h — ${sharePct}% of total`}
								>
									<div
										class="h-full bg-rv-accent"
										style:width={`${widthPct}%`}
									></div>
								</div>
							</div>
						{/each}
					</div>
				{/if}

				<div class="mt-4 text-[10px] text-rv-dim italic leading-snug">
					Note: stats reflect current data, not data at submission time.<br>This data should be treated as an approximation, and doesn't take into account off-platform AI (ex. copy/paste ChatGPT code).
				</div>
			{/if}
		</div>
	{/if}
</div>
