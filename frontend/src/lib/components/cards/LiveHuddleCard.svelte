<script lang="ts">
	import enterSvg from '$lib/assets/prompts/enter.svg';
	import clickSvg from '$lib/assets/prompts/click.svg';
	import { m } from '$lib/paraglide/messages.js';

	interface Props {
		memberCount: number;
		selected?: boolean;
		usingKeyboard?: boolean;
		onmouseenter?: () => void;
		onclick?: (e: MouseEvent) => void;
	}

	let {
		memberCount,
		selected = false,
		usingKeyboard = true,
		onmouseenter,
		onclick,
	}: Props = $props();

	const HREF = 'https://hackclub.enterprise.slack.com/archives/C0AGKQ6K476';

	const peopleLabel = $derived(memberCount === 1 ? m.comp_huddle_one_person() : m.comp_huddle_n_people({ count: memberCount }));
</script>

<a
	href={HREF}
	target="_blank"
	rel="noopener noreferrer"
	class="card live-huddle-card"
	class:selected
	class:input-keyboard={usingKeyboard}
	{onmouseenter}
	{onclick}
>
	<div class="huddle-row">
		<div class="huddle-text">
			<p class="huddle-title font-cook m-0">
				<span class="live-tag">{m.comp_huddle_live()}</span> {m.comp_huddle_label({ count: peopleLabel })}
			</p>
			<p class="font-bricolage text-[16px] font-semibold text-black m-0">{m.comp_huddle_hack_club_slack()}</p>
		</div>
		<svg class="slack-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
			<path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z" fill="currentColor"/>
		</svg>
	</div>

	<div class="huddle-cta-wrap">
		<div class="huddle-cta">
			<img
				src={usingKeyboard ? enterSvg : clickSvg}
				alt={usingKeyboard ? m.comp_huddle_enter() : m.comp_huddle_click()}
				class="cta-key"
			/>
			<span class="font-bricolage text-[16px] font-bold text-black">{m.comp_huddle_to_join()}</span>
		</div>
	</div>
</a>

<style>
	.card {
		border: 4px solid black;
		border-radius: 20px;
		box-shadow: 4px 4px 0px 0px black;
		text-decoration: none;
		color: black;
	}

	.live-huddle-card {
		position: relative;
		display: flex;
		flex-direction: column;
		padding: 16px 20px;
		background-color: #f3e8d8;
		flex-shrink: 0;
		transform-origin: center;
		transition: transform var(--juice-duration) var(--juice-easing);
	}

	/* Mouse-mode: hover scales. Keyboard-mode: only the .selected state scales,
	   so a stationary cursor doesn't fight the keyboard focus. Mirrors the
	   pattern in CommunityEventsCard for `.ce-event`. */
	.live-huddle-card:not(.input-keyboard):hover,
	.live-huddle-card.selected {
		transform: scale(var(--juice-scale));
		z-index: 10;
	}

	.huddle-row {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.huddle-text {
		display: flex;
		flex-direction: column;
		gap: 2px;
		flex: 1;
		min-width: 0;
	}

	.huddle-title {
		font-size: 16px;
		line-height: 1.2;
		color: black;
	}

	.live-tag {
		color: #fc5b3c;
	}

	.slack-icon {
		width: 32px;
		height: 32px;
		flex-shrink: 0;
		color: black;
	}

	/* Wrapper animates 0fr → 1fr so the card's height interpolates to/from
	   the CTA's natural content height — no magic numbers, no display:none
	   layout jump. The inner clips overflow during the height tween. */
	.huddle-cta-wrap {
		display: grid;
		grid-template-rows: 0fr;
		transition: grid-template-rows 0.25s ease, margin-top 0.25s ease;
		margin-top: 0;
	}

	.huddle-cta {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		min-height: 0;
		overflow: hidden;
		opacity: 0;
		pointer-events: none;
		transition: opacity 0.2s ease;
	}

	.live-huddle-card:not(.input-keyboard):hover .huddle-cta-wrap,
	.live-huddle-card.selected .huddle-cta-wrap {
		grid-template-rows: 1fr;
		margin-top: 16px;
	}

	.live-huddle-card:not(.input-keyboard):hover .huddle-cta,
	.live-huddle-card.selected .huddle-cta {
		opacity: 1;
		pointer-events: auto;
	}

	.cta-key {
		height: 24px;
		width: auto;
	}
</style>
