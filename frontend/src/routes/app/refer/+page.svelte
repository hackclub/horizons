<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { api } from '$lib/api';
	import type { components } from '$lib/api';
	import { EXIT_DURATION } from '$lib';
	import { userStore } from '$lib/store/userCache';
	import { createListNav } from '$lib/nav/wasd.svelte';
	import InputPrompt from '$lib/components/InputPrompt.svelte';
	import stickerSheetImg from '$lib/assets/refer/sticker-sheet.png';
	import switchLiteImg from '$lib/assets/refer/switch-lite.png';
	import { m } from '$lib/paraglide/messages.js';

	type ReferralUser = components['schemas']['ReferralUserResponse'];

	let entered = $state(false);
	let navigating = $state(false);

	let userName = $derived($userStore.userName);
	let referralCode = $derived($userStore.referralCode);
	let referrals = $state<ReferralUser[]>([]);
	let loading = $state(true);
	let copied = $state(false);

	let shareUrl = $derived(referralCode ? `${window.location.origin}/?ref=${referralCode}` : '');

	const nav = createListNav({
		count: () => referrals.length,
		wheel: 80,
		onChange: (i) => {
			const cards = document.querySelectorAll('.referral-card');
			(cards[i] as HTMLElement | undefined)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
		},
		onEscape: () => goBack(),
	});

	onMount(async () => {
		requestAnimationFrame(() => requestAnimationFrame(() => { entered = true; }));

		const [, referralsRes] = await Promise.all([
			userStore.load(),
			api.GET('/api/user/auth/referrals'),
		]);

		if (referralsRes.data?.referrals) {
			referrals = referralsRes.data.referrals;
		}

		loading = false;
	});

	function goBack() {
		navigateTo('/app?noanimate');
	}

	async function navigateTo(href: string) {
		if (navigating) return;
		navigating = true;
		await new Promise(resolve => setTimeout(resolve, EXIT_DURATION + 350));
		goto(href);
	}

	function copyLink() {
		navigator.clipboard.writeText(shareUrl);
		copied = true;
		setTimeout(() => copied = false, 2000);
	}
</script>

<svelte:window onkeydown={nav.handleKeydown} onwheel={nav.handleWheel} />

<div class="page-wrap">
	<div class="page-content">
		<!-- Back button -->
		<button class="back-btn fly-left" class:entered class:exiting={navigating} style="--fly-in-delay: 0ms; --fly-out-delay: 0ms;" onclick={goBack}>
			<InputPrompt type="ESC" />
			<span class="font-cook text-2xl font-semibold text-black">{m.app_refer_back()}</span>
		</button>

		<!-- Content (vertically centered in remaining space) -->
		<div class="content-area fly-left" class:entered class:exiting={navigating} style="--fly-in-delay: 150ms; --fly-out-delay: 150ms;">
			<!-- Left column: Refer card -->
			<div class="card refer-card">
				<p class="font-cook text-[32px] text-black m-0">{m.app_refer_title()}</p>

				<div class="flex flex-col gap-2">
					<p class="font-bricolage text-[20px] text-black m-0">{m.app_refer_share_link()}</p>
					<div class="flex gap-4 items-center">
						<div class="link-box">
							<p class="font-bricolage text-[20px] text-black m-0 whitespace-nowrap overflow-hidden text-ellipsis">{shareUrl || '...'}</p>
						</div>
						<button class="copy-btn" onclick={copyLink}>
							{copied ? m.app_refer_copied() : m.app_refer_copy()}
						</button>
					</div>
				</div>

				<!-- Sticker sheet reward -->
				<div class="flex items-center justify-between w-full">
					<div class="flex flex-col gap-1 w-[369px]">
						<p class="font-bricolage text-[20px] text-black m-0">{m.app_refer_sticker_reward()}</p>
						<p class="font-bricolage text-[12px] text-black m-0">{m.app_refer_sticker_disclaimer()}</p>
					</div>
					<img src={stickerSheetImg} alt={m.app_refer_alt_sticker()} class="w-45 h-25 object-cover rotate-5" />
				</div>

				<!-- Switch reward -->
				<div class="flex items-center justify-between w-full">
					<div class="flex flex-col gap-1 w-[369px]">
						<p class="font-bricolage text-[20px] text-black m-0">{m.app_refer_switch_reward()}</p>
						<p class="font-bricolage text-[12px] text-black m-0">{m.app_refer_switch_disclaimer()}</p>
					</div>
					<img src={switchLiteImg} alt={m.app_refer_alt_switch()} class="w-[213px] h-[120px] object-cover -rotate-5" />
				</div>
			</div>

			<!-- Right column: Referrals list -->
			<div class="referrals-col">
				<p class="font-cook text-[24px] text-black m-0">{m.app_refer_your_referrals({ count: referrals.length })}</p>

				<div class="referrals-scroll">
					{#if loading}
						<div class="referral-card">
							<p class="font-cook text-[20px] text-black m-0 opacity-50">{m.app_refer_loading()}</p>
						</div>
					{:else if referrals.length === 0}
						<div class="referral-card">
							<p class="font-bricolage text-[20px] text-black/50 m-0">{m.app_refer_empty()}</p>
						</div>
					{:else}
						{#each referrals as referral, i}
							<button
								type="button"
								class="referral-card"
								class:selected={i === nav.selectedIndex}
								onpointerdown={() => nav.select(i)}
								onfocus={() => { nav.selectedIndex = i; }}
							>
								<div class="flex items-center justify-between w-full">
									<p class="font-cook text-[20px] text-black m-0">{(referral.displayName ?? m.app_refer_unknown()).toUpperCase()}</p>
									<span class="font-bricolage text-sm font-semibold px-3 py-1 rounded-full border-2 border-black {referral.onboardComplete ? 'bg-[#91D374]' : 'bg-[#f3e8d8]'}">
										{referral.onboardComplete ? m.app_refer_status_onboarded() : m.app_refer_status_pending()}
									</span>
								</div>
								<p class="font-bricolage text-[20px] text-black m-0">{referral.slackUserId ?? '—'}</p>
							</button>
						{/each}
					{/if}
				</div>
			</div>
		</div>

		<!-- Info Row -->
		<div class="info-row" class:exiting={navigating}>
			<div class="card info-card">
				<div class="flex items-center gap-5">
					<p class="font-cook text-[24px] font-semibold text-black m-0 shrink-0 leading-none">{m.app_refer_nav_use()}</p>
					<InputPrompt type="WASD" />
					<p class="font-cook text-[24px] font-semibold text-black m-0 shrink-0 leading-none">{m.app_refer_nav_or()}</p>
					<InputPrompt type="mouse" />
					<p class="font-cook text-[24px] font-semibold text-black m-0 shrink-0 leading-none">{m.app_refer_nav_to_navigate()}</p>
				</div>
			</div>

			<div class="card info-card user-card">
				<p class="font-cook text-[24px] font-semibold text-black m-0">{userName}</p>
				<button class="refer-btn" onclick={copyLink}>
					{copied ? m.app_refer_copied() : m.app_refer_refer_a_friend()}
				</button>
				<button class="logout-btn" onclick={async () => { await api.POST('/api/user/auth/logout'); window.location.href = '/'; }} aria-label={m.app_refer_aria_logout()}>
					<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
						<path d="M9 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V5C3 4.46957 3.21071 3.96086 3.58579 3.58579C3.96086 3.21071 4.46957 3 5 3H9" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
						<path d="M16 17L21 12L16 7" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
						<path d="M21 12H9" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
					</svg>
				</button>
			</div>
		</div>
	</div>
</div>

<style>
	.page-wrap {
		position: absolute;
		inset: 0;
		overflow: hidden;
	}

	.page-content {
		display: flex;
		flex-direction: column;
		gap: 32px;
		width: 100%;
		height: 100%;
		padding: 32px 40px;
	}

	/* Back button — in flow at top */
	.back-btn {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 20px;
		background-color: #f3e8d8;
		border: 4px solid black;
		border-radius: 20px;
		box-shadow: 4px 4px 0px 0px black;
		cursor: pointer;
		overflow: hidden;
		flex-shrink: 0;
		align-self: flex-start;
		transition: background-color var(--selected-duration) ease, transform var(--juice-duration) var(--juice-easing);
	}
	.back-btn:hover {
		background-color: #ffa936;
		transform: scale(var(--juice-scale));
	}

	/* Content — fills remaining space, centers children vertically */
	.content-area {
		display: flex;
		gap: 32px;
		align-items: center;
		flex: 1;
		min-height: 0;
		width: 100%;
	}

	/* Info row */
	.info-row {
		display: flex;
		align-items: stretch;
		justify-content: space-between;
		width: 100%;
		flex-shrink: 0;
	}
	.info-row.exiting {
		animation: fly-out-bottom var(--exit-duration) var(--exit-easing) both;
	}
	@keyframes fly-out-bottom {
		from { transform: translateY(0); }
		to   { transform: translateY(120vh); }
	}

	/* Card base */
	.card {
		border: 4px solid black;
		border-radius: 20px;
		box-shadow: 4px 4px 0px 0px black;
		overflow: hidden;
		background-color: #f3e8d8;
	}

	.info-card {
		display: flex;
		align-items: center;
		padding: 20px;
		cursor: default;
	}

	.user-card {
		gap: 12px;
	}

	.refer-card {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 16px;
		min-height: 0;
		height: 100%;
		padding: 30px;
	}

	.link-box {
		background: rgba(0, 0, 0, 0.07);
		padding: 8px 16px;
		border-radius: 8px;
		min-width: 0;
		flex: 1;
	}

	.copy-btn {
		border: 2px solid black;
		border-radius: 8px;
		padding: 8px 16px;
		background: transparent;
		font-family: var(--font-bricolage);
		font-size: 20px;
		color: black;
		cursor: pointer;
		white-space: nowrap;
		transition:
			background-color var(--selected-duration) ease,
			transform var(--juice-duration) var(--juice-easing);
	}
	.copy-btn:hover {
		background-color: #ffa936;
		transform: scale(var(--juice-scale));
	}

	/* Referrals column */
	.referrals-col {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 16px;
		min-height: 0;
		height: 100%;
	}

	.referrals-scroll {
		display: flex;
		flex-direction: column;
		gap: 16px;
		overflow-y: auto;
		flex: 1;
		min-height: 0;
		padding: 0 8px 8px 0;
	}

	.referral-card {
		border: 4px solid black;
		border-radius: 20px;
		box-shadow: 4px 4px 0px 0px black;
		overflow: hidden;
		background-color: #f3e8d8;
		padding: 30px;
		display: flex;
		flex-direction: column;
		gap: 16px;
		flex-shrink: 0;
		width: 100%;
		text-align: left;
		font: inherit;
		color: inherit;
		cursor: pointer;
		outline: none;
		transition: background-color var(--selected-duration) ease;
	}
	.referral-card.selected {
		background-color: #ffa936;
	}

	.refer-btn {
		padding: 8px 16px;
		border: 2px solid black;
		border-radius: 8px;
		background: transparent;
		font-family: var(--font-bricolage);
		font-size: 16px;
		font-weight: 600;
		color: black;
		cursor: pointer;
		transition:
			background-color var(--selected-duration) ease,
			transform var(--juice-duration) var(--juice-easing);
	}
	.refer-btn:hover {
		background-color: #ffa936;
		transform: scale(var(--juice-scale));
	}

	.logout-btn {
		background: none;
		border: none;
		cursor: pointer;
		color: black;
		opacity: 0.4;
		padding: 0;
		display: flex;
		align-items: center;
		transition: opacity 0.2s ease;
	}
	.logout-btn:hover {
		opacity: 1;
	}

	/* Fly in from left, exit to left */
	.fly-left {
		transform: translateX(-120vw);
	}
	.fly-left.entered {
		transform: translateX(0);
		transition: transform var(--enter-duration) var(--enter-easing) var(--fly-in-delay, 0ms);
	}
	.fly-left.exiting {
		transform: translateX(-120vw);
		transition: transform var(--exit-duration) var(--exit-easing) var(--fly-out-delay, 0ms);
	}
</style>
