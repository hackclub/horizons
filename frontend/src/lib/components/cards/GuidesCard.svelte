<script lang="ts">
	import puzzleSvg from '$lib/assets/home/puzzle.svg';
	import enterSvg from '$lib/assets/prompts/enter.svg';
	import clickSvg from '$lib/assets/prompts/click.svg';

	interface Props {
		selected?: boolean;
		usingKeyboard?: boolean;
		shaking?: boolean;
		postOnboarding?: boolean;
		description?: string;
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
		onmouseenter,
		onclick,
		onanimationend,
	}: Props = $props();

	const HREF = 'https://guides.horizons.hackclub.com';
</script>

<a
	href={HREF}
	target="_blank"
	rel="noopener noreferrer"
	class="card nav-card guides-card"
	class:selected
	class:shaking
	{onmouseenter}
	{onclick}
	{onanimationend}
>
	<div class="card-bg-icon puzzle-icon">
		<img src={puzzleSvg} alt="" class="w-full h-full" />
	</div>

	<div class="card-text z-10">
		<p class="font-cook text-[40px] font-semibold text-black m-0">GUIDES</p>
		<p class="font-bricolage text-[24px] font-semibold text-black m-0 tracking-[0.24px]">
			Learn to build stuff!
		</p>
	</div>

	{#if selected && !postOnboarding}
		<div class="enter-hint">
			<img
				src={usingKeyboard ? enterSvg : clickSvg}
				alt={usingKeyboard ? 'Enter' : 'Click'}
				class="enter-hint-key"
			/>
			<span class="font-bricolage text-[12px] text-black font-semibold">TO VIEW GUIDES</span>
		</div>
	{/if}

	{#if postOnboarding && selected}
		<div class="card-popover">
			<p class="font-bricolage text-[16px] font-semibold text-black/70 m-0">{description}</p>
			<div class="popover-hint">
				<img
					src={usingKeyboard ? enterSvg : clickSvg}
					alt={usingKeyboard ? 'Enter' : 'Click'}
					class="enter-hint-key"
				/>
				<span class="font-bricolage text-[12px] text-black font-semibold">TO VIEW GUIDES</span>
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

	.guides-card {
		width: 100%;
		height: 100%;
		background-color: #82c854;
	}

	.card-bg-icon {
		position: absolute;
		pointer-events: none;
	}

	.puzzle-icon {
		right: -20px;
		top: 46%;
		width: 240px;
		height: 240px;
		transform-origin: center;
		translate: 0 -50%;
		animation: puzzle-spin 8s infinite;
		opacity: 0.55;
	}

	@keyframes puzzle-spin {
		0%, 87.5% { rotate: 90deg; animation-timing-function: cubic-bezier(0.34, 1.56, 0.64, 1); }
		100%      { rotate: 450deg; }
	}

	@media (prefers-reduced-motion: reduce) {
		.puzzle-icon { animation: none; }
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
