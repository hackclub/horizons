<script lang="ts">
	import slackSvg from '$lib/assets/home/slack.svg';
	import enterSvg from '$lib/assets/prompts/enter.svg';
	import clickSvg from '$lib/assets/prompts/click.svg';
	import { m } from '$lib/paraglide/messages.js';

	interface Props {
		selected?: boolean;
		usingKeyboard?: boolean;
		shaking?: boolean;
		postOnboarding?: boolean;
		description?: string;
		memberCount?: string;
		onmouseenter?: () => void;
		onclick?: (e: MouseEvent) => void;
		onanimationend?: () => void;
	}

	let {
		selected = false,
		usingKeyboard = true,
		shaking = false,
		postOnboarding = false,
		description = '',
		memberCount,
		onmouseenter,
		onclick,
		onanimationend,
	}: Props = $props();
	const resolvedMemberCount = $derived(memberCount ?? m.comp_slackcard_default_member_count());

	const HREF = 'https://hackclub.enterprise.slack.com/archives/C0AGKQ6K476';
</script>

<a
	href={HREF}
	target="_blank"
	rel="noopener noreferrer"
	class="card nav-card slack-card-link"
	class:selected
	class:shaking
	{onmouseenter}
	{onclick}
	{onanimationend}
>
	<!-- Layered slack rainbow gradients on white -->
	<div class="card-bg" aria-hidden="true"></div>

	<!-- Slack logo, tilted -->
	<div class="slack-logo">
		<img src={slackSvg} alt="" class="w-full h-full" />
	</div>

	<!-- Member count pill -->
	<div class="member-pill">
		<span class="member-dot"></span>
		<span class="font-bricolage text-[12px] text-black whitespace-nowrap">{resolvedMemberCount}</span>
	</div>

	<div class="card-text z-10">
		<p class="font-cook text-[40px] font-semibold text-black m-0">{m.comp_slackcard_title()}</p>
		<p class="font-bricolage text-[24px] font-semibold text-black m-0 tracking-[0.24px]">
			{m.comp_slackcard_tagline()}
		</p>
	</div>

	{#if selected && !postOnboarding}
		<div class="enter-hint">
			<img
				src={usingKeyboard ? enterSvg : clickSvg}
				alt={usingKeyboard ? m.comp_slackcard_enter() : m.comp_slackcard_click()}
				class="enter-hint-key"
			/>
			<span class="font-bricolage text-[12px] text-black font-semibold">{m.comp_slackcard_to_open()}</span>
		</div>
	{/if}

	{#if postOnboarding && selected}
		<div class="card-popover">
			<p class="font-bricolage text-[16px] font-semibold text-black/70 m-0">{description}</p>
			<div class="popover-hint">
				<img
					src={usingKeyboard ? enterSvg : clickSvg}
					alt={usingKeyboard ? m.comp_slackcard_enter() : m.comp_slackcard_click()}
					class="enter-hint-key"
				/>
				<span class="font-bricolage text-[12px] text-black font-semibold">{m.comp_slackcard_to_open()}</span>
			</div>
		</div>
	{/if}
</a>

<style>
	.card {
		border: 4px solid black;
		border-radius: 20px;
		box-shadow: 4px 4px 0px 0px black;
		overflow: hidden;
		text-decoration: none;
		color: black;
	}

	.nav-card {
		display: block;
		position: relative;
		transition: transform var(--juice-duration) var(--juice-easing);
	}

	.nav-card.selected {
		transform: scale(var(--juice-scale));
		z-index: 10;
	}

	.slack-card-link {
		width: 100%;
		height: 100%;
		background-color: #ffffff;
	}

	.card-bg {
		position: absolute;
		inset: 0;
		pointer-events: none;
		background-color: #ffffff;
		background-image:
			linear-gradient(44.0929deg, rgba(226, 5, 106, 0.4) 13.654%, rgba(64, 182, 88, 0.4) 86.346%),
			linear-gradient(127.3046deg, rgba(25, 185, 254, 0.6) 8.2188%, rgba(251, 192, 3, 0.6) 91.781%);
	}

	.slack-logo {
		position: absolute;
		top: 50%;
		right: -40px;
		width: 220px;
		height: 220px;
		translate: 0 -50%;
		pointer-events: none;
	}

	.slack-logo img {
		width: 100%;
		height: 100%;
		animation: slack-rotate 120s linear infinite;
	}

	@keyframes slack-rotate {
		from { transform: rotate(-19.31deg); }
		to   { transform: rotate(340.69deg); }
	}

	@media (prefers-reduced-motion: reduce) {
		.slack-logo img { animation: none; transform: rotate(-19.31deg); }
	}

	.member-pill {
		position: absolute;
		top: 10px;
		right: 12px;
		z-index: 5;
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 5px 12px;
		background: white;
		border: 2px solid black;
		border-radius: 8px;
	}

	.member-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background-color: #40b658;
	}

	.card-text {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 20px;
		justify-content: center;
		height: 100%;
	}

	.enter-hint {
		position: absolute;
		bottom: 12px;
		right: 12px;
		z-index: 30;
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 5px 12px;
		background: #f3e8d8;
		border: 2px solid black;
		border-radius: 8px;
	}

	.enter-hint-key {
		height: 22px;
		width: auto;
	}

	.card-popover {
		position: absolute;
		bottom: 12px;
		left: 12px;
		right: 12px;
		z-index: 40;
		background: #f3e8d8;
		border: 3px solid black;
		border-radius: 12px;
		box-shadow: 3px 3px 0px 0px black;
		padding: 12px 16px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.popover-hint {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		align-self: flex-end;
	}

	@keyframes shake {
		0%, 100% { translate: 0 0; }
		20%       { translate: -8px 0; }
		40%       { translate: 8px 0; }
		60%       { translate: -6px 0; }
		80%       { translate: 6px 0; }
	}

	.card.shaking {
		animation: shake 0.4s cubic-bezier(0.36, 0.07, 0.19, 0.97) both;
	}
</style>
