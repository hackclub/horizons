<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import InputPrompt from '$lib/components/InputPrompt.svelte';
	import NavigationHint from '$lib/components/NavigationHint.svelte';
	import BackButton from '$lib/components/BackButton.svelte';
	import { createListNav } from '$lib/nav/wasd.svelte';
	import { EXIT_DURATION } from '$lib';
	import { api } from '$lib/api';
	import { shopConfigs, type ShopBranding } from '$lib/data/shops';
	import TurbulentImage from '$lib/components/TurbulentImage.svelte';

	interface Shop {
		shopId: number;
		slug: string;
		description: string | null;
		isActive: boolean;
		isPublic: boolean;
	}

	let entered = $state(false);
	let navigating = $state(false);
	let backExiting = $state(false);
	let interacted = $state(false);

	let allShops = $state<Shop[]>([]);
	let shops = $derived(allShops.filter(s => s.slug in shopConfigs));
	let loading = $state(true);
	let error = $state<string | null>(null);

	onMount(async () => {
		requestAnimationFrame(() => requestAnimationFrame(() => { entered = true; }));

		try {
			const { data, error: apiError } = await api.GET('/api/shop/shops');
			if (apiError) {
				error = 'Failed to load shops';
			} else {
				allShops = (data as unknown as Shop[]) ?? [];
			}
		} catch {
			error = 'Failed to load shops';
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

	let scrollOffset = $state(0);
	let listEl: HTMLDivElement;
	let clickWasSelected = false;

	const nav = createListNav({
		count: () => shops.length,
		wheel: 80,
		horizontal: true,
		onChange: () => updateScroll(),
		onEscape: () => navigateTo('/app?noanimate', { exitBack: true }),
		onSelect: (i) => {
			const shop = shops[i];
			if (shop?.isActive) navigateTo(`/app/shop/${shop.slug}`);
		},
	});

	function updateScroll() {
		if (!listEl) return;
		const cards = listEl.querySelectorAll('.shop-card') as NodeListOf<HTMLElement>;
		const card = cards[nav.selectedIndex];
		if (!card) return;

		const containerWidth = listEl.parentElement?.clientWidth ?? 0;
		const cardLeft = card.offsetLeft;
		const cardWidth = card.offsetWidth;

		let offset = -(cardLeft + cardWidth / 2 - containerWidth / 2);
		offset = Math.min(offset, 0);

		const listWidth = listEl.scrollWidth;
		if (listWidth > containerWidth) {
			offset = Math.max(offset, -(listWidth - containerWidth));
		}

		scrollOffset = offset;
	}

	function getBranding(slug: string): ShopBranding | null {
		return shopConfigs[slug] ?? null;
	}

	const selectedShop = $derived(shops[nav.selectedIndex] ?? null);
	const selectedBranding = $derived(selectedShop ? getBranding(selectedShop.slug) : null);
</script>

<svelte:window onkeydown={(e) => { nav.handleKeydown(e); interacted = true; }} onwheel={(e) => { nav.handleWheel(e); interacted = true; }} onclick={() => { interacted = true; }} />

<div class="relative size-full" style="--shop-duration: 0.6s;">
	<!-- Hero image -->
	<div style="opacity: {navigating || !entered ? 0 : selectedBranding?.cardImage ? 1 : 0}; transition: opacity var(--shop-duration) var(--juice-easing);">
		<TurbulentImage
			src={selectedBranding?.cardImage ?? ''}
			alt={selectedBranding?.displayName ?? ''}
			inset="0 -40% 0 40%"
			zIndex={0}
		/>
	</div>

	<!-- Scrollable shop list -->
	<div class="absolute left-[239px] top-[61px] bottom-10 right-10 overflow-visible z-2">
		<div
			class="flex items-end gap-6 h-full pl-4"
			bind:this={listEl}
			style="transform: translateX({scrollOffset}px); transition: transform var(--shop-duration) var(--juice-easing);"
		>
			{#if loading || error || shops.length === 0}
				<div class="shop-card bg-[#f3e8d8] border-4 border-black rounded-[20px] p-7.5 shadow-[4px_4px_0px_0px_black] flex items-center justify-center shrink-0 self-center" class:exiting={navigating} style="--card-index: 0; width: 548px; height: 300px;">
					<p class="font-cook font-semibold text-black text-[40px] m-0 opacity-50">
						{#if loading}LOADING...{:else if error}{error}{:else}NO SHOPS AVAILABLE{/if}
					</p>
				</div>
			{:else}
				{#each shops as shop, i (`${shop.slug}-${i}`)}
					{@const selected = i === nav.selectedIndex}
					{@const branding = getBranding(shop.slug)}
					{@const inactive = !shop.isActive}
					<button
						class="shop-card border-4 border-black rounded-[20px] shadow-[4px_4px_0px_0px_black] flex flex-col items-start justify-end overflow-hidden relative text-left outline-none shrink-0 self-center p-[30px]"
						class:selected
						class:exiting={navigating}
						style="--card-index: {i}; width: {selected ? '548px' : '360px'}; height: {selected ? '685px' : '508px'}; transition: width var(--shop-duration) var(--juice-easing), height var(--shop-duration) var(--juice-easing); cursor: {inactive ? 'default' : 'pointer'};"
						onpointerdown={() => { clickWasSelected = nav.selectedIndex === i; }}
						onfocus={() => { nav.selectedIndex = i; updateScroll(); }}
						onclick={() => { if (clickWasSelected && !inactive) navigateTo(`/app/shop/${shop.slug}`); }}
						onmouseenter={(e) => { if (!inactive) (e.currentTarget as HTMLElement).style.transform = 'scale(var(--juice-scale))'; }}
						onmouseleave={(e) => (e.currentTarget as HTMLElement).style.transform = 'scale(1)'}
					>
						<!-- Card background image -->
						{#if branding?.cardImage}
							<img
								alt=""
								class="absolute inset-0 max-w-none object-cover pointer-events-none rounded-[16px] size-full"
								src={branding.cardImage}
							/>
						{/if}

						<!-- Gradient overlay -->
						<div
							class="absolute inset-0 rounded-[16px] pointer-events-none transition-all"
							style="background: linear-gradient(to bottom, transparent 0%, {selected && !inactive ? (branding?.accentColor ?? '#fac393') : 'rgba(0,0,0,0.6)'} 62%); transition-duration: var(--shop-duration); transition-timing-function: var(--juice-easing);"
						></div>

						<!-- Tag badge -->
						{#if branding?.tag || inactive}
							<span
								class="absolute top-4 right-4 font-bricolage text-sm font-bold px-3 py-1 rounded-full border-2 border-black z-10"
								style="background-color: {branding?.tag?.color ?? '#d1d5db'};"
							>
								{branding?.tag?.text ?? 'CLOSED'}
							</span>
						{/if}

						<!-- Details -->
						<div class="flex flex-col gap-3 items-start relative z-1 w-full transition-colors" style="color: {inactive ? 'white' : branding?.textColor ? `#${branding.textColor}` : 'black'}; transition-duration: var(--shop-duration); transition-timing-function: var(--juice-easing);">
							{#if branding?.logo}
								<img
									src={branding.logo}
									alt={branding.displayName}
									class="object-contain transition-all"
									style="max-height: {selected ? '107px' : '60px'}; max-width: {selected ? '356px' : '200px'}; transition-duration: var(--shop-duration); transition-timing-function: var(--juice-easing);"
								/>
							{:else}
								<p class="font-cook font-semibold text-[48px] m-0 leading-[1.1]">
									{branding?.displayName ?? shop.slug}
								</p>
							{/if}

							<div class="overflow-hidden transition-all" style="width: 488px; grid-template-rows: {selected ? '1fr' : '0fr'}; display: grid; opacity: {selected ? 1 : 0}; transition-duration: var(--shop-duration); transition-timing-function: var(--juice-easing);">
								<p class="font-bricolage font-semibold text-[32px] m-0 leading-normal min-h-0">
									{branding?.tagline ?? shop.description ?? ''}
								</p>
							</div>
						</div>

						<!-- Input prompt (selected + active only) -->
						{#if selected && !inactive}
							<div class="flex items-center gap-2 z-1 mt-3">
								<InputPrompt type="Enter" color={branding?.navHintColor ?? 'black'} />
								<span class="font-bricolage text-2xl font-bold" style="color: {branding?.navHintColor ?? 'black'};">OR</span>
								<InputPrompt type="click" color={branding?.navHintColor ?? 'black'} />
								<span class="font-bricolage text-2xl font-bold" style="color: {branding?.navHintColor ?? 'black'};">TO VIEW</span>
							</div>
						{/if}
					</button>
				{/each}
			{/if}
		</div>
	</div>

	<!-- Back button -->
	<BackButton
		onclick={() => navigateTo('/app?noanimate', { exitBack: true })}
		exiting={backExiting}
		flyIn={page.url.searchParams.has('back')}
	/>

	<!-- Navigation hint -->
	<div class="fade-wrap" class:entered class:exiting={navigating || interacted}>
		<NavigationHint
			segments={[
				{ type: 'text', value: 'USE' },
				{ type: 'input', value: 'AD' },
				{ type: 'text', value: 'OR' },
				{ type: 'input', value: 'mouse-scroll' },
				{ type: 'text', value: 'TO NAVIGATE' }
			]}
			position="bottom-right"
		/>
	</div>
</div>

<style>
	@keyframes card-enter {
		from { transform: translateY(120vh); }
		to   { transform: translateY(0); }
	}
	.shop-card {
		animation: card-enter var(--enter-duration) var(--enter-easing) both;
		animation-delay: calc(var(--card-index, 0) * 75ms);
	}

	@keyframes card-exit {
		from { transform: translateY(0); }
		to   { transform: translateY(120vh); }
	}
	.shop-card.exiting {
		animation: card-exit var(--exit-duration) var(--exit-easing) both;
		animation-delay: calc(var(--card-index, 0) * 75ms);
	}

	.fade-wrap {
		opacity: 0;
	}
	.fade-wrap.entered {
		opacity: 1;
		transition: opacity var(--enter-duration) ease;
	}
	.fade-wrap.exiting {
		opacity: 0;
		transition: opacity 250ms ease;
	}
</style>
