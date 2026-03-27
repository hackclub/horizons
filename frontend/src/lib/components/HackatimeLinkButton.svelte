<script lang="ts">
	import hackatimeIcon from '$lib/assets/icons/hackatime.svg';
	import { api } from '$lib/api';

	let { linked = $bindable(false), variant = 'default' }: { linked?: boolean; variant?: 'default' | 'card' } = $props();

	let status = $state<'loading' | 'unlinked' | 'linked' | 'invalid'>('loading');
	let linking = $state(false);
	let pollInterval: ReturnType<typeof setInterval> | null = null;
	let popup: Window | null = null;

	async function checkStatus() {
		const { data } = await api.GET('/api/hackatime/account');
		if (data?.hasHackatimeAccount && data?.tokenValid) {
			status = 'linked';
			stopPolling();
		} else if (data?.hasHackatimeAccount && !data?.tokenValid) {
			status = 'invalid';
		} else {
			status = 'unlinked';
		}
	}

	function stopPolling() {
		if (pollInterval) {
			clearInterval(pollInterval);
			pollInterval = null;
		}
		popup = null;
		linking = false;
	}

	function pollStatus() {
		pollInterval = setInterval(() => {
			// If the popup was closed without completing, stop polling
			if (popup?.closed) {
				checkStatus().then(() => {
					if (status !== 'linked') stopPolling();
				});
				return;
			}
			checkStatus();
		}, 2000);
	}

	async function handleClick() {
		if (status === 'linked' || status === 'loading' || linking) return;

		linking = true;
		const { data } = await api.GET('/api/hackatime/link');
		if (data?.url) {
			popup = window.open(data.url, '_blank');
			pollStatus();
		} else {
			linking = false;
		}
	}

	$effect(() => {
		checkStatus();
		return () => stopPolling();
	});

	$effect(() => {
		linked = status === 'linked';
	});
</script>

{#if variant === 'card'}
	<!-- Card variant: resource-card style for onboarding pages -->
	<button
		class="hackatime-card"
		class:cursor-pointer={status === 'unlinked' || status === 'invalid'}
		type="button"
		onclick={handleClick}
		disabled={status === 'loading' || status === 'linked'}
	>
		<div class="card-icon">
			<img src={hackatimeIcon} alt="Hackatime" style="width: 52px; height: 64px;" />
		</div>
		<div class="flex flex-col gap-1 items-start">
			<div class="flex items-center gap-1">
				<span class="font-bricolage text-2xl font-semibold text-black">Link Hackatime</span>
				{#if (status === 'unlinked' || status === 'invalid') && !linking}
					<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
						<path d="M4.7943 1.01921C4.7943 0.456645 5.25095 0 5.81351 0L14.9808 0.000703475C15.5434 0.000703733 15.9993 0.456645 15.9993 1.01921L16 10.1865C16 10.7491 15.5434 11.2057 14.9808 11.2057C14.4185 11.2056 13.9626 10.7495 13.9623 10.1872V3.47826L1.44054 16L0 14.5595L12.5217 2.03772H5.81281C5.25053 2.03742 4.79437 1.58154 4.7943 1.01921Z" fill="black"/>
					</svg>
				{/if}
			</div>
			<div class="card-status-badge" class:linked={status === 'linked'} class:unlinked={status !== 'linked'}>
				<span class="font-bricolage text-base font-semibold text-white">
					{#if status === 'loading'}
						Loading...
					{:else if status === 'linked'}
						Hackatime Linked
					{:else if linking}
						Waiting...
					{:else if status === 'invalid'}
						Token Expired
					{:else}
						Not Linked
					{/if}
				</span>
			</div>
			<span class="font-bricolage text-base font-semibold text-black/60">Hackatime keeps track of the amount of time you spend on your projects! <a href="https://hackatime.hackclub.com/my/wakatime_setup" target="_blank" rel="noopener" class="underline text-black/60" onclick={(e) => e.stopPropagation()}>Hackatime Setup</a></span>
		</div>
	</button>
{:else}
	<!-- Default variant: compact button -->
	<button
		class="hackatime-btn border-2 border-black rounded-lg px-4 py-2 w-full flex items-center justify-between {status === 'linked' ? 'bg-[#91D374]' : 'bg-[#fc5b3c]'}"
		class:cursor-pointer={status === 'unlinked' || status === 'invalid'}
		class:opacity-60={status === 'loading'}
		type="button"
		onclick={handleClick}
		disabled={status === 'loading' || status === 'linked'}
	>
		<div class="flex gap-2 items-center">
			<img src={hackatimeIcon} alt="Hackatime" class="w-8 h-[39px]" />
			<div class="flex flex-col items-start leading-normal">
				{#if status === 'loading'}
					<span class="font-bricolage text-base font-bold text-black">Loading...</span>
				{:else if status === 'linked'}
					<span class="font-bricolage text-base font-bold text-black">Linked</span>
					<span class="font-bricolage text-base font-normal text-black">Hackatime account connected</span>
				{:else if status === 'invalid'}
					<span class="font-bricolage text-base font-bold text-black">{linking ? 'Waiting...' : 'Expired'}</span>
					<span class="font-bricolage text-base font-normal text-black">{linking ? 'Complete linking in the new tab' : 'Token expired — click to relink'}</span>
				{:else}
					<span class="font-bricolage text-base font-bold text-black">{linking ? 'Waiting...' : 'Unlinked'}</span>
					<span class="font-bricolage text-base font-normal text-black">{linking ? 'Complete linking in the new tab' : 'Link account to Hackatime'}</span>
				{/if}
			</div>
		</div>
		{#if (status === 'unlinked' || status === 'invalid') && !linking}
			<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
				<path d="M4.7943 1.01921C4.7943 0.456645 5.25095 0 5.81351 0L14.9808 0.000703475C15.5434 0.000703733 15.9993 0.456645 15.9993 1.01921L16 10.1865C16 10.7491 15.5434 11.2057 14.9808 11.2057C14.4185 11.2056 13.9626 10.7495 13.9623 10.1872V3.47826L1.44054 16L0 14.5595L12.5217 2.03772H5.81281C5.25053 2.03742 4.79437 1.58154 4.7943 1.01921Z" fill="black"/>
			</svg>
		{:else if status === 'linked'}
			<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
				<path d="M13.3 4.3L6 11.6L2.7 8.3L3.4 7.6L6 10.2L12.6 3.6L13.3 4.3Z" fill="black" stroke="black" stroke-width="0.5"/>
			</svg>
		{/if}
	</button>
{/if}

<style>
	.hackatime-btn {
		transition: transform var(--juice-duration) var(--juice-easing);
	}
	.hackatime-btn:hover:not(:disabled) {
		transform: scale(var(--juice-scale));
	}

	.hackatime-card {
		display: flex;
		gap: 11px;
		align-items: center;
		padding: 16px;
		border: 4px solid black;
		border-radius: 16px;
		box-shadow: 4px 4px 0px 0px black;
		background-color: #f3e8d8;
		text-align: left;
		width: 100%;
		transition: transform var(--juice-duration) var(--juice-easing);
	}
	.hackatime-card:hover:not(:disabled) {
		transform: scale(var(--juice-scale));
	}

	.card-icon {
		background-color: rgba(0, 0, 0, 0.05);
		padding: 8px 14px;
		border-radius: 8px;
		display: flex;
		align-items: center;
		flex-shrink: 0;
	}

	.card-status-badge {
		padding: 4px 8px;
		border-radius: 8px;
	}
	.card-status-badge.linked {
		background-color: #3abb20;
	}
	.card-status-badge.unlinked {
		background-color: #fc5b3c;
	}
</style>
