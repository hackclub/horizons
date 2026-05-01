<script lang="ts">
	import enterSvg from '$lib/assets/prompts/enter.svg';
	import clickSvg from '$lib/assets/prompts/click.svg';

	interface Props {
		memberCount: number;
		usingKeyboard?: boolean;
		onclick?: (e: MouseEvent) => void;
	}

	let { memberCount, usingKeyboard = true, onclick }: Props = $props();

	const HREF = 'https://hackclub.enterprise.slack.com/archives/C0AGKQ6K476';

	const peopleLabel = $derived(memberCount === 1 ? '1 person' : `${memberCount} people`);
</script>

<a
	href={HREF}
	target="_blank"
	rel="noopener noreferrer"
	class="card live-huddle-card"
	{onclick}
>
	<div class="huddle-row">
		<div class="huddle-text">
			<p class="huddle-title font-cook m-0">
				<span class="live-tag">LIVE</span><span class="title-rest"> Huddle ({peopleLabel}) • Join Now</span>
			</p>
			<p class="font-bricolage text-[16px] font-semibold text-black m-0">Hack Club Slack</p>
		</div>
		<svg class="slack-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
			<path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z" fill="currentColor"/>
		</svg>
	</div>

	<div class="huddle-cta">
		<img
			src={usingKeyboard ? enterSvg : clickSvg}
			alt={usingKeyboard ? 'Enter' : 'Click'}
			class="cta-key"
		/>
		<span class="font-bricolage text-[16px] font-bold text-black">TO JOIN HUDDLE</span>
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
		display: flex;
		flex-direction: column;
		gap: 16px;
		padding: 16px 20px;
		background-color: #f3e8d8;
		flex-shrink: 0;
		transition: transform var(--juice-duration) var(--juice-easing);
	}

	.live-huddle-card:hover {
		transform: scale(var(--juice-scale));
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

	.title-rest {
		color: black;
	}

	.slack-icon {
		width: 32px;
		height: 32px;
		flex-shrink: 0;
		color: black;
	}

	.huddle-cta {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
	}

	.cta-key {
		height: 24px;
		width: auto;
	}
</style>
