<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import BackButton from '$lib/components/BackButton.svelte';
	import { EXIT_DURATION } from '$lib';
	import { api } from '$lib/api';

	interface ShopItem {
		itemId: number;
		shopSlug: string;
		name: string;
		description: string | null;
		imageUrl: string | null;
		cost: number;
		regions: string[];
		isActive: boolean;
		maxPerUser: number | null;
		variants: { variantId: number; name: string; cost: number }[];
	}

	const MAX_QUANTITY = 50;

	const itemId = $derived(Number(page.params.itemId));

	let item = $state<ShopItem | null>(null);
	let balance = $state<number | null>(null);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let selectedVariantId = $state<number | null>(null);

	let purchasing = $state(false);
	let purchaseError = $state<string | null>(null);
	let purchaseSuccess = $state(false);
	let quantity = $state(1);

	const selectedVariant = $derived(
		item?.variants.find((v) => v.variantId === selectedVariantId) ?? null
	);
	const unitCost = $derived(selectedVariant?.cost ?? item?.cost ?? 0);
	const allowsQuantity = $derived(!item?.maxPerUser);
	const totalCost = $derived(unitCost * (allowsQuantity ? quantity : 1));
	const needsVariant = $derived((item?.variants.length ?? 0) > 0);
	const canAfford = $derived(balance !== null && balance >= totalCost);
	const purchaseDisabled = $derived(
		!item ||
			!item.isActive ||
			purchasing ||
			purchaseSuccess ||
			!canAfford ||
			(needsVariant && selectedVariantId == null)
	);
	const purchaseLabel = $derived.by(() => {
		if (purchaseSuccess) return 'Purchased!';
		if (item && !item.isActive) return 'Unavailable';
		if (needsVariant && selectedVariantId == null) return 'Select a variant';
		if (!canAfford) return 'Insufficient balance';
		return `Purchase (${totalCost}h)`;
	});

	function adjustQuantity(delta: number) {
		quantity = Math.max(1, Math.min(MAX_QUANTITY, quantity + delta));
	}

	let navigating = $state(false);

	onMount(async () => {
		try {
			const [itemRes, balanceRes] = await Promise.all([
				api.GET('/api/shop/items/{id}', {
					params: { path: { id: itemId } }
				}),
				api.GET('/api/shop/auth/balance')
			]);

			if (itemRes.error) {
				error = 'Failed to load item';
			} else {
				item = itemRes.data as unknown as ShopItem;
				if (item?.variants?.length) {
					selectedVariantId = item.variants[0].variantId;
				}
			}

			if (!balanceRes.error) {
				balance = (balanceRes.data as unknown as { balance: number })?.balance ?? null;
			}
		} catch {
			error = 'Failed to load item';
		} finally {
			loading = false;
		}
	});

	async function navigateTo(href: string) {
		navigating = true;
		await new Promise((resolve) => setTimeout(resolve, EXIT_DURATION + 350));
		goto(href);
	}

	function goBack() {
		const from = page.url.searchParams.get('from');
		if (from === 'events') {
			navigateTo('/app/events?noanimate');
			return;
		}
		navigateTo('/app/events/shop?back');
	}

	async function handlePurchase() {
		if (!item || purchaseDisabled) return;
		purchasing = true;
		purchaseError = null;
		try {
			const { data, response } = await api.POST('/api/shop/auth/purchase', {
				body: {
					itemId: item.itemId,
					variantId: needsVariant ? (selectedVariantId ?? undefined) : undefined,
					quantity: allowsQuantity ? quantity : undefined
				}
			});

			if (data) {
				if (typeof data.newBalance?.balance === 'number') {
					balance = data.newBalance.balance;
				}
				purchaseSuccess = true;
				return;
			}

			let message = response.statusText || 'Purchase failed.';
			try {
				const body = await response.json();
				if (body?.message) {
					message = Array.isArray(body.message) ? body.message.join(', ') : body.message;
				}
			} catch {}
			purchaseError = message;
		} catch {
			purchaseError = 'Purchase failed. Please try again.';
		} finally {
			purchasing = false;
		}
	}

	function calcDays(hours: number): number {
		const fullWeeks = Math.floor(hours / 27);
		const rem = hours % 27;

		const extra = rem <= 0 ? 0
			: rem <= 3 ? 1
			: rem <= 6 ? 2
			: rem <= 9 ? 3
			: rem <= 12 ? 4
			: rem <= 15 ? 5
			: rem <= 21 ? 6
			: 7;

		return fullWeeks * 7 + extra;
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			goBack();
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="detail-page relative size-full overflow-hidden flex items-center justify-center gap-16">
	<!-- Product image on left -->
	<div class="image-area w-[488px] h-[389px] flex items-center justify-center shrink-0" class:exiting={navigating}>
		{#if item?.imageUrl}
			<img
				src={item.imageUrl}
				alt={item.name}
				class="max-w-full max-h-full object-contain"
			/>
		{/if}
	</div>

	<!-- Detail card on right -->
	<div class="detail-card shrink-0" class:exiting={navigating}>
		<div
			class="border-4 border-black rounded-[20px] shadow-[4px_4px_0px_0px_black] overflow-hidden bg-[#f3e8d8] w-[480px] h-[569px] flex items-center justify-center"
		>
			{#if loading}
				<p class="font-bricolage font-semibold text-[28px] text-black/50 m-0">LOADING...</p>
			{:else if error}
				<p class="font-bricolage font-semibold text-[28px] text-black/50 m-0">{error}</p>
			{:else if item}
				<div class="flex flex-col gap-6 items-start w-[447px]">
					<div class="flex flex-col gap-2 text-black">
						{#if item.shopSlug}
							<span
								class="font-bricolage text-xs font-bold px-2 py-0.5 rounded-full border-2 border-black w-fit bg-[#f3e8d8] capitalize"
							>
								{item.shopSlug}
							</span>
						{/if}
						<p class="font-cook text-[36px] leading-normal m-0">{item.name}</p>
						<p class="font-bricolage text-[18px] text-black/60 leading-normal m-0">
							{item.cost}h · approx. {calcDays(item.cost)} days of coding
						</p>
						{#if item.regions.length > 0}
							<div class="flex flex-wrap gap-1.5">
								{#each item.regions as region}
									<span class="font-bricolage text-sm font-semibold text-black border-2 border-black rounded-lg px-2 py-0.5 bg-black/10 w-fit">{region}</span>
								{/each}
							</div>
						{/if}
						{#if item.description}
							<p class="font-bricolage text-[16px] leading-normal m-0 w-[415px]">{item.description}</p>
						{/if}
					</div>

					<div class="bg-black/10 rounded-[8px] p-2 w-[431px]">
						<p class="font-bricolage text-[16px] text-black leading-normal m-0">
							Your balance: <span class="font-semibold">{balance !== null ? `${balance} hours` : '...'}</span>
						</p>
					</div>

					{#if item.variants.length > 0}
						<div class="flex flex-wrap gap-2">
							{#each item.variants as variant (variant.variantId)}
								<button
									class="font-bricolage text-sm font-semibold text-black border-2 border-black rounded-lg px-3 py-1 cursor-pointer"
									style="background-color: {selectedVariantId === variant.variantId ? 'var(--selected-color)' : '#f3e8d8'}; transition: background-color var(--selected-duration) ease;"
									onclick={() => { selectedVariantId = variant.variantId; }}
								>
									{variant.name} ({variant.cost}h)
								</button>
							{/each}
						</div>
					{/if}

					{#if allowsQuantity}
						<div class="flex items-center gap-3">
							<span class="font-bricolage text-sm font-semibold text-black">Qty</span>
							<button
								type="button"
								class="qty-btn border-2 border-black rounded-lg w-8 h-8 font-bricolage text-base font-semibold text-black bg-[#f3e8d8] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
								disabled={quantity <= 1 || purchasing || purchaseSuccess}
								onclick={() => adjustQuantity(-1)}
								aria-label="Decrease quantity"
							>
								−
							</button>
							<span class="font-bricolage text-base font-semibold text-black w-6 text-center">{quantity}</span>
							<button
								type="button"
								class="qty-btn border-2 border-black rounded-lg w-8 h-8 font-bricolage text-base font-semibold text-black bg-[#f3e8d8] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
								disabled={quantity >= MAX_QUANTITY || purchasing || purchaseSuccess}
								onclick={() => adjustQuantity(1)}
								aria-label="Increase quantity"
							>
								+
							</button>
						</div>
					{/if}

					<button
						type="button"
						class="purchase-btn border-2 border-black rounded-lg px-4 py-2 font-bricolage text-base font-semibold {purchaseDisabled
							? 'bg-transparent text-black/50 cursor-not-allowed'
							: 'bg-[#ffa936] text-black cursor-pointer'}"
						disabled={purchaseDisabled}
						onclick={handlePurchase}
					>
						{purchasing ? 'Purchasing...' : purchaseLabel}
					</button>

					{#if purchaseError}
						<p class="font-bricolage text-sm font-semibold text-red-600 m-0">{purchaseError}</p>
					{/if}
				</div>
			{/if}
		</div>
	</div>
</div>

<!-- Fixed UI -->
<BackButton
	onclick={goBack}
	exiting={false}
	flyIn={false}
/>

<style>
	@keyframes fly-left-enter {
		from { transform: translateX(-120vw); }
		to   { transform: translateX(0); }
	}
	@keyframes fly-left-exit {
		from { transform: translateX(0); }
		to   { transform: translateX(-120vw); }
	}
	@keyframes fly-right-enter {
		from { transform: translateX(120vw); }
		to   { transform: translateX(0); }
	}
	@keyframes fly-right-exit {
		from { transform: translateX(0); }
		to   { transform: translateX(120vw); }
	}
	.image-area {
		animation: fly-left-enter var(--enter-duration) var(--enter-easing) both;
	}
	.image-area.exiting {
		animation: fly-left-exit var(--exit-duration) var(--exit-easing) both;
	}
	.detail-card {
		animation: fly-right-enter var(--enter-duration) var(--enter-easing) both;
	}
	.detail-card.exiting {
		animation: fly-right-exit var(--exit-duration) var(--exit-easing) both;
	}
	.purchase-btn {
		transition: transform var(--juice-duration) var(--juice-easing);
	}
	.purchase-btn:hover:not(:disabled) {
		transform: scale(var(--juice-scale));
	}
</style>
