<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import BackButton from '$lib/components/BackButton.svelte';
	import NavigationHint from '$lib/components/NavigationHint.svelte';
	import InputPrompt from '$lib/components/InputPrompt.svelte';
	import { createGridNav } from '$lib/nav/wasd.svelte';
	import { EXIT_DURATION } from '$lib';
	import { api } from '$lib/api';
	import { getShopBranding, type ShopBranding } from '$lib/data/shops';

	interface ShopItem {
		itemId: number;
		name: string;
		description: string | null;
		imageUrl: string | null;
		cost: number;
		regions: string[];
		isActive: boolean;
		variants: { variantId: number; name: string; cost: number }[];
	}

	const slug = $derived(page.params.slug ?? '');
	let branding = $state<ShopBranding | null>(null);

	let items = $state<ShopItem[]>([]);
	let selectedRegion = $state('');
	let filteredItems = $derived(
		selectedRegion ? items.filter(item => item.regions.includes(selectedRegion)) : items
	);
	let availableRegions = $derived(
		[...new Set(items.flatMap(item => item.regions))]
	);
	let loading = $state(true);
	let error = $state<string | null>(null);

	let entered = $state(false);
	let navigating = $state(false);
	let backExiting = $state(false);
	let skipItemAnimation = $state(false);
	let interacted = $state(false);

	onMount(async () => {
		requestAnimationFrame(() => requestAnimationFrame(() => { entered = true; }));
		branding = getShopBranding(slug);

		try {
			const { data, error: apiError } = await api.GET('/api/shop/{slug}/items', {
				params: { path: { slug } }
			});
			if (apiError) {
				error = 'Failed to load items';
			} else {
				items = (data as unknown as ShopItem[]) ?? [];
			}
		} catch {
			error = 'Failed to load items';
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

	let usingMouse = $state(true);
	let gridEl: HTMLDivElement;

	// Compute grid columns layout for createGridNav
	// Items are 300px wide with 16px gap in a flex-wrap container
	const CARD_W = 300;
	const GAP = 16;

	function getColumnsLayout(): number[] {
		if (filteredItems.length === 0) return [];
		const containerW = gridEl?.clientWidth ?? 932;
		const cols = Math.max(1, Math.floor((containerW + GAP) / (CARD_W + GAP)));
		const rows = Math.ceil(filteredItems.length / cols);
		// Each "column" in gridNav is actually a visual row; each "row" is a cell in that row
		// But gridNav uses col=horizontal, row=vertical
		// We want: A/D = move horizontally (within a row), W/S = move vertically (between rows)
		// gridNav: col = A/D axis, row = W/S axis
		// columns() returns array where index = col, value = number of rows in that col
		const result: number[] = [];
		for (let c = 0; c < cols; c++) {
			const itemsInCol = Math.min(rows, items.length - c * 1); // not right
			// Actually: grid is row-major. item i is at visual row=floor(i/cols), visual col=i%cols
			// gridNav col maps to visual col, row maps to visual row
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
		onEscape: () => navigateTo('/app/shop?back', { exitBack: true }),
		onSelect: () => {
			const idx = getSelectedIndex();
			const item = filteredItems[idx];
			if (item && item.isActive) {
				navigateTo(`/app/shop/${slug}/${item.itemId}`);
			}
		},
	});

	// Convert grid (col, row) to flat index: visual row * cols + visual col
	function getSelectedIndex(): number {
		const containerW = gridEl?.clientWidth ?? 932;
		const cols = Math.max(1, Math.floor((containerW + GAP) / (CARD_W + GAP)));
		return nav.row * cols + nav.col;
	}

	// Scroll selected card into view, top for first row, bottom for last row
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

	// function formatCost(cost: number): string {
	// 	return `${cost} hours`;
	// }
</script>

<svelte:window onkeydown={(e) => {
	if (usingMouse && ['w','a','s','d','W','A','S','D','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) {
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
}} onpointermove={() => { usingMouse = true; }} />

<div class="relative size-full overflow-y-auto" bind:this={scrollContainer} onscroll={() => { interacted = true; }}>
	<!-- Shop info card -->
	<div class="info-card" class:exiting={navigating}>
		<div
			class="border-4 border-black rounded-[20px] shadow-[4px_4px_0px_0px_black] overflow-hidden p-7.5 flex flex-col items-start w-full max-w-[932px]"
			style="background-color: {branding?.accentColor ?? '#fac393'};"
		>
			{#if branding?.logo}
				<img
					src={branding.logo}
					alt={branding.displayName}
					class="max-h-[75px] max-w-[264px] object-contain mb-1"
				/>
			{:else}
				<p class="font-cook font-semibold text-[48px] m-0 leading-[1.1]" style="color: #{branding?.textColor ?? '000000'};">
					{branding?.displayName ?? slug}
				</p>
			{/if}
			<p class="font-bricolage font-semibold text-[32px] m-0 leading-normal w-full" style="color: #{branding?.textColor ?? '000000'};">
				{branding?.tagline ?? ''}
			</p>
		</div>
		<!-- Status card (loading -> empty or fades out for items) -->
		<div
			class="status-card border-4 border-black rounded-[20px] shadow-[4px_4px_0px_0px_black] flex items-center justify-center w-full max-w-[932px]"
			class:hidden={!loading && !error && filteredItems.length > 0}
			style="background-color: #f3e8d8; height: 300px;"
		>
			<p class="font-bricolage font-semibold text-[28px] text-black/50 m-0">
				{#if loading}LOADING...{:else if error}{error}{:else if selectedRegion && items.length > 0}No items in this region{:else}Shop items coming soon{/if}
			</p>
		</div>

		<!-- Region filter -->
		{#if availableRegions.length > 0}
			<div class="flex gap-2 w-full max-w-[932px]">
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
						style="--card-index: {i}; width: 300px; height: 300px; background-color: {inactive ? '#d5d0c9' : selected && !usingMouse ? 'var(--selected-color)' : '#f3e8d8'}; transition: background-color var(--selected-duration) ease, transform 0.15s ease; cursor: {inactive ? 'default' : 'pointer'}; opacity: {inactive ? 0.5 : 1};"
						onfocus={() => { const cols = Math.max(1, Math.floor(((gridEl?.clientWidth ?? 932) + GAP) / (CARD_W + GAP))); nav.col = i % cols; nav.row = Math.floor(i / cols); }}
						onclick={() => { if (usingMouse && item.isActive) { setTimeout(() => navigateTo(`/app/shop/${slug}/${item.itemId}`), 200); } else if (!usingMouse) { const cols = Math.max(1, Math.floor(((gridEl?.clientWidth ?? 932) + GAP) / (CARD_W + GAP))); nav.col = i % cols; nav.row = Math.floor(i / cols); } }}
						onmouseenter={(e) => { if (!inactive) (e.currentTarget as HTMLElement).style.transform = 'scale(var(--juice-scale))'; }}
						onmouseleave={(e) => (e.currentTarget as HTMLElement).style.transform = 'scale(1)'}
						onpointerdown={(e) => { if (!inactive) (e.currentTarget as HTMLElement).style.transform = 'scale(0.95)'; }}
						onpointerup={(e) => { if (!inactive) (e.currentTarget as HTMLElement).style.transform = 'scale(var(--juice-scale))'; }}
					>
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
								<!-- <p class="m-0">{formatCost(item.cost)}</p> -->
							</div>

							{#if selected && item.variants.length > 0}
								<div class="flex flex-wrap gap-1 mt-1">
									{#each item.variants as variant (variant.variantId)}
										<span class="font-bricolage text-sm font-semibold text-black bg-[#f3e8d8] border-2 border-black rounded-lg px-2 py-0.5">
											{variant.name}<!-- ({variant.cost}h) -->
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

<!-- Fixed UI (outside scroll container) -->
<BackButton
	onclick={() => navigateTo('/app/shop?back', { exitBack: true })}
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
		from { transform: translateY(0); opacity: 1; }
		to   { transform: translateY(60px); opacity: 0; }
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
	.region-btn {
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

	.fade-wrap.exiting {
		opacity: 0;
		transition: opacity 250ms ease;
	}
</style>
