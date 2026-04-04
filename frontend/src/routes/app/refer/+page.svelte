<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { api } from '$lib/api';
	import type { components } from '$lib/api';
	import { EXIT_DURATION } from '$lib';
	import InputPrompt from '$lib/components/InputPrompt.svelte';
	import stickerSheetImg from '$lib/assets/refer/sticker-sheet.png';
	import switchLiteImg from '$lib/assets/refer/switch-lite.png';

	type ReferralUser = components['schemas']['ReferralUserResponse'];

	let entered = $state(false);
	let navigating = $state(false);

	let referralCode = $state('');
	let referrals = $state<ReferralUser[]>([]);
	let userName = $state('');
	let loading = $state(true);
	let copied = $state(false);

	let shareUrl = $derived(referralCode ? `${window.location.origin}/?ref=${referralCode}` : '');

	onMount(async () => {
		requestAnimationFrame(() => requestAnimationFrame(() => { entered = true; }));

		const [codeRes, referralsRes, userRes] = await Promise.all([
			api.GET('/api/user/auth/referral-code'),
			api.GET('/api/user/auth/referrals'),
			api.GET('/api/user/auth/me') as Promise<{ data?: Record<string, any> }>,
		]);

		if (codeRes.data?.referralCode) {
			referralCode = codeRes.data.referralCode;
		}
		if (referralsRes.data?.referrals) {
			referrals = referralsRes.data.referrals;
		}
		if (userRes.data?.firstName) {
			userName = (userRes.data.firstName as string).toLowerCase();
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

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.preventDefault();
			goBack();
		}
	}

	function copyLink() {
		navigator.clipboard.writeText(shareUrl);
		copied = true;
		setTimeout(() => copied = false, 2000);
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="page-wrap">
	<div class="page-content">
		<!-- Back button -->
		<button class="back-btn fly-left" class:entered class:exiting={navigating} style="--fly-delay: 0ms;" onclick={goBack}>
			<InputPrompt type="ESC" />
			<span class="font-cook text-2xl font-semibold text-black">BACK</span>
		</button>

		<!-- Content (vertically centered in remaining space) -->
		<div class="content-area fly-left" class:entered class:exiting={navigating} style="--fly-delay: 150ms;">
			<!-- Left column: Refer card -->
			<div class="card refer-card">
				<p class="font-cook text-[32px] text-black m-0">REFER YOUR FRIENDS</p>

				<div class="flex flex-col gap-2">
					<p class="font-bricolage text-[20px] text-black m-0">Share this link with your friends</p>
					<div class="flex gap-4 items-center">
						<div class="link-box">
							<p class="font-bricolage text-[20px] text-black m-0 whitespace-nowrap">{shareUrl || '...'}</p>
						</div>
						<button class="copy-btn" onclick={copyLink}>
							{copied ? 'Copied!' : 'Copy'}
						</button>
					</div>
				</div>

				<!-- Sticker sheet reward -->
				<div class="flex items-center justify-between w-full">
					<div class="flex flex-col gap-1 w-[369px]">
						<p class="font-bricolage text-[20px] text-black m-0">Refer 3 friends to get this exclusive sticker sheet:</p>
						<p class="font-bricolage text-[12px] text-black m-0">*Your friends must complete the onboarding flow</p>
					</div>
					<img src={stickerSheetImg} alt="Sticker sheet reward" class="w-[213px] h-[120px] object-cover" />
				</div>

				<!-- Switch reward -->
				<div class="flex items-center justify-between w-full">
					<div class="flex flex-col gap-1 w-[369px]">
						<p class="font-bricolage text-[20px] text-black m-0">Refer friends to earn tickets to win a Nintendo Switch Lite.</p>
						<p class="font-bricolage text-[12px] text-black m-0">*Your friends must verify their IDs</p>
					</div>
					<img src={switchLiteImg} alt="Nintendo Switch Lite" class="w-[213px] h-[120px] object-cover -rotate-5" />
				</div>
			</div>

			<!-- Right column: Referrals list -->
			<div class="referrals-col">
				<p class="font-cook text-[24px] text-black m-0">YOUR REFERRALS</p>

				<div class="referrals-scroll">
					{#if loading}
						<div class="referral-card">
							<p class="font-cook text-[20px] text-black m-0 opacity-50">LOADING...</p>
						</div>
					{:else if referrals.length === 0}
						<div class="referral-card">
							<p class="font-bricolage text-[20px] text-black/50 m-0">No referrals yet. Share your link!</p>
						</div>
					{:else}
						{#each referrals as referral, i}
							<div class="referral-card" class:first={i === 0}>
								<p class="font-cook text-[20px] text-black m-0">{referral.username.toUpperCase()}</p>
								<p class="font-bricolage text-[20px] text-black m-0">{referral.email}</p>
							</div>
						{/each}
					{/if}
				</div>
			</div>
		</div>

		<!-- Info Row -->
		<div class="info-row" class:exiting={navigating}>
			<div class="card info-card">
				<div class="flex items-center gap-5">
					<p class="font-cook text-[24px] font-semibold text-black m-0 shrink-0 leading-none">USE</p>
					<InputPrompt type="WASD" />
					<p class="font-cook text-[24px] font-semibold text-black m-0 shrink-0 leading-none">OR</p>
					<InputPrompt type="mouse" />
					<p class="font-cook text-[24px] font-semibold text-black m-0 shrink-0 leading-none">TO NAVIGATE</p>
				</div>
			</div>

			<div class="card info-card user-card">
				<p class="font-cook text-[24px] font-semibold text-black m-0">{userName}</p>
				<button class="refer-btn" onclick={copyLink}>
					{copied ? 'Copied!' : 'Refer a Friend'}
				</button>
				<button class="logout-btn" onclick={async () => { await api.POST('/api/user/auth/logout'); window.location.href = '/'; }} aria-label="Logout">
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
		padding: 32px;
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
		padding: 8px;
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
	}
	.referral-card.first {
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
		transition: transform var(--enter-duration) var(--enter-easing) var(--fly-delay, 0ms);
	}
	.fly-left.exiting {
		transform: translateX(-120vw);
		transition: transform var(--exit-duration) var(--exit-easing);
	}
</style>
