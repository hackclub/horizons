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
		region: string | null;
		isActive: boolean;
		variants: { variantId: number; name: string; cost: number }[];
	}

	const slug = $derived(page.params.slug ?? '');
	const itemId = $derived(Number(page.params.itemId));

	let item = $state<ShopItem | null>(null);
	let balance = $state<number | null>(null);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let selectedVariantId = $state<number | null>(null);

	let navigating = $state(false);

	onMount(async () => {

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

	async function navigateTo(href: string) {
		navigating = true;
		await new Promise(resolve => setTimeout(resolve, EXIT_DURATION + 350));
		goto(href);
	}

	function goBack() {
		navigateTo(`/app/shop/${slug}?back`);
	}

	// async function handlePurchase() {
	// 	if (!item || purchasing) return;
	// 	purchasing = true;
	// 	purchaseError = null;
	//
	// 	try {
	// 		const body: { itemId: number; variantId?: number } = { itemId: item.itemId };
	// 		if (selectedVariantId !== null) {
	// 			body.variantId = selectedVariantId;
	// 		}
	//
	// 		const { error: apiError } = await api.POST('/api/shop/auth/purchase', { body });
	//
	// 		if (apiError) {
	// 			purchaseError = 'Purchase failed';
	// 		} else {
	// 			purchaseSuccess = true;
	// 			const balanceRes = await api.GET('/api/shop/auth/balance');
	// 			if (!balanceRes.error) {
	// 				balance = (balanceRes.data as unknown as { balance: number })?.balance ?? null;
	// 			}
	// 		}
	// 	} catch {
	// 		purchaseError = 'Purchase failed';
	// 	} finally {
	// 		purchasing = false;
	// 	}
	// }

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
						<p class="font-cook text-[36px] leading-normal m-0">{item.name}</p>
						{#if item.region}
							<span class="font-bricolage text-sm font-semibold text-black border-2 border-black rounded-lg px-2 py-0.5 bg-black/10 w-fit">{item.region}</span>
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
									class="font-bricolage text-sm font-semibold text-black border-2 border-black rounded-lg px-3 py-1 cursor-pointer {selectedVariantId === variant.variantId ? 'shadow-[2px_2px_0px_0px_black]' : ''}"
									style="background-color: {selectedVariantId === variant.variantId ? 'var(--selected-color)' : '#f3e8d8'}; transition: background-color var(--selected-duration) ease;"
									onclick={() => { selectedVariantId = variant.variantId; }}
								>
									{variant.name}
								</button>
							{/each}
						</div>
					{/if}

					<button
						class="border-2 border-black rounded-[8px] px-4 py-2 bg-transparent font-bricolage font-semibold text-[16px] text-black/50 leading-normal cursor-not-allowed"
						disabled
					>
						Purchase
					</button>
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
</style>
