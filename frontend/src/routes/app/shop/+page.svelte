<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import BackButton from '$lib/components/BackButton.svelte';
	import NavigationHint from '$lib/components/NavigationHint.svelte';
	import { createGridNav } from '$lib/nav/wasd.svelte';
	import { EXIT_DURATION } from '$lib';
	import { api } from '$lib/api';
	import yaml from 'js-yaml';
	import type { EventConfig } from '$lib/events/types';
	import eventsRaw from '$lib/events/events.yaml?raw';

	const eventSlugs = new Set(Object.keys(yaml.load(eventsRaw) as Record<string, EventConfig>));

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

	interface Order {
		transactionId: number;
		itemId: number;
		cost: number;
		isFulfilled: boolean;
		fulfilledAt: string | null;
		refundedAt: string | null;
		createdAt: string;
		item: { itemId: number; name: string; imageUrl?: string | null };
		variant: { variantId: number; name: string } | null;
	}

	let items = $state<ShopItem[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);

	let orders = $state<Order[]>([]);
	let ordersLoaded = $state(false);
	let ordersLoading = $state(false);
	let ordersError = $state<string | null>(null);

	type Tab = 'shop' | 'orders';
	let activeTab = $state<Tab>('shop');
	let onTabs = $state(false);
	let selectedTabIdx = $state(0);
	const TABS: Tab[] = ['shop', 'orders'];

	type FilterButton =
		| { type: 'category-all' }
		| { type: 'category'; slug: string }
		| { type: 'region-all' }
		| { type: 'region'; name: string };
	let onFilters = $state(false);
	let selectedFilterIdx = $state(0);

	let selectedCategories = $state<Set<string>>(new Set());
	let selectedRegion = $state('');

	let entered = $state(false);
	let navigating = $state(false);
	let backExiting = $state(false);
	let skipItemAnimation = $state(false);
	let interacted = $state(false);
	let itemsReady = $state(false);

	const nonEventItems = $derived(items.filter((item) => !eventSlugs.has(item.shopSlug)));

	const availableCategories = $derived(
		[...new Set(nonEventItems.map((i) => i.shopSlug))].filter((s) => s)
	);
	const availableRegions = $derived(
		[...new Set(nonEventItems.flatMap((item) => item.regions))]
	);

	const filteredItems = $derived(
		nonEventItems.filter((item) => {
			if (selectedCategories.size > 0 && !selectedCategories.has(item.shopSlug)) return false;
			if (selectedRegion && !item.regions.includes(selectedRegion)) return false;
			return true;
		})
	);

	const filterButtons = $derived.by<FilterButton[]>(() => {
		const result: FilterButton[] = [];
		if (availableCategories.length > 0) {
			result.push({ type: 'category-all' });
			for (const slug of availableCategories) result.push({ type: 'category', slug });
		}
		if (availableRegions.length > 0) {
			result.push({ type: 'region-all' });
			for (const name of availableRegions) result.push({ type: 'region', name });
		}
		return result;
	});

	function filterIsActive(btn: FilterButton): boolean {
		switch (btn.type) {
			case 'category-all': return selectedCategories.size === 0;
			case 'category': return selectedCategories.has(btn.slug);
			case 'region-all': return selectedRegion === '';
			case 'region': return selectedRegion === btn.name;
		}
	}

	function filterClick(btn: FilterButton) {
		switch (btn.type) {
			case 'category-all':
				selectedCategories = new Set();
				skipItemAnimation = true;
				break;
			case 'category':
				toggleCategory(btn.slug);
				break;
			case 'region-all':
				selectedRegion = '';
				skipItemAnimation = true;
				break;
			case 'region':
				selectedRegion = selectedRegion === btn.name ? '' : btn.name;
				skipItemAnimation = true;
				break;
		}
	}

	function filterLabel(btn: FilterButton): string {
		switch (btn.type) {
			case 'category-all':
			case 'region-all':
				return 'All';
			case 'category': return btn.slug;
			case 'region': return btn.name;
		}
	}

	function defaultFilterIdx(): number {
		for (let i = 0; i < filterButtons.length; i++) {
			const btn = filterButtons[i];
			if (btn.type === 'category' && selectedCategories.has(btn.slug)) return i;
			if (btn.type === 'region' && selectedRegion === btn.name) return i;
		}
		return 0;
	}

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

	async function loadOrders() {
		ordersLoading = true;
		ordersError = null;
		try {
			const { data, error: apiError } = await api.GET('/api/shop/auth/transactions');
			if (apiError) {
				ordersError = 'Failed to load orders';
			} else {
				orders = (data as unknown as Order[]) ?? [];
			}
		} catch {
			ordersError = 'Failed to load orders';
		} finally {
			ordersLoading = false;
			ordersLoaded = true;
		}
	}

	function setTab(tab: Tab) {
		if (activeTab === tab) return;
		activeTab = tab;
		interacted = true;
		skipItemAnimation = false;
		nav.col = 0;
		nav.row = 0;
		onFilters = false;
		selectedFilterIdx = 0;
		scrollContainer?.scrollTo({ top: 0 });
		if (tab === 'orders' && !ordersLoaded) loadOrders();
	}

	function orderStatusLabel(order: Order): string {
		if (order.refundedAt) return 'Refunded';
		if (order.isFulfilled) return 'Fulfilled';
		return 'Processing';
	}

	function formatHours(cost: number): string {
		return `${cost} hour${cost === 1 ? '' : 's'}`;
	}

	function formatDate(iso: string): string {
		const d = new Date(iso);
		return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
	}

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
	let ordersEl: HTMLDivElement | undefined;

	const CARD_W = 300;
	const GAP = 16;

	function getColumnsLayout(): number[] {
		if (activeTab === 'orders') {
			return orders.length > 0 ? [orders.length] : [];
		}
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
			if (activeTab === 'orders') {
				const order = orders[nav.row];
				if (order) navigateTo(`/app/shop/${order.itemId}`);
				return;
			}
			const idx = getSelectedIndex();
			const item = filteredItems[idx];
			if (item && item.isActive) {
				navigateTo(`/app/shop/${item.itemId}`);
			}
		}
	});

	function getSelectedIndex(): number {
		if (activeTab === 'orders') return nav.row;
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
				const containerEl = activeTab === 'orders' ? ordersEl : gridEl;
				const selector = activeTab === 'orders' ? '.order-card' : '.item-card';
				const cards = containerEl?.querySelectorAll(selector) as NodeListOf<HTMLElement> | undefined;
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
		if (e.key === 'Escape') {
			navigateTo('/app?noanimate', { exitBack: true });
			return;
		}
		const navKeys = ['w', 'a', 's', 'd', 'W', 'A', 'S', 'D', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
		const isUp = (k: string) => k === 'w' || k === 'W' || k === 'ArrowUp';
		const isDown = (k: string) => k === 's' || k === 'S' || k === 'ArrowDown';
		const isLeft = (k: string) => k === 'a' || k === 'A' || k === 'ArrowLeft';
		const isRight = (k: string) => k === 'd' || k === 'D' || k === 'ArrowRight';
		const hasFilters = activeTab === 'shop' && filterButtons.length > 0;

		if (usingMouse && navKeys.includes(e.key)) {
			usingMouse = false;
			if (isUp(e.key)) {
				onTabs = true;
				onFilters = false;
				selectedTabIdx = TABS.indexOf(activeTab);
			} else {
				nav.col = 0;
				nav.row = 0;
				onTabs = false;
				onFilters = false;
			}
			e.preventDefault();
			interacted = true;
			return;
		}
		usingMouse = false;
		interacted = true;

		if (onTabs) {
			if (isLeft(e.key)) {
				e.preventDefault();
				selectedTabIdx = Math.max(0, selectedTabIdx - 1);
			} else if (isRight(e.key)) {
				e.preventDefault();
				selectedTabIdx = Math.min(TABS.length - 1, selectedTabIdx + 1);
			} else if (isDown(e.key)) {
				e.preventDefault();
				if (hasFilters) {
					onTabs = false;
					onFilters = true;
					selectedFilterIdx = defaultFilterIdx();
				} else if (getColumnsLayout().length > 0) {
					onTabs = false;
					nav.col = 0;
					nav.row = 0;
				}
			} else if (e.key === 'Enter') {
				e.preventDefault();
				setTab(TABS[selectedTabIdx]);
			}
			return;
		}

		if (onFilters) {
			if (isLeft(e.key)) {
				e.preventDefault();
				selectedFilterIdx = Math.max(0, selectedFilterIdx - 1);
			} else if (isRight(e.key)) {
				e.preventDefault();
				selectedFilterIdx = Math.min(filterButtons.length - 1, selectedFilterIdx + 1);
			} else if (isUp(e.key)) {
				e.preventDefault();
				onFilters = false;
				onTabs = true;
				selectedTabIdx = TABS.indexOf(activeTab);
			} else if (isDown(e.key)) {
				e.preventDefault();
				if (getColumnsLayout().length > 0) {
					onFilters = false;
					nav.col = 0;
					nav.row = 0;
				}
			} else if (e.key === 'Enter') {
				e.preventDefault();
				filterClick(filterButtons[selectedFilterIdx]);
			}
			return;
		}

		if (isUp(e.key) && nav.row === 0) {
			e.preventDefault();
			if (hasFilters) {
				onFilters = true;
				selectedFilterIdx = defaultFilterIdx();
			} else {
				onTabs = true;
				selectedTabIdx = TABS.indexOf(activeTab);
			}
			return;
		}

		nav.handleKeydown(e);
	}}
	onpointermove={() => {
		usingMouse = true;
	}}
/>

<div class="relative size-full overflow-y-auto" bind:this={scrollContainer} onscroll={() => { interacted = true; }}>
	<div class="info-card" class:exiting={navigating}>
		<!-- Tabs (right-aligned, sits just above the panel) -->
		<div class="flex gap-4 items-center w-full max-w-[932px] justify-end">
			{#each TABS as tab, i (tab)}
				{@const isActive = activeTab === tab}
				{@const inKbTabMode = onTabs && !usingMouse}
				{@const isKbSelected = inKbTabMode && selectedTabIdx === i}
				{@const showOrange = isKbSelected || (!inKbTabMode && isActive)}
				<button
					class="juice-btn font-bricolage font-semibold text-[24px] text-black border-4 border-black rounded-[20px] shadow-[4px_4px_0px_0px_black] py-2 px-4 cursor-pointer capitalize {showOrange ? 'bg-[#ffa936]' : 'bg-[#f3e8d8]'}"
					class:kb-selected={isKbSelected}
					onclick={() => { usingMouse = true; onTabs = false; setTab(tab); }}
					onmouseenter={() => { usingMouse = true; }}
				>
					{tab}
				</button>
			{/each}
		</div>

		{#if activeTab === 'shop'}
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

		<!-- Filters -->
		{#if filterButtons.length > 0}
			<div class="flex gap-2 flex-wrap w-full max-w-[932px] items-center">
				{#each filterButtons as btn, i (i)}
					{@const inKbFilterMode = onFilters && !usingMouse}
					{@const isFilterCursor = inKbFilterMode && selectedFilterIdx === i}
					{@const showOrange = isFilterCursor || (!inKbFilterMode && filterIsActive(btn))}
					{#if btn.type === 'category-all'}
						<span class="font-bricolage font-semibold text-sm text-black/60 mr-1">Categories:</span>
					{/if}
					{#if btn.type === 'region-all'}
						<span class="font-bricolage font-semibold text-sm text-black/60 mx-1">Region:</span>
					{/if}
					<button
						class="juice-btn font-bricolage font-semibold text-sm text-black border-3 border-black rounded-xl px-3 py-1.5 shadow-[2px_2px_0px_0px_black] cursor-pointer {btn.type === 'category' ? 'capitalize' : ''} {showOrange ? 'bg-[#ffa936]' : 'bg-[#f3e8d8]'}"
						class:kb-selected={isFilterCursor}
						onclick={() => { usingMouse = true; onFilters = false; filterClick(btn); }}
						onmouseenter={() => { usingMouse = true; }}
					>
						{filterLabel(btn)}
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
		{:else}
		<!-- Orders -->
		<div
			class="status-card border-4 border-black rounded-[20px] shadow-[4px_4px_0px_0px_black] flex items-center justify-center w-full max-w-[932px]"
			class:hidden={!ordersLoading && !ordersError && orders.length > 0}
			style="background-color: #f3e8d8; height: 240px;"
		>
			<p class="font-bricolage font-semibold text-[28px] text-black/50 m-0 text-center px-6">
				{#if ordersLoading}LOADING...{:else if ordersError}{ordersError}{:else}No orders yet — head back to the shop to spend some hours{/if}
			</p>
		</div>

		{#if !ordersLoading && !ordersError && orders.length > 0}
			<div class="flex flex-col gap-4 w-full max-w-[932px]" bind:this={ordersEl}>
				{#each orders as order, i (order.transactionId)}
					{@const selected = activeTab === 'orders' && i === nav.row}
					<button
						class="order-card border-4 border-black rounded-[20px] shadow-[4px_4px_0px_0px_black] overflow-hidden text-left outline-none flex items-center gap-8 p-[30px] w-full"
						class:selected
						class:exiting={navigating}
						style="--card-index: {i}; background-color: {selected && !usingMouse ? 'var(--selected-color)' : '#f3e8d8'}; transition: background-color var(--selected-duration) ease, transform var(--juice-duration) var(--juice-easing); cursor: pointer;"
						title={orderStatusLabel(order)}
						onfocus={() => { nav.col = 0; nav.row = i; }}
						onclick={(e) => {
							if (usingMouse) {
								(e.currentTarget as HTMLElement).style.transform = 'scale(1)';
								setTimeout(() => navigateTo(`/app/shop/${order.itemId}`), 200);
							} else {
								nav.col = 0;
								nav.row = i;
							}
						}}
						onmouseenter={(e) => (e.currentTarget as HTMLElement).style.transform = 'scale(var(--juice-scale))'}
						onmouseleave={(e) => (e.currentTarget as HTMLElement).style.transform = 'scale(1)'}
					>
						<div class="shrink-0 h-[88px] w-[110px] flex items-center justify-center overflow-hidden" style={order.refundedAt ? 'filter: grayscale(1); opacity: 0.6;' : ''}>
							{#if order.item.imageUrl}
								<img src={order.item.imageUrl} alt={order.item.name} class="max-w-full max-h-full object-contain" />
							{:else}
								<span class="font-bricolage text-2xl text-black/30">?</span>
							{/if}
						</div>
						<div class="flex-1 flex flex-col min-w-0">
							<p class="font-bricolage font-semibold text-[24px] text-black m-0 leading-normal truncate">
								{order.item.name}{order.variant ? ` — ${order.variant.name}` : ''}
							</p>
							<p class="font-bricolage font-semibold text-[24px] text-black m-0 leading-normal">
								{formatHours(order.cost)}
							</p>
						</div>
						<div class="shrink-0 flex flex-col items-end gap-1 self-stretch justify-between">
							<span class="font-bricolage text-[13px] font-bold text-black/60 uppercase tracking-wide">
								{orderStatusLabel(order)}
							</span>
							<span class="font-bricolage text-[13px] text-black/50">
								{formatDate(order.createdAt)}
							</span>
						</div>
					</button>
				{/each}
			</div>
		{/if}
		{/if}
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
		padding-top: 97px;
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
	.order-card {
		animation: item-enter var(--enter-duration) var(--enter-easing) backwards;
		animation-delay: calc(var(--card-index, 0) * 60ms + 150ms);
		cursor: pointer;
		transition: transform var(--juice-duration) var(--juice-easing), background-color var(--selected-duration) ease;
	}
	.order-card:hover {
		transform: scale(var(--juice-scale));
	}
	.order-card.exiting {
		animation: item-exit var(--exit-duration) var(--exit-easing) both;
	}

	.juice-btn {
		transition: transform var(--juice-duration) var(--juice-easing), background-color var(--selected-duration) ease;
	}
	.juice-btn:hover,
	.juice-btn.kb-selected {
		transform: scale(var(--juice-scale));
	}


	.fade-wrap.exiting {
		opacity: 0;
		transition: opacity 250ms ease;
	}
</style>
