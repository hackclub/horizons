<script lang="ts">
	interface Props {
		totalHours: number | null;
		projects: string[];
		onHoursChange?: (hours: number) => void;
	}

	let { totalHours, projects, onHoursChange }: Props = $props();

	// Raw string values the user types — one per project, keyed by name
	let inputValues = $state<Record<string, string>>({});

	// Track which projects array we last initialized for, so we only
	// reset inputs when the submission actually changes
	let lastProjectsKey = $state('');

	$effect(() => {
		const key = projects.join('\0');
		if (key === lastProjectsKey) return;
		lastProjectsKey = key;

		const values: Record<string, string> = {};
		for (const proj of projects) {
			const perProject =
				totalHours && projects.length > 0
					? Math.round((totalHours / projects.length) * 10) / 10
					: 0;
			values[proj] = perProject.toFixed(1);
		}
		inputValues = values;
	});

	let computedTotal = $derived(
		Object.values(inputValues).reduce((sum, v) => sum + (parseFloat(v) || 0), 0),
	);

	// Notify parent when reviewer edits the hours
	$effect(() => {
		onHoursChange?.(computedTotal);
	});

	let hasMultipleProjects = $derived(projects.length > 1);
</script>

<div class="flex items-center gap-1.5 text-[13px] mb-0.5">
	<svg class="w-3.5 h-3.5 text-rv-dim shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
		<circle cx="12" cy="12" r="10" />
		<polyline points="12 6 12 12 16 14" />
	</svg>
	{#if hasMultipleProjects}
		<strong>{computedTotal.toFixed(1)}h</strong> spent
	{:else if projects.length > 0}
		<input
			class="bg-transparent border border-transparent rounded text-rv-text font-[Space_Mono,monospace] text-[13px] font-bold w-12 px-1 py-px transition-all duration-150 hover:border-rv-border focus:outline-none focus:border-rv-accent focus:bg-rv-bg"
			type="text"
			bind:value={inputValues[projects[0]]}
		/>
		<span>h spent</span>
	{:else}
		<strong>{(totalHours ?? 0).toFixed(1)}h</strong> spent
	{/if}
</div>

{#if hasMultipleProjects}
	<div class="pl-5.5 mb-1.5">
		{#each projects as project}
			<div class="flex items-center gap-1.5 text-[12px] text-rv-dim mb-0.5">
				<input
					class="bg-transparent border border-transparent rounded text-rv-text font-[Space_Mono,monospace] text-[11px] font-semibold w-10 px-1 py-px transition-all duration-150 hover:border-rv-border focus:outline-none focus:border-rv-accent focus:bg-rv-bg"
					type="text"
					bind:value={inputValues[project]}
				/>
				<span class="text-rv-dim">{project}</span>
			</div>
		{/each}
	</div>
{:else if projects.length > 0}
	<div class="pl-5.5 text-[12px] text-rv-dim mb-1.5">
		<span class="text-rv-dim">{projects[0]}</span>
	</div>
{/if}
