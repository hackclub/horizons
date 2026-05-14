<script lang="ts">
	import { Skeleton } from '$lib/components';

	interface PerProject {
		name: string;
		totalHours: number;
		aiHours: number;
		nonAiHours: number;
	}

	interface Props {
		totalHours: number | null;
		aiHours: number | null;
		nonAiHours: number | null;
		perProject?: PerProject[];
		loading?: boolean;
	}

	let {
		totalHours,
		aiHours,
		nonAiHours,
		perProject = [],
		loading = false,
	}: Props = $props();

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

	// Bar widths are relative to the LARGEST project's total — so the
	// reviewer can see absolute scale across projects, not just composition.
	const maxProjectHours = $derived(
		perProject.reduce((m, p) => Math.max(m, p.totalHours), 0),
	);

	function pctOf(n: number, total: number): number {
		if (total <= 0) return 0;
		return Math.round((n / total) * 100);
	}
</script>

<div class="border-b border-rv-border">
	<button
		type="button"
		class="w-full flex items-center justify-between gap-2 px-4 py-3 text-left cursor-pointer hover:bg-rv-surface2 transition-colors duration-150"
		onclick={() => (expanded = !expanded)}
		aria-expanded={expanded}
	>
		<span class="text-[13px] font-semibold uppercase tracking-wider text-rv-text">
			AI vs non-AI Hours
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

				<!-- Per-project bar chart -->
				{#if perProject.length > 0}
					<div class="text-[11px] uppercase tracking-wider text-rv-dim font-semibold mb-2">
						By project
					</div>
					<div class="flex flex-col gap-2">
						{#each perProject as p (p.name)}
							{@const widthPct = maxProjectHours > 0 ? (p.totalHours / maxProjectHours) * 100 : 0}
							{@const aiInProject = pctOf(p.aiHours, p.totalHours)}
							{@const nonAiInProject = p.totalHours > 0 ? 100 - aiInProject : 0}
							<div class="flex flex-col gap-1">
								<div class="flex items-center justify-between gap-2 text-[12px]">
									<span class="text-rv-text font-medium truncate" title={p.name}>
										{p.name}
									</span>
									<span
										class="text-rv-dim whitespace-nowrap shrink-0"
									>
										{p.totalHours.toFixed(1)}h
									</span>
								</div>
								<div
									class="h-2 rounded-sm bg-rv-surface2 overflow-hidden"
									title={`AI ${p.aiHours.toFixed(1)}h · Non-AI ${p.nonAiHours.toFixed(1)}h`}
								>
									<div
										class="h-full flex"
										style:width={`${widthPct}%`}
									>
										<div
											class="h-full bg-red-500"
											style:width={`${aiInProject}%`}
										></div>
										<div
											class="h-full bg-green-500"
											style:width={`${nonAiInProject}%`}
										></div>
									</div>
								</div>
								<div
									class="flex items-center justify-between gap-2 text-[10px] text-rv-dim"
								>
									<span>AI {p.aiHours.toFixed(1)}h · {aiInProject}%</span>
									<span>Non-AI {p.nonAiHours.toFixed(1)}h · {nonAiInProject}%</span>
								</div>
							</div>
						{/each}
					</div>
				{/if}

				<div class="mt-4 text-[10px] text-rv-dim italic leading-snug">
					Note: These stats are based off of current data, not data at submission time.
				</div>
			{/if}
		</div>
	{/if}
</div>
