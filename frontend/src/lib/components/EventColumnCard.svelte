<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { EventConfig } from '$lib/events/types';

	interface Props {
		slug: string;
		config: EventConfig;
		imageUrl?: string | null;
		hourCost?: number;
		completedHours?: number;
		approvedHours?: number;
		shipped?: boolean;
		attendCount?: number | null;
		onclick?: (e: MouseEvent) => void;
		onmouseenter?: () => void;
		selected?: boolean;
		progressHint?: Snippet;
	}

	let {
		slug,
		config,
		imageUrl = null,
		hourCost = 30,
		completedHours = 0,
		approvedHours = 0,
		shipped = false,
		attendCount = null,
		onclick,
		onmouseenter,
		selected = false,
		progressHint,
	}: Props = $props();

	const round1 = (n: number) => Number((Math.round(n * 10) / 10).toFixed(1));

	const targetHours = $derived(hourCost);
	const completedDisplay = $derived(round1(completedHours));
	const approvedDisplay = $derived(round1(approvedHours));

	type ProgressState = 'qualified' | 'ship' | 'pending-met' | 'approved-majority' | 'default';

	const progressState = $derived<ProgressState>((() => {
		if (targetHours <= 0) return 'default';
		if (approvedDisplay >= targetHours) return 'qualified';
		if (completedDisplay >= targetHours) {
			if (!shipped) return 'ship';
			return 'pending-met';
		}
		const majorityApproved =
			completedDisplay > 0 &&
			(approvedDisplay >= completedDisplay / 2 || approvedDisplay >= completedDisplay);
		return majorityApproved ? 'approved-majority' : 'default';
	})());

	const heroImage = $derived(imageUrl ?? config.eventCard?.bgImage ?? null);
	const gradientColor = $derived(config.colors?.primary ?? '#fac393');
	const subtitle = $derived(
		[config.locationText, config.dates].filter(Boolean).join(' • ')
	);
</script>

<button
	class="event-column-card group"
	class:selected
	{onclick}
	{onmouseenter}
	type="button"
	data-slug={slug}
>
	{#if heroImage}
		<div class="card-bg" aria-hidden="true">
			<img src={heroImage} alt="" class="card-bg-img" />
			<div
				class="card-bg-gradient"
				style="background-image: linear-gradient(180.1deg, {gradientColor}00 0%, {gradientColor} 52.757%);"
			></div>
		</div>
	{:else}
		<div
			class="card-bg solid"
			aria-hidden="true"
			style="background-color: {gradientColor};"
		></div>
	{/if}

	<div class="card-details">
		<img
			src={config.logo}
			alt="{config.name} logo"
			class="card-logo"
			style="max-width: {config.logoMaxWidth ?? '218px'};"
		/>
		<div class="card-text">
			<p class="font-cook text-[20px] text-black m-0 leading-normal">{config.name}</p>
			{#if subtitle}
				<p class="font-bricolage font-semibold text-[16px] text-black m-0 leading-normal">
					{subtitle}
				</p>
			{/if}
			{#if attendCount !== null && attendCount !== undefined}
				<p class="font-bricolage font-semibold text-[16px] text-black m-0 leading-normal">
					{attendCount} plan to attend
				</p>
			{/if}
		</div>

		<div
			class="progress-bar"
			class:state-ship={progressState === 'ship'}
			class:state-qualified={progressState === 'qualified'}
		>
			{#if progressState === 'qualified'}
				<p class="font-cook text-[16px] text-black m-0 leading-normal whitespace-nowrap">
					{round1(targetHours)}/{round1(targetHours)} approved • QUALIFIED
				</p>
			{:else if progressState === 'ship'}
				<p class="font-cook text-[16px] text-black m-0 leading-normal whitespace-nowrap">
					{completedDisplay}/{round1(targetHours)} hours completed
				</p>
				<p class="font-cook text-[12px] text-black m-0 leading-normal whitespace-nowrap">
					Ship to qualify Now
				</p>
			{:else if progressState === 'pending-met'}
				<p class="font-cook text-[16px] text-black m-0 leading-normal whitespace-nowrap">
					{completedDisplay}/{round1(targetHours)} hours completed
				</p>
			{:else if progressState === 'approved-majority'}
				<p class="font-cook text-[16px] text-black m-0 leading-normal whitespace-nowrap">
					{approvedDisplay}/{round1(targetHours)} hours approved
				</p>
				<p class="font-cook text-[12px] text-black/60 m-0 leading-normal whitespace-nowrap">
					{completedDisplay}/{round1(targetHours)} hours completed
				</p>
			{:else}
				<p class="font-cook text-[16px] text-black m-0 leading-normal whitespace-nowrap">
					{completedDisplay}/{round1(targetHours)} hours completed
				</p>
				<p class="font-cook text-[12px] text-black/60 m-0 leading-normal whitespace-nowrap">
					{approvedDisplay}/{round1(targetHours)} hours approved
				</p>
			{/if}
			{#if progressHint && selected}
				<div class="progress-hint">
					{@render progressHint()}
				</div>
			{/if}
		</div>
	</div>
</button>

<style>
	.event-column-card {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: stretch;
		justify-content: flex-end;
		width: 100%;
		height: 100%;
		min-height: 480px;
		padding: 30px;
		border: 4px solid black;
		border-radius: 20px;
		box-shadow: 4px 4px 0px 0px black;
		overflow: clip;
		background: transparent;
		text-align: left;
		cursor: pointer;
		outline: none;
		transition: transform var(--juice-duration, 200ms) var(--juice-easing, ease);
	}

	.event-column-card.selected {
		transform: scale(var(--juice-scale, 1.02));
	}

	.card-bg {
		position: absolute;
		inset: 0;
		pointer-events: none;
	}

	.card-bg-img {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.card-bg-gradient {
		position: absolute;
		inset: 0;
	}

	.card-details {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 12px;
		width: 100%;
	}

	.card-logo {
		display: block;
		height: 59.324px;
		width: auto;
		object-fit: contain;
		object-position: left;
	}

	.card-text {
		display: flex;
		flex-direction: column;
		gap: 4px;
		align-items: flex-start;
	}

	.progress-hint {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		margin-top: 6px;
	}

	.progress-bar {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 4px;
		width: 100%;
		padding: 16px;
		border: 4px solid black;
		border-radius: 20px;
		box-shadow: 4px 4px 0px 0px black;
		background-color: #f3e8d8;
		overflow: clip;
		transition: background-color 200ms ease;
	}

	.progress-bar.state-ship {
		background-color: #f86d95;
	}

	.progress-bar.state-qualified {
		background-color: #ffa936;
	}
</style>
