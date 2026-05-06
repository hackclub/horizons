<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import BackButton from '$lib/components/BackButton.svelte';
	import NavigationHint from '$lib/components/NavigationHint.svelte';
	import { createGridNav } from '$lib/nav/wasd.svelte';
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
		variants: { variantId: number; name: string; cost: number }[];
	}

	let items = $state<ShopItem[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);

	let selectedCategories = $state<Set<string>>(new Set());
	let selectedRegion = $state('');

	let entered = $state(false);
	let navigating = $state(false);
	let backExiting = $state(false);
	let skipItemAnimation = $state(false);
	let interacted = $state(false);
	let itemsReady = $state(false);

	const availableCategories = $derived(
		[...new Set(items.map((i) => i.shopSlug))].filter((s) => s)
	);
	const availableRegions = $derived(
		[...new Set(items.flatMap((item) => item.regions))]
	);

	const filteredItems = $derived(
		items.filter((item) => {
			if (selectedCategories.size > 0 && !selectedCategories.has(item.shopSlug)) return false;
			if (selectedRegion && !item.regions.includes(selectedRegion)) return false;
			return true;
		})
	);

	onMount(async () => {
		requestAnimationFrame(() => requestAnimationFrame(() => { entered = true; }));

		try {
			const { data, error: apiError } = await api.GET('/api/shop/items');
			if (apiError) {
				error = 'Failed to load items';
			} else {
				items = (data as unknown as ShopItem[]) ?? [];
			}
		} catch {
			error = 'Failed to load items';
		} finally {
			loading = false;
			const lastDelay = (items.length - 1) * 75 + 200;
			setTimeout(() => { itemsReady = true; }, lastDelay + 750);
		}
	});

	async function navigateTo(href: string, opts: { exitBack?: boolean } = {}) {
		navigating = true;
		if (opts.exitBack) backExiting = true;
		await new Promise((resolve) => setTimeout(resolve, EXIT_DURATION + 350));
		goto(href);
	}

	function toggleCategory(slug: string) {
		const next = new Set(selectedCategories);
		if (next.has(slug)) next.delete(slug);
		else next.add(slug);
		selectedCategories = next;
		skipItemAnimation = true;
	}

	let usingMouse = $state(true);
	let gridEl: HTMLDivElement;

	const CARD_W = 300;
	const GAP = 16;

	function getColumnsLayout(): number[] {
		if (filteredItems.length === 0) return [];
		const containerW = gridEl?.clientWidth ?? 932;
		const cols = Math.max(1, Math.floor((containerW + GAP) / (CARD_W + GAP)));
		const rows = Math.ceil(filteredItems.length / cols);
		const result: number[] = [];
		for (let c = 0; c < cols; c++) {
			let count = 0;
			for (let r = 0; r < rows; r++) {
				if (r * cols + c < filteredItems.length) count++;
			}
			result.push(count);
		}
		return result;
	}

	const nav = createGridNav({
		columns: () => getColumnsLayout(),
		onEscape: () => navigateTo('/app?noanimate', { exitBack: true }),
		onSelect: () => {
			const idx = getSelectedIndex();
			const item = filteredItems[idx];
			if (item && item.isActive) {
				navigateTo(`/app/shop/${item.itemId}`);
			}
		}
	});

	function getSelectedIndex(): number {
		const containerW = gridEl?.clientWidth ?? 932;
		const cols = Math.max(1, Math.floor((containerW + GAP) / (CARD_W + GAP)));
		return nav.row * cols + nav.col;
	}

	let scrollContainer: HTMLDivElement;
	$effect(() => {
		const _ = nav.col + nav.row;
		requestAnimationFrame(() => {
			const cols = getColumnsLayout();
			const maxRow = cols.length > 0 ? Math.max(...cols) - 1 : 0;
			if (nav.row === 0) {
				scrollContainer?.scrollTo({ top: 0, behavior: 'smooth' });
			} else if (nav.row === maxRow) {
				scrollContainer?.scrollTo({ top: scrollContainer.scrollHeight, behavior: 'smooth' });
			} else {
				const cards = gridEl?.querySelectorAll('.item-card') as NodeListOf<HTMLElement> | undefined;
				const card = cards?.[getSelectedIndex()];
				if (card && scrollContainer) {
					const cardRect = card.getBoundingClientRect();
					const containerRect = scrollContainer.getBoundingClientRect();
					const padding = 80;
					if (cardRect.bottom + padding > containerRect.bottom) {
						scrollContainer.scrollBy({ top: cardRect.bottom + padding - containerRect.bottom, behavior: 'smooth' });
					} else if (cardRect.top - padding < containerRect.top) {
						scrollContainer.scrollBy({ top: cardRect.top - padding - containerRect.top, behavior: 'smooth' });
					}
				}
			}
		});
	});

	function formatCost(cost: number): string {
		return `${cost}h`;
	}
</script>

<svelte:window
	onkeydown={(e) => {
		if (usingMouse && ['w', 'a', 's', 'd', 'W', 'A', 'S', 'D', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
			usingMouse = false;
			nav.col = 0;
			nav.row = 0;
			e.preventDefault();
			interacted = true;
			return;
		}
		usingMouse = false;
		nav.handleKeydown(e);
		interacted = true;
	}}
	onpointermove={() => {
		usingMouse = true;
	}}
/>

<div class="relative size-full overflow-y-auto" bind:this={scrollContainer} onscroll={() => { interacted = true; }}>
	<div class="info-card" class:exiting={navigating}>
		<!-- Header card -->
		<div
			class="border-4 border-black rounded-[20px] shadow-[4px_4px_0px_0px_black] overflow-hidden p-7.5 flex flex-col items-start w-full max-w-[932px]"
			style="background-color: #fac393;"
		>
			<p class="font-cook font-semibold text-[48px] m-0 leading-[1.1] text-black">Shop</p>
			<p class="font-bricolage font-semibold text-[32px] m-0 leading-normal w-full text-black">
				Spend your hours on swag, grants, and more.
			</p>
		</div>

		<!-- Status card -->
		<div
			class="status-card border-4 border-black rounded-[20px] shadow-[4px_4px_0px_0px_black] flex items-center justify-center w-full max-w-[932px]"
			class:hidden={!loading && !error && filteredItems.length > 0}
			style="background-color: #f3e8d8; height: 300px;"
		>
			<p class="font-bricolage font-semibold text-[28px] text-black/50 m-0">
				{#if loading}LOADING...{:else if error}{error}{:else if (selectedCategories.size > 0 || selectedRegion) && items.length > 0}No items match these filters{:else}Shop items coming soon{/if}
			</p>
		</div>

		<!-- Category filters -->
		{#if availableCategories.length > 0}
			<div class="flex gap-2 flex-wrap w-full max-w-[932px] items-center">
				<span class="font-bricolage font-semibold text-sm text-black/60 mr-1">Categories:</span>
				<button
					class="category-btn font-bricolage font-semibold text-sm border-3 border-black rounded-xl px-3 py-1.5 shadow-[2px_2px_0px_0px_black] transition-colors"
					class:active={selectedCategories.size === 0}
					onclick={() => { selectedCategories = new Set(); skipItemAnimation = true; }}
				>
					All
				</button>
				{#each availableCategories as slug (slug)}
					{@const active = selectedCategories.has(slug)}
					<button
						class="category-btn font-bricolage font-semibold text-sm border-3 border-black rounded-xl px-3 py-1.5 shadow-[2px_2px_0px_0px_black] transition-colors capitalize"
						class:active
						onclick={() => toggleCategory(slug)}
					>
						{slug}
					</button>
				{/each}
			</div>
		{/if}

		<!-- Region filter -->
		{#if availableRegions.length > 0}
			<div class="flex gap-2 w-full max-w-[932px] items-center">
				<span class="font-bricolage font-semibold text-sm text-black/60 mr-1">Region:</span>
				<button
					class="region-btn font-bricolage font-semibold text-sm border-3 border-black rounded-xl px-3 py-1.5 shadow-[2px_2px_0px_0px_black] transition-colors"
					class:active={selectedRegion === ''}
					onclick={() => { selectedRegion = ''; skipItemAnimation = true; }}
				>
					All
				</button>
				{#each availableRegions as region}
					<button
						class="region-btn font-bricolage font-semibold text-sm border-3 border-black rounded-xl px-3 py-1.5 shadow-[2px_2px_0px_0px_black] transition-colors"
						class:active={selectedRegion === region}
						onclick={() => { selectedRegion = selectedRegion === region ? '' : region; skipItemAnimation = true; }}
					>
						{region}
					</button>
				{/each}
			</div>
		{/if}

		<!-- Items -->
		<div class="flex gap-4 flex-wrap w-full max-w-[932px]" bind:this={gridEl}>
			{#if !loading && !error && filteredItems.length > 0}
				{#each filteredItems as item, i (item.itemId)}
					{@const selected = i === getSelectedIndex()}
					{@const inactive = !item.isActive}
					<button
						class="item-card border-4 border-black rounded-[20px] shadow-[4px_4px_0px_0px_black] overflow-hidden relative text-left outline-none shrink-0"
						class:selected
						class:skip-animation={skipItemAnimation}
						class:exiting={navigating}
						style="--card-index: {i}; width: 300px; height: 300px; background-color: {inactive ? '#d5d0c9' : selected && !usingMouse ? 'var(--selected-color)' : '#f3e8d8'}; transition: background-color var(--selected-duration) ease, transform var(--juice-duration) var(--juice-easing); cursor: {inactive ? 'default' : 'pointer'}; opacity: {inactive ? 0.5 : 1};"
						onfocus={() => {
							const cols = Math.max(1, Math.floor(((gridEl?.clientWidth ?? 932) + GAP) / (CARD_W + GAP)));
							nav.col = i % cols;
							nav.row = Math.floor(i / cols);
						}}
						onclick={(e) => {
							if (usingMouse && item.isActive) {
								(e.currentTarget as HTMLElement).style.transform = 'scale(1)';
								setTimeout(() => navigateTo(`/app/shop/${item.itemId}`), 200);
							} else if (!usingMouse) {
								const cols = Math.max(1, Math.floor(((gridEl?.clientWidth ?? 932) + GAP) / (CARD_W + GAP)));
								nav.col = i % cols;
								nav.row = Math.floor(i / cols);
							}
						}}
						onmouseenter={(e) => {
							if (!inactive && itemsReady) (e.currentTarget as HTMLElement).style.transform = 'scale(var(--juice-scale))';
						}}
						onmouseleave={(e) => {
							if (itemsReady) (e.currentTarget as HTMLElement).style.transform = 'scale(1)';
						}}
					>
						<!-- Category badge -->
						{#if item.shopSlug}
							<span
								class="absolute top-2.5 right-2.5 font-bricolage text-[11px] font-bold px-2 py-0.5 rounded-full border-2 border-black z-10 bg-[#f3e8d8] text-black capitalize"
							>
								{item.shopSlug}
							</span>
						{/if}

						<!-- Item image -->
						{#if item.imageUrl}
							<div class="absolute top-5 left-1/2 -translate-x-1/2 h-[151px] w-[189px] flex items-center justify-center">
								<img
									src={item.imageUrl}
									alt={item.name}
									class="max-w-full max-h-full object-contain"
									style={inactive ? 'filter: grayscale(1);' : ''}
								/>
							</div>
						{/if}

						<!-- Item details -->
						<div class="absolute left-3 bottom-3.5 w-[263px] flex flex-col gap-1.75">
							<div class="font-bricolage font-semibold text-[24px] text-black leading-normal">
								<p class="m-0">{item.name}</p>
								<p class="m-0 text-[18px] text-black/60">{formatCost(item.cost)}</p>
							</div>

							{#if selected && item.variants.length > 0}
								<div class="flex flex-wrap gap-1 mt-1">
									{#each item.variants as variant (variant.variantId)}
										<span class="font-bricolage text-sm font-semibold text-black bg-[#f3e8d8] border-2 border-black rounded-lg px-2 py-0.5">
											{variant.name} ({variant.cost}h)
										</span>
									{/each}
								</div>
							{/if}
						</div>
					</button>
				{/each}
			{/if}
		</div>
	</div>
</div>

<!-- Fixed UI -->
<BackButton
	onclick={() => navigateTo('/app?noanimate', { exitBack: true })}
	exiting={backExiting}
	flyIn={page.url.searchParams.has('back')}
/>

<div class="fade-wrap absolute inset-0 pointer-events-none z-20" class:entered class:exiting={navigating || interacted}>
	<NavigationHint
		segments={[
			{ type: 'text', value: 'USE' },
			{ type: 'input', value: 'WASD' },
			{ type: 'text', value: 'OR' },
			{ type: 'input', value: 'mouse' },
			{ type: 'text', value: 'TO NAVIGATE' }
		]}
		position="bottom-right"
	/>
</div>

<style>
	@keyframes info-enter {
		from { transform: translateY(-60px); opacity: 0; }
		to   { transform: translateY(0); opacity: 1; }
	}
	@keyframes info-exit {
		from { transform: translateY(0); opacity: 1; }
		to   { transform: translateY(-60px); opacity: 0; }
	}
	.info-card {
		padding: 40px 40px 80px;
		padding-top: 161px;
		z-index: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 16px;
		animation: info-enter var(--enter-duration) var(--enter-easing) both;
	}
	.info-card.exiting {
		animation: info-exit var(--exit-duration) var(--exit-easing) both;
	}

	.status-card {
		transition: opacity 0.3s ease, height 0.3s ease;
	}
	.status-card.hidden {
		opacity: 0;
		height: 0 !important;
		border: none;
		box-shadow: none;
		overflow: hidden;
		padding: 0;
	}

	@keyframes item-enter {
		from { transform: translateY(60px); opacity: 0; }
		to   { transform: translateY(0); opacity: 1; }
	}
	.item-card {
		animation: item-enter var(--enter-duration) var(--enter-easing) backwards;
		animation-delay: calc(var(--card-index, 0) * 75ms + 200ms);
	}
	.item-card.skip-animation {
		animation: none;
	}

	@keyframes item-exit {
		from { transform: translateY(0) scale(1); opacity: 1; }
		to   { transform: translateY(60px) scale(1); opacity: 0; }
	}
	.item-card.exiting {
		animation: item-exit var(--exit-duration) var(--exit-easing) both;
	}

	.fade-wrap {
		opacity: 0;
	}
	.fade-wrap.entered {
		opacity: 1;
		transition: opacity var(--enter-duration) ease;
	}
	.region-btn,
	.category-btn {
		background-color: #f3e8d8;
		color: black;
		cursor: pointer;
	}
	.region-btn:hover {
		background-color: #e8dac8;
	}
	.region-btn.active {
		background-color: black;
		color: #f3e8d8;
	}
	.category-btn:hover {
		filter: brightness(0.95);
	}
	.category-btn.active {
		background-color: #ffa936;
		color: black;
	}

	.fade-wrap.exiting {
		opacity: 0;
		transition: opacity 250ms ease;
	}
</style>
