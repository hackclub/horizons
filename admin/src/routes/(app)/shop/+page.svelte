<script lang="ts">
    import { onMount } from 'svelte';
    import { api, type components } from '$lib/api';

    type Shop = components['schemas']['ShopResponse'];
    type ShopItemVariant = components['schemas']['ShopItemVariantResponse'];
    type ShopItem = components['schemas']['ShopItemResponse'];
    type AdminTransaction = components['schemas']['AdminTransactionResponse'];

    // --- State ---
    let shopLoading = $state(false);
    let shopLoaded = $state(false);

    let shops = $state<Shop[]>([]);
    let selectedShopId = $state<number | null>(null);
    let shopItems = $state<ShopItem[]>([]);
    let shopTransactions = $state<AdminTransaction[]>([]);

    let showShopManager = $state(false);
    let shopForm = $state<{ slug: string; description: string; isActive: boolean; isPublic: boolean }>({
        slug: '',
        description: '',
        isActive: true,
        isPublic: true
    });
    let editingShopId = $state<number | null>(null);
    let shopFormSaving = $state(false);
    let shopFormError = $state('');
    let shopFormSuccess = $state('');

    let shopItemForm = $state<{
        name: string;
        description: string;
        imageUrl: string;
        cost: string;
        maxPerUser: string;
    }>({
        name: '',
        description: '',
        imageUrl: '',
        cost: '',
        maxPerUser: ''
    });
    let editingItemId = $state<number | null>(null);
    let shopItemSaving = $state(false);
    let shopItemError = $state('');
    let shopItemSuccess = $state('');
    let shopSubTab = $state<'items' | 'transactions' | 'transactions-by-user'>('items');
    let selectedItemFilter = $state<number | null>(null);
    let fulfillmentFilter = $state<'all' | 'fulfilled' | 'unfulfilled'>('all');

    let variantForm = $state<{ name: string; cost: string }>({
        name: '',
        cost: ''
    });
    let addingVariantToItemId = $state<number | null>(null);
    let editingVariantId = $state<number | null>(null);
    let variantSaving = $state(false);
    let variantError = $state('');
    let variantSuccess = $state('');
    let expandedItemVariants = $state<Record<number, boolean>>({});
    let refundingTransaction = $state<number | null>(null);
    let fulfillingTransaction = $state<number | null>(null);
    let unfulfillingTransaction = $state<number | null>(null);

    // --- Derived ---
    const filteredTransactions = $derived(() => {
        let transactions = shopTransactions;

        if (selectedItemFilter !== null) {
            transactions = transactions.filter((t) => t.itemId === selectedItemFilter);
        }

        if (fulfillmentFilter === 'fulfilled') {
            transactions = transactions.filter((t) => t.isFulfilled);
        } else if (fulfillmentFilter === 'unfulfilled') {
            transactions = transactions.filter((t) => !t.isFulfilled);
        }

        return transactions;
    });

    const transactionsByUser = $derived(() => {
        const grouped = new Map<
            number,
            {
                user: AdminTransaction['user'];
                transactions: AdminTransaction[];
                totalCost: number;
                fulfilledCount: number;
                pendingCount: number;
            }
        >();

        let transactionsToGroup = shopTransactions;

        if (selectedItemFilter !== null) {
            transactionsToGroup = transactionsToGroup.filter(
                (t) => t.itemId === selectedItemFilter
            );
        }

        if (fulfillmentFilter === 'fulfilled') {
            transactionsToGroup = transactionsToGroup.filter((t) => t.isFulfilled);
        } else if (fulfillmentFilter === 'unfulfilled') {
            transactionsToGroup = transactionsToGroup.filter((t) => !t.isFulfilled);
        }

        for (const transaction of transactionsToGroup) {
            if (!grouped.has(transaction.userId)) {
                grouped.set(transaction.userId, {
                    user: transaction.user,
                    transactions: [],
                    totalCost: 0,
                    fulfilledCount: 0,
                    pendingCount: 0
                });
            }
            const userGroup = grouped.get(transaction.userId)!;
            userGroup.transactions.push(transaction);
            userGroup.totalCost += transaction.cost;
            if (transaction.isFulfilled) {
                userGroup.fulfilledCount++;
            } else {
                userGroup.pendingCount++;
            }
        }

        return Array.from(grouped.values()).sort((a, b) => b.totalCost - a.totalCost);
    });

    // --- Helpers ---
    function formatDate(value: string) {
        return new Date(value).toLocaleString();
    }

    // --- API Functions ---
    async function loadShops() {
        try {
            const { data, error } = await api.GET('/api/shop/admin/shops');
            if (error) {
                console.error('Failed to load shops:', error);
                return;
            }
            if (data) {
                shops = data;
                if (shops.length > 0 && !selectedShopId) {
                    selectedShopId = shops[0].shopId;
                }
            }
        } catch (err) {
            console.error('Failed to load shops:', err);
        }
    }

    async function loadShopItems() {
        if (!selectedShopId) return;
        try {
            const { data, error } = await api.GET('/api/shop/admin/shops/{shopId}/items', {
                params: { path: { shopId: selectedShopId } }
            });
            if (error) {
                console.error('Failed to load shop items:', error);
                return;
            }
            if (data) {
                shopItems = data;
            }
        } catch (err) {
            console.error('Failed to load shop items:', err);
        }
    }

    async function loadShopTransactions() {
        try {
            const { data, error } = await api.GET('/api/shop/admin/transactions', {
                      params: { query: { shopId: selectedShopId ? String(selectedShopId) : undefined } }
                  });
            if (error) {
                console.error('Failed to load shop transactions:', error);
                return;
            }
            if (data) {
                shopTransactions = data;
            }
        } catch (err) {
            console.error('Failed to load shop transactions:', err);
        }
    }

    async function loadShopData() {
        shopLoading = true;
        try {
            await loadShops();
            if (selectedShopId) {
                await Promise.all([loadShopItems(), loadShopTransactions()]);
            }
            shopLoaded = true;
        } finally {
            shopLoading = false;
        }
    }

    async function onShopSelected(shopId: number) {
        selectedShopId = shopId;
        shopItems = [];
        shopTransactions = [];
        await Promise.all([loadShopItems(), loadShopTransactions()]);
    }

    function resetShopForm() {
        shopForm = { slug: '', description: '', isActive: true, isPublic: true };
        editingShopId = null;
        shopFormError = '';
        shopFormSuccess = '';
    }

    function startEditShop(shop: Shop) {
        editingShopId = shop.shopId;
        shopForm = {
            slug: shop.slug,
            description: shop.description || '',
            isActive: shop.isActive,
            isPublic: shop.isPublic
        };
        shopFormError = '';
        shopFormSuccess = '';
    }

    async function saveShop() {
        shopFormSaving = true;
        shopFormError = '';
        shopFormSuccess = '';

        const payload = {
            slug: shopForm.slug,
            description: shopForm.description || undefined,
            isActive: shopForm.isActive,
            isPublic: shopForm.isPublic
        };

        try {
            if (editingShopId) {
                const { error } = await api.PUT('/api/shop/admin/shops/{shopId}', {
                    params: { path: { shopId: editingShopId } },
                    body: payload
                });
                if (error) {
                    shopFormError = (error as any)?.message ?? 'Failed to save shop';
                    return;
                }
            } else {
                const { error } = await api.POST('/api/shop/admin/shops', {
                    body: payload
                });
                if (error) {
                    shopFormError = (error as any)?.message ?? 'Failed to save shop';
                    return;
                }
            }

            shopFormSuccess = editingShopId ? 'Shop updated successfully' : 'Shop created successfully';
            resetShopForm();
            await loadShops();
        } catch (err) {
            shopFormError = err instanceof Error ? err.message : 'Failed to save shop';
        } finally {
            shopFormSaving = false;
        }
    }

    async function deleteShop(shopId: number) {
        const confirmDelete =
            typeof window !== 'undefined'
                ? window.confirm('Delete this shop and ALL its items? This cannot be undone.')
                : true;
        if (!confirmDelete) return;

        try {
            const { error } = await api.DELETE('/api/shop/admin/shops/{shopId}', {
                params: { path: { shopId } }
            });
            if (error) {
                console.error('Failed to delete shop:', error);
                return;
            }
            if (selectedShopId === shopId) {
                selectedShopId = null;
                shopItems = [];
                shopTransactions = [];
            }
            await loadShops();
            if (shops.length > 0 && !selectedShopId) {
                selectedShopId = shops[0].shopId;
                await Promise.all([loadShopItems(), loadShopTransactions()]);
            }
        } catch (err) {
            console.error('Failed to delete shop:', err);
        }
    }

    function resetItemForm() {
        shopItemForm = {
            name: '',
            description: '',
            imageUrl: '',
            cost: '',
            maxPerUser: ''
        };
        editingItemId = null;
        shopItemError = '';
        shopItemSuccess = '';
    }

    function startEditItem(item: ShopItem) {
        editingItemId = item.itemId;
        shopItemForm = {
            name: item.name,
            description: item.description || '',
            imageUrl: item.imageUrl || '',
            cost: item.cost.toString(),
            maxPerUser: item.maxPerUser?.toString() || ''
        };
        shopItemError = '';
        shopItemSuccess = '';
    }

    async function saveShopItem() {
        shopItemSaving = true;
        shopItemError = '';
        shopItemSuccess = '';

        const payload = {
            name: shopItemForm.name,
            description: shopItemForm.description || undefined,
            imageUrl: shopItemForm.imageUrl || undefined,
            cost: parseFloat(shopItemForm.cost),
            maxPerUser: shopItemForm.maxPerUser ? parseInt(shopItemForm.maxPerUser) : undefined
        };

        try {
            if (editingItemId) {
                const { error } = await api.PUT('/api/shop/admin/items/{id}', {
                    params: { path: { id: editingItemId } },
                    body: payload
                });
                if (error) {
                    shopItemError = (error as any)?.message ?? 'Failed to save item';
                    return;
                }
            } else {
                if (!selectedShopId) return;
                const { error } = await api.POST('/api/shop/admin/shops/{shopId}/items', {
                    params: { path: { shopId: selectedShopId } },
                    body: payload
                });
                if (error) {
                    shopItemError = (error as any)?.message ?? 'Failed to save item';
                    return;
                }
            }

            shopItemSuccess = editingItemId ? 'Item updated successfully' : 'Item created successfully';
            resetItemForm();
            await loadShopItems();
        } catch (err) {
            shopItemError = err instanceof Error ? err.message : 'Failed to save item';
        } finally {
            shopItemSaving = false;
        }
    }

    async function toggleItemActive(item: ShopItem) {
        try {
            const { error } = await api.PUT('/api/shop/admin/items/{id}', {
                params: { path: { id: item.itemId } },
                body: { isActive: !item.isActive }
            });
            if (error) {
                console.error('Failed to toggle item:', error);
                return;
            }
            await loadShopItems();
        } catch (err) {
            console.error('Failed to toggle item:', err);
        }
    }

    async function deleteShopItem(itemId: number) {
        const confirmDelete =
            typeof window !== 'undefined'
                ? window.confirm('Delete this shop item? This cannot be undone.')
                : true;
        if (!confirmDelete) return;

        try {
            const { error } = await api.DELETE('/api/shop/admin/items/{id}', {
                params: { path: { id: itemId } }
            });
            if (error) {
                console.error('Failed to delete item:', error);
                return;
            }
            await loadShopItems();
        } catch (err) {
            console.error('Failed to delete item:', err);
        }
    }

    function resetVariantForm() {
        variantForm = { name: '', cost: '' };
        addingVariantToItemId = null;
        editingVariantId = null;
        variantError = '';
        variantSuccess = '';
    }

    function startAddVariant(itemId: number) {
        resetVariantForm();
        addingVariantToItemId = itemId;
        expandedItemVariants[itemId] = true;
    }

    function startEditVariant(variant: ShopItemVariant) {
        variantForm = { name: variant.name, cost: variant.cost.toString() };
        editingVariantId = variant.variantId;
        addingVariantToItemId = variant.itemId;
        variantError = '';
        variantSuccess = '';
    }

    async function saveVariant() {
        if (!addingVariantToItemId) return;

        variantSaving = true;
        variantError = '';
        variantSuccess = '';

        const payload = {
            name: variantForm.name,
            cost: parseFloat(variantForm.cost)
        };

        try {
            if (editingVariantId) {
                const { error } = await api.PUT('/api/shop/admin/variants/{id}', {
                    params: { path: { id: editingVariantId } },
                    body: payload
                });
                if (error) {
                    variantError = (error as any)?.message ?? 'Failed to save variant';
                    return;
                }
            } else {
                const { error } = await api.POST('/api/shop/admin/items/{id}/variants', {
                    params: { path: { id: addingVariantToItemId } },
                    body: payload
                });
                if (error) {
                    variantError = (error as any)?.message ?? 'Failed to save variant';
                    return;
                }
            }

            variantSuccess = editingVariantId ? 'Variant updated' : 'Variant created';
            resetVariantForm();
            await loadShopItems();
        } catch (err) {
            variantError = err instanceof Error ? err.message : 'Failed to save variant';
        } finally {
            variantSaving = false;
        }
    }

    async function toggleVariantActive(variant: ShopItemVariant) {
        try {
            const { error } = await api.PUT('/api/shop/admin/variants/{id}', {
                params: { path: { id: variant.variantId } },
                body: { isActive: !variant.isActive }
            });
            if (error) {
                console.error('Failed to toggle variant:', error);
                return;
            }
            await loadShopItems();
        } catch (err) {
            console.error('Failed to toggle variant:', err);
        }
    }

    async function deleteVariant(variantId: number) {
        const confirmDelete =
            typeof window !== 'undefined'
                ? window.confirm('Delete this variant? This cannot be undone.')
                : true;
        if (!confirmDelete) return;

        try {
            const { error } = await api.DELETE('/api/shop/admin/variants/{id}', {
                params: { path: { id: variantId } }
            });
            if (error) {
                console.error('Failed to delete variant:', error);
                return;
            }
            await loadShopItems();
        } catch (err) {
            console.error('Failed to delete variant:', err);
        }
    }

    async function handleRefundTransaction(transactionId: number) {
        const confirmRefund =
            typeof window !== 'undefined'
                ? window.confirm('Refund this transaction? The hours will be returned to the user.')
                : true;
        if (!confirmRefund) return;

        refundingTransaction = transactionId;
        try {
            const { error } = await api.DELETE('/api/shop/admin/transactions/{id}', {
                params: { path: { id: transactionId } }
            });
            if (error) {
                console.error('Failed to refund transaction:', error);
                return;
            }
            shopTransactions = shopTransactions.filter((t) => t.transactionId !== transactionId);
        } catch (err) {
            console.error('Failed to refund transaction:', err);
        } finally {
            refundingTransaction = null;
        }
    }

    async function handleMarkFulfilled(transactionId: number) {
        const confirmFulfill =
            typeof window !== 'undefined'
                ? window.confirm('Mark this transaction as fulfilled?')
                : true;
        if (!confirmFulfill) return;

        fulfillingTransaction = transactionId;
        try {
            const { data, error } = await api.PUT('/api/shop/admin/transactions/{id}/fulfill', {
                params: { path: { id: transactionId } }
            });
            if (error) {
                console.error('Failed to mark transaction as fulfilled:', error);
                return;
            }
            if (data) {
                shopTransactions = shopTransactions.map((t) =>
                    t.transactionId === transactionId ? data : t
                );
            }
        } catch (err) {
            console.error('Failed to mark transaction as fulfilled:', err);
        } finally {
            fulfillingTransaction = null;
        }
    }

    async function handleUnfulfillTransaction(transactionId: number) {
        const confirmUnfulfill =
            typeof window !== 'undefined'
                ? window.confirm('Remove fulfilled status from this transaction?')
                : true;
        if (!confirmUnfulfill) return;

        unfulfillingTransaction = transactionId;
        try {
            const { data, error } = await api.DELETE('/api/shop/admin/transactions/{id}/fulfill', {
                params: { path: { id: transactionId } }
            });
            if (error) {
                console.error('Failed to unfulfill transaction:', error);
                return;
            }
            if (data) {
                shopTransactions = shopTransactions.map((t) =>
                    t.transactionId === transactionId ? data : t
                );
            }
        } catch (err) {
            console.error('Failed to unfulfill transaction:', err);
        } finally {
            unfulfillingTransaction = null;
        }
    }

    onMount(() => {
        loadShopData();
    });
</script>

<section class="space-y-4">
    <div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <h2 class="text-2xl font-semibold">Shop Management</h2>
        <div class="flex items-center gap-2">
            {#if shops.length > 0}
                <select
                    class="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                    value={selectedShopId}
                    onchange={(e) => {
                        const val = parseInt((e.target as HTMLSelectElement).value, 10);
                        if (val) onShopSelected(val);
                    }}
                >
                    {#each shops as shop (shop.shopId)}
                        <option value={shop.shopId}>
                            {shop.slug}
                            {!shop.isActive ? ' (inactive)' : ''}
                            {!shop.isPublic ? ' (hidden)' : ''}
                        </option>
                    {/each}
                </select>
            {/if}
            <button
                class={`px-4 py-2 rounded-lg border transition-colors ${showShopManager ? 'bg-yellow-600 border-yellow-400' : 'bg-gray-800 border-gray-700 hover:bg-gray-700'}`}
                onclick={() => (showShopManager = !showShopManager)}
            >
                Manage Shops
            </button>
        </div>
    </div>

    {#if showShopManager}
        <div class="rounded-2xl border border-gray-700 bg-gray-900/70 backdrop-blur p-6 space-y-6">
            <h3 class="text-lg font-semibold">
                {editingShopId ? 'Edit Shop' : 'Create New Shop'}
            </h3>
            <div class="grid gap-4 md:grid-cols-2">
                <div class="space-y-2">
                    <label class="text-sm font-medium text-gray-300" for="shop-slug">Slug *</label>
                    <input
                        id="shop-slug"
                        type="text"
                        class="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                        placeholder="my-shop"
                        bind:value={shopForm.slug}
                    />
                </div>
                <div class="space-y-2">
                    <label class="text-sm font-medium text-gray-300" for="shop-description"
                        >Description</label
                    >
                    <input
                        id="shop-description"
                        type="text"
                        class="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                        placeholder="Shop description..."
                        bind:value={shopForm.description}
                    />
                </div>
                <div class="flex items-center gap-4">
                    <label class="flex items-center gap-2 text-sm text-gray-300">
                        <input type="checkbox" bind:checked={shopForm.isActive} class="rounded" />
                        Active
                    </label>
                    <label class="flex items-center gap-2 text-sm text-gray-300">
                        <input type="checkbox" bind:checked={shopForm.isPublic} class="rounded" />
                        Public
                    </label>
                </div>
            </div>

            <div class="flex flex-wrap gap-3 items-center">
                <button
                    class="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 transition-colors disabled:bg-gray-700 disabled:cursor-not-allowed"
                    onclick={saveShop}
                    disabled={shopFormSaving || !shopForm.slug}
                >
                    {shopFormSaving ? 'Saving...' : editingShopId ? 'Update Shop' : 'Create Shop'}
                </button>
                {#if editingShopId}
                    <button
                        class="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 transition-colors"
                        onclick={resetShopForm}
                    >
                        Cancel Edit
                    </button>
                {/if}
                {#if shopFormError}
                    <span class="text-red-400 text-sm">{shopFormError}</span>
                {/if}
                {#if shopFormSuccess}
                    <span class="text-green-400 text-sm">{shopFormSuccess}</span>
                {/if}
            </div>

            {#if shops.length > 0}
                <div class="space-y-2">
                    {#each shops as shop (shop.shopId)}
                        <div
                            class="flex items-center justify-between rounded-lg border border-gray-700 bg-gray-800 px-4 py-3"
                        >
                            <div class="flex items-center gap-3">
                                <span class="font-medium">{shop.slug}</span>
                                {#if shop.description}
                                    <span class="text-sm text-gray-400">{shop.description}</span>
                                {/if}
                                {#if !shop.isActive}
                                    <span
                                        class="px-2 py-0.5 text-xs bg-red-900/50 text-red-400 rounded"
                                        >Inactive</span
                                    >
                                {/if}
                                {#if !shop.isPublic}
                                    <span
                                        class="px-2 py-0.5 text-xs bg-yellow-900/50 text-yellow-400 rounded"
                                        >Hidden</span
                                    >
                                {/if}
                            </div>
                            <div class="flex gap-2">
                                <button
                                    class="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-500 rounded transition-colors"
                                    onclick={() => startEditShop(shop)}
                                >
                                    Edit
                                </button>
                                <button
                                    class="px-3 py-1 text-xs bg-red-600 hover:bg-red-500 rounded transition-colors"
                                    onclick={() => deleteShop(shop.shopId)}
                                >
                                    Delete
                                </button>
                            </div>
                        </div>
                    {/each}
                </div>
            {/if}
        </div>
    {/if}

    {#if !selectedShopId && shops.length === 0}
        <div class="py-12 text-center text-gray-300">
            No shops yet. Create one using "Manage Shops" above.
        </div>
    {:else if !selectedShopId}
        <div class="py-12 text-center text-gray-300">
            Select a shop above to manage its items and transactions.
        </div>
    {:else}
        <div class="flex gap-2">
            <button
                class={`px-4 py-2 rounded-lg border transition-colors ${shopSubTab === 'items' ? 'bg-purple-600 border-purple-400' : 'bg-gray-800 border-gray-700 hover:bg-gray-700'}`}
                onclick={() => (shopSubTab = 'items')}
            >
                Items ({shopItems.length})
            </button>
            <button
                class={`px-4 py-2 rounded-lg border transition-colors ${shopSubTab === 'transactions' ? 'bg-purple-600 border-purple-400' : 'bg-gray-800 border-gray-700 hover:bg-gray-700'}`}
                onclick={() => (shopSubTab = 'transactions')}
            >
                Transactions ({shopTransactions.length})
            </button>
            <button
                class={`px-4 py-2 rounded-lg border transition-colors ${shopSubTab === 'transactions-by-user' ? 'bg-purple-600 border-purple-400' : 'bg-gray-800 border-gray-700 hover:bg-gray-700'}`}
                onclick={() => (shopSubTab = 'transactions-by-user')}
            >
                By User
            </button>
            <button
                class="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg border border-gray-700 transition-colors"
                onclick={loadShopData}
            >
                Refresh
            </button>
        </div>

        {#if shopLoading}
            <div class="py-12 text-center text-gray-300">Loading shop data...</div>
        {:else if shopSubTab === 'items'}
            <div
                class="rounded-2xl border border-gray-700 bg-gray-900/70 backdrop-blur p-6 space-y-6"
            >
                <h3 class="text-lg font-semibold">
                    {editingItemId ? 'Edit Item' : 'Create New Item'}
                </h3>

                <div class="grid gap-4 md:grid-cols-2">
                    <div class="space-y-2">
                        <label class="text-sm font-medium text-gray-300" for="item-name"
                            >Name *</label
                        >
                        <input
                            id="item-name"
                            type="text"
                            class="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                            placeholder="Item name"
                            bind:value={shopItemForm.name}
                        />
                    </div>
                    <div class="space-y-2">
                        <label class="text-sm font-medium text-gray-300" for="item-cost"
                            >Cost (hours) *</label
                        >
                        <input
                            id="item-cost"
                            type="number"
                            step="0.1"
                            min="0"
                            class="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                            placeholder="0"
                            bind:value={shopItemForm.cost}
                        />
                    </div>
                    <div class="space-y-2">
                        <label class="text-sm font-medium text-gray-300" for="item-max-per-user"
                            >Max per User</label
                        >
                        <input
                            id="item-max-per-user"
                            type="number"
                            step="1"
                            min="1"
                            class="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                            placeholder="Unlimited"
                            bind:value={shopItemForm.maxPerUser}
                        />
                    </div>
                    <div class="space-y-2">
                        <label class="text-sm font-medium text-gray-300" for="item-image"
                            >Image URL</label
                        >
                        <input
                            id="item-image"
                            type="text"
                            class="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                            placeholder="https://..."
                            bind:value={shopItemForm.imageUrl}
                        />
                    </div>
                    <div class="space-y-2">
                        <label class="text-sm font-medium text-gray-300" for="item-description"
                            >Description</label
                        >
                        <textarea
                            id="item-description"
                            class="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                            rows="2"
                            placeholder="Item description..."
                            bind:value={shopItemForm.description}
                        ></textarea>
                    </div>
                </div>

                <div class="flex flex-wrap gap-3 items-center">
                    <button
                        class="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 transition-colors disabled:bg-gray-700 disabled:cursor-not-allowed"
                        onclick={saveShopItem}
                        disabled={shopItemSaving || !shopItemForm.name || !shopItemForm.cost}
                    >
                        {shopItemSaving
                            ? 'Saving...'
                            : editingItemId
                              ? 'Update Item'
                              : 'Create Item'}
                    </button>
                    {#if editingItemId}
                        <button
                            class="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 transition-colors"
                            onclick={resetItemForm}
                        >
                            Cancel Edit
                        </button>
                    {/if}
                    {#if shopItemError}
                        <span class="text-red-400 text-sm">{shopItemError}</span>
                    {/if}
                    {#if shopItemSuccess}
                        <span class="text-green-400 text-sm">{shopItemSuccess}</span>
                    {/if}
                </div>
            </div>

            {#if shopItems.length === 0}
                <div class="py-12 text-center text-gray-300">
                    No shop items yet. Create one above!
                </div>
            {:else}
                <div class="grid gap-4">
                    {#each shopItems as item (item.itemId)}
                        <div
                            class="rounded-2xl border border-gray-700 bg-gray-900/70 backdrop-blur p-6 space-y-4"
                        >
                            <div
                                class="flex flex-col gap-4 md:flex-row md:items-start md:justify-between"
                            >
                                <div class="flex gap-4">
                                    {#if item.imageUrl}
                                        <img
                                            src={item.imageUrl}
                                            alt={item.name}
                                            class="w-20 h-20 object-cover rounded-lg border border-gray-700"
                                        />
                                    {:else}
                                        <div
                                            class="w-20 h-20 bg-gray-800 rounded-lg border border-gray-700 flex items-center justify-center text-2xl"
                                        >
                                            🛍️
                                        </div>
                                    {/if}
                                    <div>
                                        <h3 class="text-xl font-semibold flex items-center gap-2">
                                            {item.name}
                                            {#if !item.isActive}
                                                <span
                                                    class="px-2 py-0.5 text-xs rounded bg-red-500/20 border border-red-400 text-red-300"
                                                    >Inactive</span
                                                >
                                            {/if}
                                            {#if item.maxPerUser}
                                                <span
                                                    class="px-2 py-0.5 text-xs rounded bg-orange-500/20 border border-orange-400 text-orange-300"
                                                    >Max {item.maxPerUser}/user</span
                                                >
                                            {/if}
                                            {#if item.variants && item.variants.length > 0}
                                                <span
                                                    class="px-2 py-0.5 text-xs rounded bg-blue-500/20 border border-blue-400 text-blue-300"
                                                    >{item.variants.length} variant{item.variants
                                                        .length > 1
                                                        ? 's'
                                                        : ''}</span
                                                >
                                            {/if}
                                        </h3>
                                        <p class="text-sm text-purple-300 font-semibold">
                                            {item.cost} hours {item.variants &&
                                            item.variants.length > 0
                                                ? '(base)'
                                                : ''}
                                        </p>
                                        {#if item.description}
                                            <p class="text-sm text-gray-400 mt-1">
                                                {item.description}
                                            </p>
                                        {/if}
                                        <p class="text-xs text-gray-500 mt-2">
                                            Updated {formatDate(item.updatedAt)}
                                        </p>
                                    </div>
                                </div>
                                <div class="flex flex-wrap gap-2">
                                    <button
                                        class="px-3 py-1.5 rounded-lg bg-blue-600/20 border border-blue-500 text-blue-300 hover:bg-blue-600/30 text-sm transition-colors"
                                        onclick={() => {
                                            expandedItemVariants[item.itemId] =
                                                !expandedItemVariants[item.itemId];
                                        }}
                                    >
                                        {expandedItemVariants[item.itemId] ? 'Hide' : 'Show'} Variants
                                    </button>
                                    <button
                                        class="px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-700 text-sm transition-colors"
                                        onclick={() => startEditItem(item)}
                                    >
                                        Edit
                                    </button>
                                    <button
                                        class={`px-3 py-1.5 rounded-lg border text-sm transition-colors ${item.isActive ? 'bg-yellow-600/20 border-yellow-500 text-yellow-300 hover:bg-yellow-600/30' : 'bg-green-600/20 border-green-500 text-green-300 hover:bg-green-600/30'}`}
                                        onclick={() => toggleItemActive(item)}
                                    >
                                        {item.isActive ? 'Deactivate' : 'Activate'}
                                    </button>
                                    <button
                                        class="px-3 py-1.5 rounded-lg bg-red-600/20 border border-red-500 text-red-300 hover:bg-red-600/30 text-sm transition-colors"
                                        onclick={() => deleteShopItem(item.itemId)}
                                    >
                                        Delete
                                    </button>
                                </div>
                            </div>

                            {#if expandedItemVariants[item.itemId]}
                                <div class="border-t border-gray-700 pt-4 space-y-3">
                                    <div class="flex items-center justify-between">
                                        <h4 class="text-sm font-semibold text-gray-300">
                                            Variants
                                        </h4>
                                        <button
                                            class="px-3 py-1 rounded-lg bg-purple-600 hover:bg-purple-500 text-sm transition-colors"
                                            onclick={() => startAddVariant(item.itemId)}
                                        >
                                            + Add Variant
                                        </button>
                                    </div>

                                    {#if addingVariantToItemId === item.itemId}
                                        <div class="bg-gray-800/50 rounded-lg p-4 space-y-3">
                                            <div class="grid gap-3 md:grid-cols-3">
                                                <div>
                                                    <label class="text-xs text-gray-400"
                                                        >Variant Name *</label
                                                    >
                                                    <input
                                                        type="text"
                                                        class="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                                                        placeholder="e.g., XL, $200"
                                                        bind:value={variantForm.name}
                                                    />
                                                </div>
                                                <div>
                                                    <label class="text-xs text-gray-400"
                                                        >Cost (hours) *</label
                                                    >
                                                    <input
                                                        type="number"
                                                        step="0.1"
                                                        min="0"
                                                        class="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                                                        bind:value={variantForm.cost}
                                                    />
                                                </div>
                                                <div class="flex items-end gap-2">
                                                    <button
                                                        class="px-3 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-sm transition-colors disabled:bg-gray-700 disabled:cursor-not-allowed"
                                                        onclick={saveVariant}
                                                        disabled={variantSaving ||
                                                            !variantForm.name ||
                                                            !variantForm.cost}
                                                    >
                                                        {variantSaving
                                                            ? 'Saving...'
                                                            : editingVariantId
                                                              ? 'Update'
                                                              : 'Add'}
                                                    </button>
                                                    <button
                                                        class="px-3 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-sm transition-colors"
                                                        onclick={resetVariantForm}
                                                    >
                                                        Cancel
                                                    </button>
                                                </div>
                                            </div>
                                            {#if variantError}
                                                <p class="text-red-400 text-xs">
                                                    {variantError}
                                                </p>
                                            {/if}
                                            {#if variantSuccess}
                                                <p class="text-green-400 text-xs">
                                                    {variantSuccess}
                                                </p>
                                            {/if}
                                        </div>
                                    {/if}

                                    {#if item.variants && item.variants.length > 0}
                                        <div class="space-y-2">
                                            {#each item.variants as variant (variant.variantId)}
                                                <div
                                                    class="flex items-center justify-between bg-gray-800/30 rounded-lg px-4 py-2"
                                                >
                                                    <div class="flex items-center gap-3">
                                                        <span class="font-medium text-white"
                                                            >{variant.name}</span
                                                        >
                                                        <span class="text-purple-300 text-sm"
                                                            >{variant.cost} hours</span
                                                        >
                                                        {#if !variant.isActive}
                                                            <span
                                                                class="px-2 py-0.5 text-xs rounded bg-red-500/20 border border-red-400 text-red-300"
                                                                >Inactive</span
                                                            >
                                                        {/if}
                                                    </div>
                                                    <div class="flex gap-2">
                                                        <button
                                                            class="px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-xs transition-colors"
                                                            onclick={() =>
                                                                startEditVariant(variant)}
                                                        >
                                                            Edit
                                                        </button>
                                                        <button
                                                            class={`px-2 py-1 rounded text-xs transition-colors ${variant.isActive ? 'bg-yellow-600/20 text-yellow-300 hover:bg-yellow-600/30' : 'bg-green-600/20 text-green-300 hover:bg-green-600/30'}`}
                                                            onclick={() =>
                                                                toggleVariantActive(variant)}
                                                        >
                                                            {variant.isActive
                                                                ? 'Deactivate'
                                                                : 'Activate'}
                                                        </button>
                                                        <button
                                                            class="px-2 py-1 rounded bg-red-600/20 text-red-300 hover:bg-red-600/30 text-xs transition-colors"
                                                            onclick={() =>
                                                                deleteVariant(variant.variantId)}
                                                        >
                                                            Delete
                                                        </button>
                                                    </div>
                                                </div>
                                            {/each}
                                        </div>
                                    {:else}
                                        <p class="text-gray-500 text-sm">
                                            No variants yet. Add one to offer different options.
                                        </p>
                                    {/if}
                                </div>
                            {/if}
                        </div>
                    {/each}
                </div>
            {/if}
        {:else if shopSubTab === 'transactions'}
            {#if shopTransactions.length === 0}
                <div class="py-12 text-center text-gray-300">No transactions yet.</div>
            {:else}
                <div class="mb-4 flex items-center gap-3">
                    <label class="text-sm font-medium text-gray-300">Filter by Item:</label>
                    <select
                        class="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                        bind:value={selectedItemFilter}
                    >
                        <option value={null}>All Items</option>
                        {#each shopItems as item (item.itemId)}
                            <option value={item.itemId}>{item.name}</option>
                        {/each}
                    </select>
                    <label class="text-sm font-medium text-gray-300">Status:</label>
                    <div class="flex gap-2">
                        <button
                            class={`px-3 py-1.5 rounded-lg border text-sm transition-colors ${fulfillmentFilter === 'all' ? 'bg-purple-600 border-purple-400 text-white' : 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700'}`}
                            onclick={() => (fulfillmentFilter = 'all')}
                        >
                            All
                        </button>
                        <button
                            class={`px-3 py-1.5 rounded-lg border text-sm transition-colors ${fulfillmentFilter === 'fulfilled' ? 'bg-green-600 border-green-400 text-white' : 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700'}`}
                            onclick={() => (fulfillmentFilter = 'fulfilled')}
                        >
                            Fulfilled
                        </button>
                        <button
                            class={`px-3 py-1.5 rounded-lg border text-sm transition-colors ${fulfillmentFilter === 'unfulfilled' ? 'bg-yellow-600 border-yellow-400 text-white' : 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700'}`}
                            onclick={() => (fulfillmentFilter = 'unfulfilled')}
                        >
                            Unfulfilled
                        </button>
                    </div>
                </div>
                <div
                    class="rounded-2xl border border-gray-700 bg-gray-900/70 backdrop-blur overflow-hidden"
                >
                    <table class="w-full">
                        <thead class="bg-gray-800/50">
                            <tr>
                                <th
                                    class="px-4 py-3 text-left text-sm font-semibold text-gray-300"
                                    >Date</th
                                >
                                <th
                                    class="px-4 py-3 text-left text-sm font-semibold text-gray-300"
                                    >User</th
                                >
                                <th
                                    class="px-4 py-3 text-left text-sm font-semibold text-gray-300"
                                    >Item</th
                                >
                                <th
                                    class="px-4 py-3 text-left text-sm font-semibold text-gray-300"
                                    >Cost</th
                                >
                                <th
                                    class="px-4 py-3 text-left text-sm font-semibold text-gray-300"
                                    >Status</th
                                >
                                <th
                                    class="px-4 py-3 text-left text-sm font-semibold text-gray-300"
                                    >Actions</th
                                >
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-gray-700">
                            {#each filteredTransactions() as transaction (transaction.transactionId)}
                                <tr class="hover:bg-gray-800/30">
                                    <td class="px-4 py-3 text-sm text-gray-300"
                                        >{formatDate(transaction.createdAt)}</td
                                    >
                                    <td class="px-4 py-3">
                                        <p class="text-sm font-medium text-white">
                                            {transaction.user.firstName}
                                            {transaction.user.lastName}
                                        </p>
                                        <p class="text-xs text-gray-400">
                                            {transaction.user.email}
                                        </p>
                                        {#if transaction.user.addressLine1 || transaction.user.city || transaction.user.state}
                                            <div class="text-xs text-gray-500 mt-1">
                                                {#if transaction.user.addressLine1}
                                                    <p>{transaction.user.addressLine1}</p>
                                                {/if}
                                                {#if transaction.user.addressLine2}
                                                    <p>{transaction.user.addressLine2}</p>
                                                {/if}
                                                <p>
                                                    {[
                                                        transaction.user.city,
                                                        transaction.user.state,
                                                        transaction.user.zipCode
                                                    ]
                                                        .filter(Boolean)
                                                        .join(', ')}
                                                </p>
                                                {#if transaction.user.country}
                                                    <p>{transaction.user.country}</p>
                                                {/if}
                                            </div>
                                        {/if}
                                    </td>
                                    <td class="px-4 py-3">
                                        <p class="text-sm font-medium text-white">
                                            {transaction.item.name}
                                            {#if transaction.variant}
                                                <span class="text-blue-300">
                                                    ({transaction.variant.name})</span
                                                >
                                            {/if}
                                        </p>
                                    </td>
                                    <td
                                        class="px-4 py-3 text-sm font-semibold text-purple-300"
                                        >{transaction.cost} hours</td
                                    >
                                    <td class="px-4 py-3">
                                        {#if transaction.isFulfilled}
                                            <div class="flex flex-col gap-1">
                                                <span
                                                    class="px-2 py-1 text-xs rounded bg-green-500/20 border border-green-400 text-green-300 w-fit"
                                                    >Fulfilled</span
                                                >
                                                {#if transaction.fulfilledAt}
                                                    <span class="text-xs text-gray-500"
                                                        >{formatDate(
                                                            transaction.fulfilledAt
                                                        )}</span
                                                    >
                                                {/if}
                                            </div>
                                        {:else}
                                            <span
                                                class="px-2 py-1 text-xs rounded bg-yellow-500/20 border border-yellow-400 text-yellow-300"
                                                >Pending</span
                                            >
                                        {/if}
                                    </td>
                                    <td class="px-4 py-3">
                                        <div class="flex gap-2">
                                            {#if transaction.isFulfilled}
                                                <button
                                                    class="px-3 py-1.5 rounded-lg bg-yellow-600/20 border border-yellow-500 text-yellow-300 hover:bg-yellow-600/30 text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                    onclick={() =>
                                                        handleUnfulfillTransaction(
                                                            transaction.transactionId
                                                        )}
                                                    disabled={unfulfillingTransaction ===
                                                        transaction.transactionId}
                                                >
                                                    {unfulfillingTransaction ===
                                                    transaction.transactionId
                                                        ? 'Removing...'
                                                        : 'Unfulfill'}
                                                </button>
                                            {:else}
                                                <button
                                                    class="px-3 py-1.5 rounded-lg bg-green-600/20 border border-green-500 text-green-300 hover:bg-green-600/30 text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                    onclick={() =>
                                                        handleMarkFulfilled(
                                                            transaction.transactionId
                                                        )}
                                                    disabled={fulfillingTransaction ===
                                                        transaction.transactionId}
                                                >
                                                    {fulfillingTransaction ===
                                                    transaction.transactionId
                                                        ? 'Marking...'
                                                        : 'Mark Fulfilled'}
                                                </button>
                                            {/if}
                                            <button
                                                class="px-3 py-1.5 rounded-lg bg-red-600/20 border border-red-500 text-red-300 hover:bg-red-600/30 text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                onclick={() =>
                                                    handleRefundTransaction(
                                                        transaction.transactionId
                                                    )}
                                                disabled={refundingTransaction ===
                                                    transaction.transactionId}
                                            >
                                                {refundingTransaction ===
                                                transaction.transactionId
                                                    ? 'Refunding...'
                                                    : 'Refund'}
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            {/each}
                        </tbody>
                    </table>
                </div>
            {/if}
        {:else if shopSubTab === 'transactions-by-user'}
            {#if shopTransactions.length === 0}
                <div class="py-12 text-center text-gray-300">No transactions yet.</div>
            {:else}
                <div class="mb-4 flex items-center gap-3">
                    <label class="text-sm font-medium text-gray-300">Filter by Item:</label>
                    <select
                        class="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                        bind:value={selectedItemFilter}
                    >
                        <option value={null}>All Items</option>
                        {#each shopItems as item (item.itemId)}
                            <option value={item.itemId}>{item.name}</option>
                        {/each}
                    </select>
                    <label class="text-sm font-medium text-gray-300">Status:</label>
                    <div class="flex gap-2">
                        <button
                            class={`px-3 py-1.5 rounded-lg border text-sm transition-colors ${fulfillmentFilter === 'all' ? 'bg-purple-600 border-purple-400 text-white' : 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700'}`}
                            onclick={() => (fulfillmentFilter = 'all')}
                        >
                            All
                        </button>
                        <button
                            class={`px-3 py-1.5 rounded-lg border text-sm transition-colors ${fulfillmentFilter === 'fulfilled' ? 'bg-green-600 border-green-400 text-white' : 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700'}`}
                            onclick={() => (fulfillmentFilter = 'fulfilled')}
                        >
                            Fulfilled
                        </button>
                        <button
                            class={`px-3 py-1.5 rounded-lg border text-sm transition-colors ${fulfillmentFilter === 'unfulfilled' ? 'bg-yellow-600 border-yellow-400 text-white' : 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700'}`}
                            onclick={() => (fulfillmentFilter = 'unfulfilled')}
                        >
                            Unfulfilled
                        </button>
                    </div>
                </div>
                <div class="space-y-4">
                    {#each transactionsByUser() as userGroup (userGroup.user.userId)}
                        <div
                            class="rounded-2xl border border-gray-700 bg-gray-900/70 backdrop-blur overflow-hidden"
                        >
                            <div class="bg-gray-800/50 px-6 py-4 border-b border-gray-700">
                                <div class="flex items-center justify-between">
                                    <div>
                                        <h3 class="text-lg font-semibold text-white">
                                            {userGroup.user.firstName}
                                            {userGroup.user.lastName}
                                        </h3>
                                        <p class="text-sm text-gray-400">
                                            {userGroup.user.email}
                                        </p>
                                        {#if userGroup.user.addressLine1 || userGroup.user.city || userGroup.user.state}
                                            <div class="text-xs text-gray-500 mt-1">
                                                {#if userGroup.user.addressLine1}
                                                    <p>{userGroup.user.addressLine1}</p>
                                                {/if}
                                                {#if userGroup.user.addressLine2}
                                                    <p>{userGroup.user.addressLine2}</p>
                                                {/if}
                                                <p>
                                                    {[
                                                        userGroup.user.city,
                                                        userGroup.user.state,
                                                        userGroup.user.zipCode
                                                    ]
                                                        .filter(Boolean)
                                                        .join(', ')}
                                                </p>
                                                {#if userGroup.user.country}
                                                    <p>{userGroup.user.country}</p>
                                                {/if}
                                            </div>
                                        {/if}
                                    </div>
                                    <div class="flex gap-4 text-sm">
                                        <div class="text-right">
                                            <p class="text-gray-400">Total Orders</p>
                                            <p class="text-lg font-semibold text-white">
                                                {userGroup.transactions.length}
                                            </p>
                                        </div>
                                        <div class="text-right">
                                            <p class="text-gray-400">Total Cost</p>
                                            <p class="text-lg font-semibold text-purple-300">
                                                {userGroup.totalCost} hours
                                            </p>
                                        </div>
                                        <div class="text-right">
                                            <p class="text-gray-400">Status</p>
                                            <p class="text-sm">
                                                <span class="text-green-300"
                                                    >{userGroup.fulfilledCount} fulfilled</span
                                                >
                                                {#if userGroup.pendingCount > 0}
                                                    <span class="text-gray-500"> / </span>
                                                    <span class="text-yellow-300"
                                                        >{userGroup.pendingCount} pending</span
                                                    >
                                                {/if}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <table class="w-full">
                                <thead class="bg-gray-800/30">
                                    <tr>
                                        <th
                                            class="px-4 py-3 text-left text-sm font-semibold text-gray-300"
                                            >Date</th
                                        >
                                        <th
                                            class="px-4 py-3 text-left text-sm font-semibold text-gray-300"
                                            >Item</th
                                        >
                                        <th
                                            class="px-4 py-3 text-left text-sm font-semibold text-gray-300"
                                            >Cost</th
                                        >
                                        <th
                                            class="px-4 py-3 text-left text-sm font-semibold text-gray-300"
                                            >Status</th
                                        >
                                        <th
                                            class="px-4 py-3 text-left text-sm font-semibold text-gray-300"
                                            >Actions</th
                                        >
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-gray-700">
                                    {#each userGroup.transactions as transaction (transaction.transactionId)}
                                        <tr class="hover:bg-gray-800/30">
                                            <td class="px-4 py-3 text-sm text-gray-300"
                                                >{formatDate(transaction.createdAt)}</td
                                            >
                                            <td class="px-4 py-3">
                                                <p class="text-sm font-medium text-white">
                                                    {transaction.item.name}
                                                    {#if transaction.variant}
                                                        <span class="text-blue-300">
                                                            ({transaction.variant.name})</span
                                                        >
                                                    {/if}
                                                </p>
                                            </td>
                                            <td
                                                class="px-4 py-3 text-sm font-semibold text-purple-300"
                                                >{transaction.cost} hours</td
                                            >
                                            <td class="px-4 py-3">
                                                {#if transaction.isFulfilled}
                                                    <div class="flex flex-col gap-1">
                                                        <span
                                                            class="px-2 py-1 text-xs rounded bg-green-500/20 border border-green-400 text-green-300 w-fit"
                                                            >Fulfilled</span
                                                        >
                                                        {#if transaction.fulfilledAt}
                                                            <span class="text-xs text-gray-500"
                                                                >{formatDate(
                                                                    transaction.fulfilledAt
                                                                )}</span
                                                            >
                                                        {/if}
                                                    </div>
                                                {:else}
                                                    <span
                                                        class="px-2 py-1 text-xs rounded bg-yellow-500/20 border border-yellow-400 text-yellow-300"
                                                        >Pending</span
                                                    >
                                                {/if}
                                            </td>
                                            <td class="px-4 py-3">
                                                <div class="flex gap-2">
                                                    {#if transaction.isFulfilled}
                                                        <button
                                                            class="px-3 py-1.5 rounded-lg bg-yellow-600/20 border border-yellow-500 text-yellow-300 hover:bg-yellow-600/30 text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                            onclick={() =>
                                                                handleUnfulfillTransaction(
                                                                    transaction.transactionId
                                                                )}
                                                            disabled={unfulfillingTransaction ===
                                                                transaction.transactionId}
                                                        >
                                                            {unfulfillingTransaction ===
                                                            transaction.transactionId
                                                                ? 'Removing...'
                                                                : 'Unfulfill'}
                                                        </button>
                                                    {:else}
                                                        <button
                                                            class="px-3 py-1.5 rounded-lg bg-green-600/20 border border-green-500 text-green-300 hover:bg-green-600/30 text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                            onclick={() =>
                                                                handleMarkFulfilled(
                                                                    transaction.transactionId
                                                                )}
                                                            disabled={fulfillingTransaction ===
                                                                transaction.transactionId}
                                                        >
                                                            {fulfillingTransaction ===
                                                            transaction.transactionId
                                                                ? 'Marking...'
                                                                : 'Mark Fulfilled'}
                                                        </button>
                                                    {/if}
                                                    <button
                                                        class="px-3 py-1.5 rounded-lg bg-red-600/20 border border-red-500 text-red-300 hover:bg-red-600/30 text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                        onclick={() =>
                                                            handleRefundTransaction(
                                                                transaction.transactionId
                                                            )}
                                                        disabled={refundingTransaction ===
                                                            transaction.transactionId}
                                                    >
                                                        {refundingTransaction ===
                                                        transaction.transactionId
                                                            ? 'Refunding...'
                                                            : 'Refund'}
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    {/each}
                                </tbody>
                            </table>
                            <div
                                class="bg-gray-800/30 px-6 py-4 border-t border-gray-700"
                            >
                                <div class="flex items-center justify-between">
                                    <span class="text-sm font-semibold text-gray-300"
                                        >Total</span
                                    >
                                    <div class="flex gap-6 text-sm">
                                        <div class="text-right">
                                            <p class="text-gray-400">Hours</p>
                                            <p class="text-lg font-bold text-purple-300">
                                                {userGroup.totalCost}
                                            </p>
                                        </div>
                                        <div class="text-right">
                                            <p class="text-gray-400">
                                                Money Cost (only leo should use this - guesstimate)
                                            </p>
                                            <p class="text-lg font-bold text-green-300">
                                                ${(userGroup.totalCost * 10).toFixed(2)}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    {/each}
                </div>
            {/if}
        {/if}
    {/if}
</section>
