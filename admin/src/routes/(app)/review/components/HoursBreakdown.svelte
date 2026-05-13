<script lang="ts">
	interface Props {
		/** Hours captured on the submission row at submit time. */
		submittedHours: number | null;
		projects: string[];
		/** Real per-project hours from Hackatime, fetched live. When null/undefined
		 *  the component is still loading or no breakdown is available; we fall
		 *  back to an even split of submittedHours so totals stay sane. */
		projectHours?: Record<string, number> | null;
		onHoursChange?: (hours: number) => void;
	}

	let { submittedHours, projects, projectHours = null, onHoursChange }: Props = $props();

	const projectRows = $derived(
		projects.map((proj) => {
			const real = projectHours?.[proj];
			const hours =
				real != null
					? Math.round(real * 10) / 10
					: submittedHours && projects.length > 0
						? Math.round((submittedHours / projects.length) * 10) / 10
						: 0;
			return { project: proj, hours };
		}),
	);

	const currentTotal = $derived(projectRows.reduce((sum, r) => sum + r.hours, 0));

	// Seed the verdict panel's approved-hours field with the live current total
	$effect(() => {
		onHoursChange?.(currentTotal);
	});
</script>

<div class="flex items-center gap-1.5 text-[13px] mb-0.5">
	<svg class="w-3.5 h-3.5 text-rv-dim shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
		<circle cx="12" cy="12" r="10" />
		<polyline points="12 6 12 12 16 14" />
	</svg>
	<strong>{(submittedHours ?? 0).toFixed(1)}h</strong>
	<span class="text-rv-dim text-[12px]">submitted</span>
</div>

<div class="pl-5.5 mb-1.5">
	<div class="text-[11px] text-rv-dim mb-0.5">
		<span class="text-rv-text font-semibold">{currentTotal.toFixed(1)}h</span>
		<span class="text-rv-dim">current</span>
	</div>
	{#each projectRows as row}
		<div class="text-[11px] text-rv-dim mb-0.5">
			<span class="text-rv-text font-semibold">{row.hours.toFixed(1)}h</span>
			<span class="text-rv-dim">{row.project}</span>
		</div>
	{/each}
</div>
