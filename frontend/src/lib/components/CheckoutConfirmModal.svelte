<script lang="ts">
	import { onMount } from 'svelte';
	import { fade, scale } from 'svelte/transition';
	import { backOut, cubicOut } from 'svelte/easing';
	import { reduceAnimations } from '$lib/store/settingsCache';
	import { api } from '$lib/api';
	import type { components } from '$lib/api/schema';

	type ShippingAddress = components['schemas']['ShippingAddressResponse'];

	const ORDER_NOTES_MAX = 1000;

	let {
		itemName,
		variantName,
		quantity,
		totalCost,
		balance,
		purchasing,
		error,
		onConfirm,
		onClose,
	}: {
		itemName: string;
		variantName: string | null;
		quantity: number;
		totalCost: number;
		balance: number | null;
		purchasing: boolean;
		error: string | null;
		onConfirm: (orderNotes: string) => void;
		onClose: () => void;
	} = $props();

	let address = $state<ShippingAddress | null>(null);
	let loadingAddress = $state(true);
	let addressError = $state(false);
	let refreshing = $state(false);
	let orderNotes = $state('');

	const balanceAfter = $derived(
		balance === null ? null : Math.round((balance - totalCost) * 10) / 10
	);
	const recipient = $derived(
		address ? [address.firstName, address.lastName].filter(Boolean).join(' ') : ''
	);
	const confirmDisabled = $derived(purchasing || loadingAddress || !address);

	onMount(async () => {
		const { data, error } = await api.GET('/api/shop/auth/shipping-address');
		if (error) {
			addressError = true;
		} else {
			address = data?.address ?? null;
		}
		loadingAddress = false;
	});

	// HCA tokens aren't stored, so the address only refreshes through a new login.
	async function refreshFromHackClub() {
		refreshing = true;
		const { data } = await api.POST('/api/user/auth/sync', {
			body: { redirectPath: window.location.pathname },
		});
		if (data) {
			window.location.href = data.url;
			return;
		}
		refreshing = false;
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && !purchasing) onClose();
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<div
	class="fixed inset-0 z-70 bg-black/40"
	transition:fade={{ duration: 200 }}
	onclick={() => !purchasing && onClose()}
	aria-hidden="true"
></div>

<div
	class="pointer-events-none fixed inset-0 z-71 flex items-center justify-center p-6"
	role="dialog"
	aria-modal="true"
	aria-label="Confirm purchase"
>
	<div
		class="pointer-events-auto relative flex max-h-[85vh] w-[480px] max-w-[92vw] flex-col gap-4 overflow-y-auto rounded-[20px] border-4 border-black bg-[#f3e8d8] p-5 shadow-[4px_4px_0px_0px_black]"
		transition:scale={$reduceAnimations
			? { start: 1, opacity: 0, duration: 250, easing: cubicOut }
			: { start: 0.9, opacity: 0, duration: 260, easing: backOut }}
	>
		<button
			type="button"
			class="absolute right-5 top-5 flex cursor-pointer items-center text-black outline-none disabled:cursor-not-allowed disabled:opacity-50"
			aria-label="Close"
			disabled={purchasing}
			onclick={onClose}
		>
			<svg
				class="size-5"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
				aria-hidden="true"
			>
				<path d="M18 6 6 18" />
				<path d="m6 6 12 12" />
			</svg>
		</button>

		<p class="m-0 font-cook text-[24px] text-black">CONFIRM ORDER</p>

		<div class="flex flex-col gap-1 font-bricolage text-[16px] text-black">
			<p class="m-0 font-semibold">
				{itemName}{variantName ? ` (${variantName})` : ''}{quantity > 1 ? ` × ${quantity}` : ''}
			</p>
			<p class="m-0">Total: <span class="font-semibold">{totalCost}h</span></p>
			{#if balanceAfter !== null}
				<p class="m-0">Balance after: <span class="font-semibold">{balanceAfter}h</span></p>
			{/if}
		</div>

		<div class="flex flex-col gap-2 rounded-[8px] bg-black/10 p-3">
			<p class="m-0 font-cook text-[12px] text-black">SHIPPING TO</p>
			{#if loadingAddress}
				<p class="m-0 font-bricolage text-[16px] text-black/50">Loading address...</p>
			{:else if addressError}
				<p class="m-0 font-bricolage text-[16px] text-red-600">
					Couldn't load your address. Close this and try again.
				</p>
			{:else if address}
				<div class="font-bricolage text-[16px] leading-snug text-black">
					<p class="m-0 font-semibold">{recipient}</p>
					<p class="m-0">{address.line1}</p>
					{#if address.line2}<p class="m-0">{address.line2}</p>{/if}
					<p class="m-0">{address.city}, {address.state} {address.postalCode}</p>
					<p class="m-0">{address.country}</p>
				</div>
				{#if address.nameSource === 'account'}
					<p class="m-0 font-bricolage text-[14px] text-black/70">
						This is your account name. Refresh from Hack Club to use the name on your address instead.
					</p>
				{/if}
			{:else}
				<p class="m-0 font-bricolage text-[16px] text-black">
					You don't have a shipping address yet. Add one on Hack Club, then refresh.
				</p>
			{/if}
			<p class="m-0 font-bricolage text-[14px] text-black/70">
				We ship to the primary address on your Hack Club account, using the name on that address.
				<a
					href="https://auth.hackclub.com/"
					target="_blank"
					rel="noopener noreferrer"
					class="underline">Edit it on Hack Club</a
				>, then
				<button
					type="button"
					class="cursor-pointer underline disabled:cursor-not-allowed disabled:opacity-50"
					disabled={refreshing || purchasing}
					onclick={refreshFromHackClub}
				>
					{refreshing ? 'redirecting...' : 'refresh from Hack Club'}
				</button>.
			</p>
		</div>

		<label class="flex flex-col gap-1">
			<span class="font-cook text-[12px] text-black">ORDER NOTES (OPTIONAL)</span>
			<textarea
				class="min-h-20 resize-y rounded-lg border-2 border-black bg-[#f3e8d8] p-2 font-bricolage text-[16px] text-black outline-none"
				maxlength={ORDER_NOTES_MAX}
				placeholder="Anything we should know about this order?"
				disabled={purchasing}
				bind:value={orderNotes}
			></textarea>
		</label>

		{#if error}
			<p class="m-0 font-bricolage text-sm font-semibold text-red-600">{error}</p>
		{/if}

		<div class="flex justify-end gap-2">
			<button
				type="button"
				class="cursor-pointer rounded-lg border-2 border-black bg-transparent px-4 py-2 font-bricolage text-base font-semibold text-black disabled:cursor-not-allowed disabled:opacity-50"
				disabled={purchasing}
				onclick={onClose}
			>
				Cancel
			</button>
			<button
				type="button"
				class="rounded-lg border-2 border-black px-4 py-2 font-bricolage text-base font-semibold {confirmDisabled
					? 'cursor-not-allowed bg-transparent text-black/50'
					: 'cursor-pointer bg-[#ffa936] text-black'}"
				disabled={confirmDisabled}
				onclick={() => onConfirm(orderNotes)}
			>
				{purchasing ? 'Purchasing...' : `Confirm (${totalCost}h)`}
			</button>
		</div>
	</div>
</div>
