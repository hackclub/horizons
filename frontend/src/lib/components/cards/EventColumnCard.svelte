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
		/** Approved-hour threshold a user must hit before they can buy a ticket. Null = no gate. */
		ticketThreshold?: number | null;
		/** Approved-hour cost deducted on ticket purchase. Null = ticket not yet available. */
		ticketCost?: number | null;
		/** Whether ticket purchase is currently open. */
		ticketEnabled?: boolean;
		hasTicket?: boolean;
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
		ticketThreshold = null,
		ticketCost = null,
		ticketEnabled = false,
		hasTicket = false,
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

	type ProgressState =
		| 'qualified'
		| 'buy-ticket'
		| 'ship'
		| 'approved-majority'
		| 'default';

	const progressState = $derived<ProgressState>((() => {
		// Ticket already bought — fully qualified regardless of running hour total.
		if (hasTicket) return 'qualified';
		// Threshold of approved hours hit and the purchase window is open.
		// Null threshold means no eligibility gate; only ticketCost+ticketEnabled
		// need to be set for the purchase prompt to show.
		if (
			ticketCost !== null &&
			ticketEnabled &&
			!hasTicket &&
			(ticketThreshold === null || approvedDisplay >= ticketThreshold)
		) {
			return 'buy-ticket';
		}
		if (targetHours <= 0) return 'default';
		// Approved already past goal → qualified.
		if (approvedDisplay >= targetHours) return 'qualified';
		// Approved + pending sums past goal — surface the approved-majority view
		// so the user sees how close their approved hours are alongside completed.
		if (approvedDisplay + pendingDisplay >= targetHours) return 'approved-majority';
		// They've logged 15+ hours but haven't shipped enough into review to push
		// approved+pending past the goal → nudge them to ship.
		if (completedDisplay >= 15) return 'ship';
		// "approved" leads when it's the larger of the two numbers — i.e. the
		// user's approved progress dominates whatever they've otherwise logged.
		const majorityApproved =
			approvedDisplay > 0 && approvedDisplay >= completedDisplay;
		return majorityApproved ? 'approved-majority' : 'default';
	})());

	const heroImage = $derived(imageUrl ?? config.eventCard?.bgImage ?? null);
	const nexusOverride = $derived(config.nexusOverrideFlag === true);
	const gradientColor = $derived(
		nexusOverride ? '#000000' : (config.colors?.primary ?? '#fac393')
	);
	const subtitle = $derived(
		[config.locationText, config.dates].filter(Boolean).join(' • ')
	);

	const deadlineMs = $derived(
		config.announcementDeadline ? new Date(config.announcementDeadline).getTime() : null
	);

	let now = $state(Date.now());
	$effect(() => {
		if (deadlineMs === null) return;
		const id = setInterval(() => (now = Date.now()), 1000);
		return () => clearInterval(id);
	});

	const pad = (n: number) => String(n).padStart(2, '0');
	const announcementText = $derived.by(() => {
		if (deadlineMs === null) return null;
		const diff = deadlineMs - now;
		if (diff <= 0) return null;
		const totalSec = Math.floor(diff / 1000);
		const days = Math.floor(totalSec / 86400);
		const hours = Math.floor((totalSec % 86400) / 3600);
		const minutes = Math.floor((totalSec % 3600) / 60);
		const seconds = totalSec % 60;
		return `Announcement in ${pad(days)}:${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
	});
</script>

<button
	class="event-column-card group"
	class:selected
	class:nexus-override={nexusOverride}
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
			<p class="card-text-primary font-cook text-[20px] m-0 leading-normal">{config.name}</p>
			{#if subtitle}
				<p class="card-text-primary font-bricolage font-semibold text-[16px] m-0 leading-normal">
					{subtitle}
				</p>
			{/if}
			{#if attendCount !== null && attendCount !== undefined}
				<p class="card-text-primary font-bricolage font-semibold text-[16px] m-0 leading-normal">
					{attendCount} plan to attend
				</p>
			{/if}
			{#if announcementText}
				<p class="card-text-primary font-bricolage font-semibold text-[16px] m-0 leading-normal tabular-nums">
					{announcementText}
				</p>
			{/if}
		</div>

		<div
			class="progress-bar"
			class:state-ship={progressState === 'ship'}
			class:state-qualified={progressState === 'qualified'}
			class:state-buy-ticket={progressState === 'buy-ticket'}
		>
			{#if progressState === 'qualified'}
				<p class="progress-text-primary font-cook text-[16px] m-0 leading-normal whitespace-nowrap">
					{round1(targetHours)}/{round1(targetHours)} approved • QUALIFIED
				</p>
			{:else if progressState === 'buy-ticket'}
				<p class="progress-text-primary font-cook text-[16px] m-0 leading-normal whitespace-nowrap">
					Buy event ticket now
				</p>
				<p class="progress-text-muted font-cook text-[12px] m-0 leading-normal whitespace-nowrap">
					{ticketCost}hr to buy ticket
				</p>
			{:else if progressState === 'ship'}
				<p class="progress-text-primary font-cook text-[16px] m-0 leading-normal whitespace-nowrap">
					{completedDisplay}/{round1(targetHours)} hours completed
				</p>
				<p class="progress-text-primary font-cook text-[12px] m-0 leading-normal whitespace-nowrap">
					Ship to qualify Now
				</p>
			{:else if progressState === 'approved-majority'}
				<p class="progress-text-primary font-cook text-[16px] m-0 leading-normal whitespace-nowrap">
					{approvedDisplay}/{round1(targetHours)} hours approved
				</p>
				<p class="progress-text-muted font-cook text-[12px] m-0 leading-normal whitespace-nowrap">
					{completedDisplay}/{round1(targetHours)} hours completed
				</p>
			{:else}
				<p class="progress-text-primary font-cook text-[16px] m-0 leading-normal whitespace-nowrap">
					{completedDisplay}/{round1(targetHours)} hours completed
				</p>
				<p class="progress-text-muted font-cook text-[12px] m-0 leading-normal whitespace-nowrap">
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
		--card-border: black;
		--card-shadow: black;
		--card-text: black;
		--progress-bg: #f3e8d8;
		--progress-border: black;
		--progress-shadow: black;
		--progress-text: black;
		--progress-text-muted: rgba(0, 0, 0, 0.6);
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: stretch;
		justify-content: flex-end;
		width: 100%;
		height: 100%;
		padding: 30px;
		border: 4px solid var(--card-border);
		border-radius: 20px;
		box-shadow: 4px 4px 0px 0px var(--card-shadow);
		overflow: clip;
		/* Match border to kill any subpixel seam between border and inner image. */
		background-color: var(--card-border);
		text-align: left;
		cursor: pointer;
		outline: none;
		transition: transform var(--juice-duration, 200ms) var(--juice-easing, ease);
	}

	.event-column-card.nexus-override {
		--card-border: black;
		--card-text: white;
		--progress-bg: black;
		--progress-border: white;
		--progress-shadow: white;
		--progress-text: white;
		--progress-text-muted: rgba(255, 255, 255, 0.6);
	}

	/* Bright-bg states keep black text for legibility, even under nexus-override. */
	.event-column-card.nexus-override .progress-bar.state-ship,
	.event-column-card.nexus-override .progress-bar.state-qualified,
	.event-column-card.nexus-override .progress-bar.state-buy-ticket {
		--progress-text: black;
		--progress-text-muted: rgba(0, 0, 0, 0.6);
	}

	/* The progressHint snippet is rendered by the parent and hardcodes
	   text-black + a black-fill SVG icon. Under nexus-override on a dark
	   bar bg, both vanish — recolor text via the existing var and invert
	   the icon. Bright-bg states (where text returns to black) skip the
	   invert so the icon stays black to match. */
	.event-column-card.nexus-override :global(.progress-hint .text-black) {
		color: var(--progress-text);
	}

	.event-column-card.nexus-override .progress-bar :global(.enter-hint-key) {
		filter: invert(1);
	}

	.event-column-card.nexus-override .progress-bar.state-ship :global(.enter-hint-key),
	.event-column-card.nexus-override .progress-bar.state-qualified :global(.enter-hint-key),
	.event-column-card.nexus-override .progress-bar.state-buy-ticket :global(.enter-hint-key) {
		filter: none;
	}

	.card-text-primary {
		color: var(--card-text);
	}

	.progress-text-primary {
		color: var(--progress-text);
	}

	.progress-text-muted {
		color: var(--progress-text-muted);
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
		border: 4px solid var(--progress-border);
		border-radius: 20px;
		box-shadow: 4px 4px 0px 0px var(--progress-shadow);
		background-color: var(--progress-bg);
		overflow: clip;
		transition: background-color 200ms ease;
	}

	.progress-bar.state-ship {
		background-color: #f86d95;
	}

	.progress-bar.state-qualified {
		background-color: #ffa936;
	}

	.progress-bar.state-buy-ticket {
		background-color: #ffa936;
	}
</style>
