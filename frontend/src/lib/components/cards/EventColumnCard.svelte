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
		/** Hours that are submitted/shipped and awaiting review. */
		pendingHours?: number;
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
		pendingHours = 0,
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
	const pendingDisplay = $derived(round1(pendingHours));

	type ProgressState = 'qualified' | 'ship' | 'pending-met' | 'approved-majority' | 'default';

	const progressState = $derived<ProgressState>((() => {
		if (targetHours <= 0) return 'default';
		// Approved already past goal → qualified.
		if (approvedDisplay >= targetHours) return 'qualified';
		// Approved + pending will get them past goal once approved → pending-met.
		if (approvedDisplay + pendingDisplay >= targetHours) return 'pending-met';
		// They've logged enough hours but haven't shipped enough into review → ship.
		if (completedDisplay >= targetHours) return 'ship';
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
			{#if progressHint}
				<div class="progress-hint-wrap" class:visible={selected}>
					<div class="progress-hint">
						{@render progressHint()}
					</div>
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
		transform-origin: center;
		will-change: transform;
		animation: bg-drift 12s ease-in-out infinite alternate;
	}

	@keyframes bg-drift {
		from { transform: scale(1.08) translate(-1.5%, 0.8%); }
		to   { transform: scale(1.08) translate(1.5%, -0.8%); }
	}

	@media (prefers-reduced-motion: reduce) {
		.card-bg-img { animation: none; }
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

	/* Wrapper animates 0fr → 1fr so the hint's height tweens to/from natural
	   content height. margin-top tweens alongside so the spacing collapses
	   with the row. Inner fades to overlap the size animation. */
	.progress-hint-wrap {
		display: grid;
		grid-template-rows: 0fr;
		margin-top: 0;
		transition: grid-template-rows 0.25s ease, margin-top 0.25s ease;
	}

	.progress-hint-wrap.visible {
		grid-template-rows: 1fr;
		margin-top: 6px;
	}

	.progress-hint {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		min-height: 0;
		overflow: hidden;
		opacity: 0;
		transition: opacity 0.2s ease;
	}

	.progress-hint-wrap.visible .progress-hint {
		opacity: 1;
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
