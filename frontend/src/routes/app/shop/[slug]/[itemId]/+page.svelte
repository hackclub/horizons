<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import BackButton from '$lib/components/BackButton.svelte';
	import { EXIT_DURATION } from '$lib';
	import { api } from '$lib/api';

	interface ShopItem {
		itemId: number;
		name: string;
		description: string | null;
		imageUrl: string | null;
		cost: number;
		isActive: boolean;
		variants: { variantId: number; name: string; cost: number }[];
	}

	const slug = $derived(page.params.slug ?? '');
	const itemId = $derived(Number(page.params.itemId));

	let item = $state<ShopItem | null>(null);
	let balance = $state<number | null>(null);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let purchasing = $state(false);
	let purchaseError = $state<string | null>(null);
	let purchaseSuccess = $state(false);

	let selectedVariantId = $state<number | null>(null);

	let entered = $state(false);
	let navigating = $state(false);
	let backExiting = $state(false);

	onMount(async () => {
		requestAnimationFrame(() => requestAnimationFrame(() => { entered = true; }));

		try {
			const [itemRes, balanceRes] = await Promise.all([
				api.GET('/api/shop/{slug}/items/{id}', {
					params: { path: { slug, id: itemId } }
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

	async function navigateTo(href: string, opts: { exitBack?: boolean } = {}) {
		navigating = true;
		if (opts.exitBack) backExiting = true;
		await new Promise(resolve => setTimeout(resolve, EXIT_DURATION + 350));
		goto(href);
	}

	function goBack() {
		navigateTo(`/app/shop/${slug}?back`, { exitBack: true });
	}

	async function handlePurchase() {
		if (!item || purchasing) return;
		purchasing = true;
		purchaseError = null;

		try {
			const body: { itemId: number; variantId?: number } = { itemId: item.itemId };
			if (selectedVariantId !== null) {
				body.variantId = selectedVariantId;
			}

			const { error: apiError } = await api.POST('/api/shop/auth/purchase', { body });

			if (apiError) {
				purchaseError = 'Purchase failed';
			} else {
				purchaseSuccess = true;
				// Refresh balance
				const balanceRes = await api.GET('/api/shop/auth/balance');
				if (!balanceRes.error) {
					balance = (balanceRes.data as unknown as { balance: number })?.balance ?? null;
				}
			}
		} catch {
			purchaseError = 'Purchase failed';
		} finally {
			purchasing = false;
		}
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
	{#if item?.imageUrl}
		<div class="image-area w-[488px] h-[389px] flex items-center justify-center shrink-0 opacity-0" class:entered class:exiting={navigating}>
			<img
				src={item.imageUrl}
				alt={item.name}
				class="max-w-full max-h-full object-contain"
			/>
		</div>
	{/if}

	<!-- Detail card on right -->
	<div class="detail-card shrink-0 opacity-0" class:entered class:exiting={navigating}>
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
						<p class="font-cook text-[36px] leading-normal m-0">{item.name}</p>
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
									class="font-bricolage text-sm font-semibold text-black border-2 border-black rounded-lg px-3 py-1 cursor-pointer {selectedVariantId === variant.variantId ? 'shadow-[2px_2px_0px_0px_black]' : ''}"
									style="background-color: {selectedVariantId === variant.variantId ? 'var(--selected-color)' : '#f3e8d8'}; transition: background-color var(--selected-duration) ease;"
									onclick={() => { selectedVariantId = variant.variantId; }}
								>
									{variant.name}
								</button>
							{/each}
						</div>
					{/if}

					{#if purchaseSuccess}
						<div class="border-2 border-black rounded-[8px] px-4 py-2 bg-green-100">
							<p class="font-bricolage font-semibold text-[16px] text-black leading-normal m-0">Purchased!</p>
						</div>
					{:else}
						<button
							class="border-2 border-black rounded-[8px] px-4 py-2 bg-transparent cursor-pointer font-bricolage font-semibold text-[16px] text-black leading-normal hover:bg-black/10"
							style="transition: background-color var(--selected-duration) ease, transform var(--juice-duration) var(--juice-easing);"
							onmouseenter={(e) => (e.currentTarget as HTMLElement).style.transform = 'scale(var(--juice-scale))'}
							onmouseleave={(e) => (e.currentTarget as HTMLElement).style.transform = 'scale(1)'}
							onclick={handlePurchase}
							disabled={purchasing}
						>
							{purchasing ? 'Purchasing...' : 'Purchase'}
						</button>
					{/if}

					{#if purchaseError}
						<p class="font-bricolage text-sm text-red-700 m-0">{purchaseError}</p>
					{/if}
				</div>
			{/if}
		</div>
	</div>
</div>

<!-- Fixed UI -->
<BackButton
	onclick={goBack}
	exiting={backExiting}
	flyIn={page.url.searchParams.has('back')}
/>

<style>
	@keyframes image-enter {
		from { transform: translateX(-100px); opacity: 0; }
		to   { transform: translateX(0); opacity: 1; }
	}
	@keyframes image-exit {
		from { transform: translateX(0); opacity: 1; }
		to   { transform: translateX(-100px); opacity: 0; }
	}
	.image-area.entered {
		animation: image-enter var(--enter-duration) var(--enter-easing) both;
		animation-delay: 100ms;
	}
	.image-area.exiting {
		animation: image-exit var(--exit-duration) var(--exit-easing) both;
	}

	@keyframes card-enter {
		from { transform: translateX(100px); opacity: 0; }
		to   { transform: translateX(0); opacity: 1; }
	}
	@keyframes card-exit {
		from { transform: translateX(0); opacity: 1; }
		to   { transform: translateX(100px); opacity: 0; }
	}
	.detail-card.entered {
		animation: card-enter var(--enter-duration) var(--enter-easing) both;
		animation-delay: 200ms;
	}
	.detail-card.exiting {
		animation: card-exit var(--exit-duration) var(--exit-easing) both;
	}

</style>
