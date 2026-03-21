<script lang="ts">
	interface Props {
		totalHours: number | null;
		projects: string[];
	}

	let { totalHours, projects }: Props = $props();

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

	let hasMultipleProjects = $derived(projects.length > 1);
</script>

<div class="hours-total">
	<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
		<circle cx="12" cy="12" r="10" />
		<polyline points="12 6 12 12 16 14" />
	</svg>
	{#if hasMultipleProjects}
		<strong>{computedTotal.toFixed(1)}h</strong> spent
	{:else if projects.length > 0}
		<input
			class="hours-input total-input"
			type="text"
			bind:value={inputValues[projects[0]]}
		/>
		<span>h spent</span>
	{:else}
		<strong>{(totalHours ?? 0).toFixed(1)}h</strong> spent
	{/if}
</div>

{#if hasMultipleProjects}
	<div class="hours-breakdown">
		{#each projects as project}
			<div class="hours-breakdown-item">
				<input
					class="hours-input"
					type="text"
					bind:value={inputValues[project]}
				/>
				<span class="hb-project">{project}</span>
			</div>
		{/each}
	</div>
{:else if projects.length > 0}
	<div class="hours-breakdown single">
		<span class="hb-project">{projects[0]}</span>
	</div>
{/if}

<style>
	.hours-total {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 13px;
		margin-bottom: 2px;
	}

	.hours-total svg {
		width: 14px;
		height: 14px;
		color: var(--text-dim);
		flex-shrink: 0;
	}

	.hours-breakdown {
		padding-left: 22px;
		margin-bottom: 6px;
	}

	.hours-breakdown.single {
		padding-left: 22px;
		font-size: 12px;
		color: var(--text-dim);
		margin-bottom: 6px;
	}

	.hours-breakdown-item {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 12px;
		color: var(--text-dim);
		margin-bottom: 2px;
	}

	.hours-input {
		background: transparent;
		border: 1px solid transparent;
		border-radius: 4px;
		color: var(--text);
		font-family: 'Space Mono', monospace;
		font-size: 11px;
		font-weight: 600;
		width: 40px;
		padding: 1px 4px;
		transition: border-color 0.15s;
	}

	.hours-input.total-input {
		font-size: 13px;
		font-weight: 700;
		width: 48px;
	}

	.hours-input:hover {
		border-color: var(--border);
	}

	.hours-input:focus {
		outline: none;
		border-color: var(--accent);
		background: var(--bg);
	}

	.hb-project {
		color: var(--text-dim);
	}
</style>
