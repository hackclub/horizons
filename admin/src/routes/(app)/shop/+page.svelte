<script lang="ts">
    import { onMount } from 'svelte';
    import { api, type components } from '$lib/api';
    import { Button, TextField, Card, Tab, Checkbox, Select } from '$lib/components';

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

<div class="p-6"><div class="mx-auto max-w-6xl space-y-6">
<section class="space-y-4">
    <div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <h2 class="text-2xl font-semibold">Shop Management</h2>
        <div class="flex items-center gap-2">
            {#if shops.length > 0}
                <Select
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
                </Select>
            {/if}
            <Button
                variant={showShopManager ? 'ghost' : 'default'}
                onclick={() => (showShopManager = !showShopManager)}
            >
                Manage Shops
            </Button>
        </div>
    </div>

    {#if showShopManager}
        <Card class="p-6 space-y-6">
            <h3 class="text-lg font-semibold">
                {editingShopId ? 'Edit Shop' : 'Create New Shop'}
            </h3>
            <div class="grid gap-4 md:grid-cols-2">
                <div class="space-y-2">
                    <label class="text-sm font-medium text-ds-text-secondary" for="shop-slug">Slug *</label>
                    <TextField
                        id="shop-slug"
                        placeholder="my-shop"
                        bind:value={shopForm.slug}
                    />
                </div>
                <div class="space-y-2">
                    <label class="text-sm font-medium text-ds-text-secondary" for="shop-description"
                        >Description</label
                    >
                    <TextField
                        id="shop-description"
                        placeholder="Shop description..."
                        bind:value={shopForm.description}
                    />
                </div>
                <div class="flex items-center gap-4">
                    <label class="flex items-center gap-2 text-sm text-ds-text-secondary">
                        <Checkbox bind:checked={shopForm.isActive} />
                        Active
                    </label>
                    <label class="flex items-center gap-2 text-sm text-ds-text-secondary">
                        <Checkbox bind:checked={shopForm.isPublic} />
                        Public
                    </label>
                </div>
            </div>

            <div class="flex flex-wrap gap-3 items-center">
                <Button
                    variant="approve"
                    onclick={saveShop}
                    disabled={shopFormSaving || !shopForm.slug}
                >
                    {shopFormSaving ? 'Saving...' : editingShopId ? 'Update Shop' : 'Create Shop'}
                </Button>
                {#if editingShopId}
                    <Button
                        variant="default"
                        onclick={resetShopForm}
                    >
                        Cancel Edit
                    </Button>
                {/if}
                {#if shopFormError}
                    <span class="text-red-600 text-sm">{shopFormError}</span>
                {/if}
                {#if shopFormSuccess}
                    <span class="text-green-700 text-sm">{shopFormSuccess}</span>
                {/if}
            </div>

            {#if shops.length > 0}
                <div class="space-y-2">
                    {#each shops as shop (shop.shopId)}
                        <div
                            class="flex items-center justify-between rounded-lg border border-ds-border bg-ds-surface2 px-4 py-3"
                        >
                            <div class="flex items-center gap-3">
                                <span class="font-medium">{shop.slug}</span>
                                {#if shop.description}
                                    <span class="text-sm text-ds-text-secondary">{shop.description}</span>
                                {/if}
                                {#if !shop.isActive}
                                    <span
                                        class="px-2 py-0.5 text-xs bg-red-900/50 text-red-600 rounded"
                                        >Inactive</span
                                    >
                                {/if}
                                {#if !shop.isPublic}
                                    <span
                                        class="px-2 py-0.5 text-xs bg-yellow-900/50 text-yellow-600 rounded"
                                        >Hidden</span
                                    >
                                {/if}
                            </div>
                            <div class="flex gap-2">
                                <Button
                                    variant="default"
                                    onclick={() => startEditShop(shop)}
                                >
                                    Edit
                                </Button>
                                <Button
                                    variant="reject"
                                    onclick={() => deleteShop(shop.shopId)}
                                >
                                    Delete
                                </Button>
                            </div>
                        </div>
                    {/each}
                </div>
            {/if}
        </Card>
    {/if}

    {#if !selectedShopId && shops.length === 0}
        <div class="py-12 text-center text-ds-text-secondary">
            No shops yet. Create one using "Manage Shops" above.
        </div>
    {:else if !selectedShopId}
        <div class="py-12 text-center text-ds-text-secondary">
            Select a shop above to manage its items and transactions.
        </div>
    {:else}
        <div class="flex gap-2 items-center">
            <Tab
                items={[
                    { label: `Items (${shopItems.length})`, value: 'items' },
                    { label: `Transactions (${shopTransactions.length})`, value: 'transactions' },
                    { label: 'By User', value: 'transactions-by-user' }
                ]}
                bind:value={shopSubTab}
            />
            <Button variant="default" onclick={loadShopData}>
                Refresh
            </Button>
        </div>

        {#if shopLoading}
            <div class="py-12 text-center text-ds-text-secondary">Loading shop data...</div>
        {:else if shopSubTab === 'items'}
            <Card class="p-6 space-y-6">
                <h3 class="text-lg font-semibold">
                    {editingItemId ? 'Edit Item' : 'Create New Item'}
                </h3>

                <div class="grid gap-4 md:grid-cols-2">
                    <div class="space-y-2">
                        <label class="text-sm font-medium text-ds-text-secondary" for="item-name"
                            >Name *</label
                        >
                        <TextField
                            id="item-name"
                            placeholder="Item name"
                            bind:value={shopItemForm.name}
                        />
                    </div>
                    <div class="space-y-2">
                        <label class="text-sm font-medium text-ds-text-secondary" for="item-cost"
                            >Cost (hours) *</label
                        >
                        <TextField
                            id="item-cost"
                            type="number"
                            step="0.1"
                            min="0"
                            placeholder="0"
                            bind:value={shopItemForm.cost}
                        />
                    </div>
                    <div class="space-y-2">
                        <label class="text-sm font-medium text-ds-text-secondary" for="item-max-per-user"
                            >Max per User</label
                        >
                        <TextField
                            id="item-max-per-user"
                            type="number"
                            step="1"
                            min="1"
                            placeholder="Unlimited"
                            bind:value={shopItemForm.maxPerUser}
                        />
                    </div>
                    <div class="space-y-2">
                        <label class="text-sm font-medium text-ds-text-secondary" for="item-image"
                            >Image URL</label
                        >
                        <TextField
                            id="item-image"
                            placeholder="https://..."
                            bind:value={shopItemForm.imageUrl}
                        />
                    </div>
                    <div class="space-y-2">
                        <label class="text-sm font-medium text-ds-text-secondary" for="item-description"
                            >Description</label
                        >
                        <TextField
                            multiline
                            id="item-description"
                            rows={2}
                            placeholder="Item description..."
                            bind:value={shopItemForm.description}
                        />
                    </div>
                </div>

                <div class="flex flex-wrap gap-3 items-center">
                    <Button
                        variant="approve"
                        onclick={saveShopItem}
                        disabled={shopItemSaving || !shopItemForm.name || !shopItemForm.cost}
                    >
                        {shopItemSaving
                            ? 'Saving...'
                            : editingItemId
                              ? 'Update Item'
                              : 'Create Item'}
                    </Button>
                    {#if editingItemId}
                        <Button
                            variant="default"
                            onclick={resetItemForm}
                        >
                            Cancel Edit
                        </Button>
                    {/if}
                    {#if shopItemError}
                        <span class="text-red-600 text-sm">{shopItemError}</span>
                    {/if}
                    {#if shopItemSuccess}
                        <span class="text-green-700 text-sm">{shopItemSuccess}</span>
                    {/if}
                </div>
            </Card>

            {#if shopItems.length === 0}
                <div class="py-12 text-center text-ds-text-secondary">
                    No shop items yet. Create one above!
                </div>
            {:else}
                <div class="grid gap-4">
                    {#each shopItems as item (item.itemId)}
                        <Card class="p-6 space-y-4">
                            <div
                                class="flex flex-col gap-4 md:flex-row md:items-start md:justify-between"
                            >
                                <div class="flex gap-4">
                                    {#if item.imageUrl}
                                        <img
                                            src={item.imageUrl}
                                            alt={item.name}
                                            class="w-20 h-20 object-cover rounded-lg border border-ds-border"
                                        />
                                    {:else}
                                        <div
                                            class="w-20 h-20 bg-ds-surface2 rounded-lg border border-ds-border flex items-center justify-center text-2xl"
                                        >
                                            🛍️
                                        </div>
                                    {/if}
                                    <div>
                                        <h3 class="text-xl font-semibold flex items-center gap-2">
                                            {item.name}
                                            {#if !item.isActive}
                                                <span
                                                    class="px-2 py-0.5 text-xs rounded bg-red-500/20 border border-red-400 text-red-600"
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
                                                    class="px-2 py-0.5 text-xs rounded bg-blue-500/20 border border-blue-400 text-ds-link"
                                                    >{item.variants.length} variant{item.variants
                                                        .length > 1
                                                        ? 's'
                                                        : ''}</span
                                                >
                                            {/if}
                                        </h3>
                                        <p class="text-sm text-ds-accent font-semibold">
                                            {item.cost} hours {item.variants &&
                                            item.variants.length > 0
                                                ? '(base)'
                                                : ''}
                                        </p>
                                        {#if item.description}
                                            <p class="text-sm text-ds-text-secondary mt-1">
                                                {item.description}
                                            </p>
                                        {/if}
                                        <p class="text-xs text-ds-text-placeholder mt-2">
                                            Updated {formatDate(item.updatedAt)}
                                        </p>
                                    </div>
                                </div>
                                <div class="flex flex-wrap gap-2">
                                    <Button
                                        variant="ghost"
                                        onclick={() => {
                                            expandedItemVariants[item.itemId] =
                                                !expandedItemVariants[item.itemId];
                                        }}
                                    >
                                        {expandedItemVariants[item.itemId] ? 'Hide' : 'Show'} Variants
                                    </Button>
                                    <Button
                                        variant="default"
                                        onclick={() => startEditItem(item)}
                                    >
                                        Edit
                                    </Button>
                                    <Button
                                        variant={item.isActive ? 'ghost' : 'approve'}
                                        onclick={() => toggleItemActive(item)}
                                    >
                                        {item.isActive ? 'Deactivate' : 'Activate'}
                                    </Button>
                                    <Button
                                        variant="reject"
                                        onclick={() => deleteShopItem(item.itemId)}
                                    >
                                        Delete
                                    </Button>
                                </div>
                            </div>

                            {#if expandedItemVariants[item.itemId]}
                                <div class="border-t border-ds-border pt-4 space-y-3">
                                    <div class="flex items-center justify-between">
                                        <h4 class="text-sm font-semibold text-ds-text-secondary">
                                            Variants
                                        </h4>
                                        <Button
                                            variant="approve"
                                            onclick={() => startAddVariant(item.itemId)}
                                        >
                                            + Add Variant
                                        </Button>
                                    </div>

                                    {#if addingVariantToItemId === item.itemId}
                                        <div class="bg-ds-surface2/50 rounded-lg p-4 space-y-3">
                                            <div class="grid gap-3 md:grid-cols-3">
                                                <div>
                                                    <label class="text-xs text-ds-text-secondary"
                                                        >Variant Name *</label
                                                    >
                                                    <TextField
                                                        placeholder="e.g., XL, $200"
                                                        bind:value={variantForm.name}
                                                    />
                                                </div>
                                                <div>
                                                    <label class="text-xs text-ds-text-secondary"
                                                        >Cost (hours) *</label
                                                    >
                                                    <TextField
                                                        type="number"
                                                        step="0.1"
                                                        min="0"
                                                        bind:value={variantForm.cost}
                                                    />
                                                </div>
                                                <div class="flex items-end gap-2">
                                                    <Button
                                                        variant="approve"
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
                                                    </Button>
                                                    <Button
                                                        variant="default"
                                                        onclick={resetVariantForm}
                                                    >
                                                        Cancel
                                                    </Button>
                                                </div>
                                            </div>
                                            {#if variantError}
                                                <p class="text-red-600 text-xs">
                                                    {variantError}
                                                </p>
                                            {/if}
                                            {#if variantSuccess}
                                                <p class="text-green-700 text-xs">
                                                    {variantSuccess}
                                                </p>
                                            {/if}
                                        </div>
                                    {/if}

                                    {#if item.variants && item.variants.length > 0}
                                        <div class="space-y-2">
                                            {#each item.variants as variant (variant.variantId)}
                                                <div
                                                    class="flex items-center justify-between bg-ds-surface2/30 rounded-lg px-4 py-2"
                                                >
                                                    <div class="flex items-center gap-3">
                                                        <span class="font-medium text-ds-text"
                                                            >{variant.name}</span
                                                        >
                                                        <span class="text-ds-accent text-sm"
                                                            >{variant.cost} hours</span
                                                        >
                                                        {#if !variant.isActive}
                                                            <span
                                                                class="px-2 py-0.5 text-xs rounded bg-red-500/20 border border-red-400 text-red-600"
                                                                >Inactive</span
                                                            >
                                                        {/if}
                                                    </div>
                                                    <div class="flex gap-2">
                                                        <Button
                                                            variant="default"
                                                            onclick={() =>
                                                                startEditVariant(variant)}
                                                        >
                                                            Edit
                                                        </Button>
                                                        <Button
                                                            variant={variant.isActive ? 'ghost' : 'approve'}
                                                            onclick={() =>
                                                                toggleVariantActive(variant)}
                                                        >
                                                            {variant.isActive
                                                                ? 'Deactivate'
                                                                : 'Activate'}
                                                        </Button>
                                                        <Button
                                                            variant="reject"
                                                            onclick={() =>
                                                                deleteVariant(variant.variantId)}
                                                        >
                                                            Delete
                                                        </Button>
                                                    </div>
                                                </div>
                                            {/each}
                                        </div>
                                    {:else}
                                        <p class="text-ds-text-placeholder text-sm">
                                            No variants yet. Add one to offer different options.
                                        </p>
                                    {/if}
                                </div>
                            {/if}
                        </Card>
                    {/each}
                </div>
            {/if}
        {:else if shopSubTab === 'transactions'}
            {#if shopTransactions.length === 0}
                <div class="py-12 text-center text-ds-text-secondary">No transactions yet.</div>
            {:else}
                <div class="mb-4 flex items-center gap-3">
                    <label class="text-sm font-medium text-ds-text-secondary">Filter by Item:</label>
                    <Select bind:value={selectedItemFilter}>
                        <option value={null}>All Items</option>
                        {#each shopItems as item (item.itemId)}
                            <option value={item.itemId}>{item.name}</option>
                        {/each}
                    </Select>
                    <label class="text-sm font-medium text-ds-text-secondary">Status:</label>
                    <Tab
                        items={[
                            { label: 'All', value: 'all' },
                            { label: 'Fulfilled', value: 'fulfilled' },
                            { label: 'Unfulfilled', value: 'unfulfilled' }
                        ]}
                        bind:value={fulfillmentFilter}
                    />
                </div>
                <Card class="overflow-hidden">
                    <table class="w-full">
                        <thead class="bg-ds-surface2/50">
                            <tr>
                                <th
                                    class="px-4 py-3 text-left text-sm font-semibold text-ds-text-secondary"
                                    >Date</th
                                >
                                <th
                                    class="px-4 py-3 text-left text-sm font-semibold text-ds-text-secondary"
                                    >User</th
                                >
                                <th
                                    class="px-4 py-3 text-left text-sm font-semibold text-ds-text-secondary"
                                    >Item</th
                                >
                                <th
                                    class="px-4 py-3 text-left text-sm font-semibold text-ds-text-secondary"
                                    >Cost</th
                                >
                                <th
                                    class="px-4 py-3 text-left text-sm font-semibold text-ds-text-secondary"
                                    >Status</th
                                >
                                <th
                                    class="px-4 py-3 text-left text-sm font-semibold text-ds-text-secondary"
                                    >Actions</th
                                >
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-ds-border">
                            {#each filteredTransactions() as transaction (transaction.transactionId)}
                                <tr class="hover:bg-ds-surface2/30">
                                    <td class="px-4 py-3 text-sm text-ds-text-secondary"
                                        >{formatDate(transaction.createdAt)}</td
                                    >
                                    <td class="px-4 py-3">
                                        <p class="text-sm font-medium text-ds-text">
                                            {transaction.user.firstName}
                                            {transaction.user.lastName}
                                        </p>
                                        <p class="text-xs text-ds-text-secondary">
                                            {transaction.user.email}
                                        </p>
                                        {#if transaction.user.addressLine1 || transaction.user.city || transaction.user.state}
                                            <div class="text-xs text-ds-text-placeholder mt-1">
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
                                        <p class="text-sm font-medium text-ds-text">
                                            {transaction.item.name}
                                            {#if transaction.variant}
                                                <span class="text-ds-link">
                                                    ({transaction.variant.name})</span
                                                >
                                            {/if}
                                        </p>
                                    </td>
                                    <td
                                        class="px-4 py-3 text-sm font-semibold text-ds-accent"
                                        >{transaction.cost} hours</td
                                    >
                                    <td class="px-4 py-3">
                                        {#if transaction.isFulfilled}
                                            <div class="flex flex-col gap-1">
                                                <span
                                                    class="px-2 py-1 text-xs rounded bg-green-500/20 border border-green-400 text-green-700 w-fit"
                                                    >Fulfilled</span
                                                >
                                                {#if transaction.fulfilledAt}
                                                    <span class="text-xs text-ds-text-placeholder"
                                                        >{formatDate(
                                                            transaction.fulfilledAt
                                                        )}</span
                                                    >
                                                {/if}
                                            </div>
                                        {:else}
                                            <span
                                                class="px-2 py-1 text-xs rounded bg-yellow-500/20 border border-yellow-400 text-yellow-600"
                                                >Pending</span
                                            >
                                        {/if}
                                    </td>
                                    <td class="px-4 py-3">
                                        <div class="flex gap-2">
                                            {#if transaction.isFulfilled}
                                                <Button
                                                    variant="ghost"
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
                                                </Button>
                                            {:else}
                                                <Button
                                                    variant="approve"
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
                                                </Button>
                                            {/if}
                                            <Button
                                                variant="reject"
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
                                            </Button>
                                        </div>
                                    </td>
                                </tr>
                            {/each}
                        </tbody>
                    </table>
                </Card>
            {/if}
        {:else if shopSubTab === 'transactions-by-user'}
            {#if shopTransactions.length === 0}
                <div class="py-12 text-center text-ds-text-secondary">No transactions yet.</div>
            {:else}
                <div class="mb-4 flex items-center gap-3">
                    <label class="text-sm font-medium text-ds-text-secondary">Filter by Item:</label>
                    <Select bind:value={selectedItemFilter}>
                        <option value={null}>All Items</option>
                        {#each shopItems as item (item.itemId)}
                            <option value={item.itemId}>{item.name}</option>
                        {/each}
                    </Select>
                    <label class="text-sm font-medium text-ds-text-secondary">Status:</label>
                    <Tab
                        items={[
                            { label: 'All', value: 'all' },
                            { label: 'Fulfilled', value: 'fulfilled' },
                            { label: 'Unfulfilled', value: 'unfulfilled' }
                        ]}
                        bind:value={fulfillmentFilter}
                    />
                </div>
                <div class="space-y-4">
                    {#each transactionsByUser() as userGroup (userGroup.user.userId)}
                        <Card class="overflow-hidden">
                            <div class="bg-ds-surface2/50 px-6 py-4 border-b border-ds-border">
                                <div class="flex items-center justify-between">
                                    <div>
                                        <h3 class="text-lg font-semibold text-ds-text">
                                            {userGroup.user.firstName}
                                            {userGroup.user.lastName}
                                        </h3>
                                        <p class="text-sm text-ds-text-secondary">
                                            {userGroup.user.email}
                                        </p>
                                        {#if userGroup.user.addressLine1 || userGroup.user.city || userGroup.user.state}
                                            <div class="text-xs text-ds-text-placeholder mt-1">
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
                                            <p class="text-ds-text-secondary">Total Orders</p>
                                            <p class="text-lg font-semibold text-ds-text">
                                                {userGroup.transactions.length}
                                            </p>
                                        </div>
                                        <div class="text-right">
                                            <p class="text-ds-text-secondary">Total Cost</p>
                                            <p class="text-lg font-semibold text-ds-accent">
                                                {userGroup.totalCost} hours
                                            </p>
                                        </div>
                                        <div class="text-right">
                                            <p class="text-ds-text-secondary">Status</p>
                                            <p class="text-sm">
                                                <span class="text-green-700"
                                                    >{userGroup.fulfilledCount} fulfilled</span
                                                >
                                                {#if userGroup.pendingCount > 0}
                                                    <span class="text-ds-text-placeholder"> / </span>
                                                    <span class="text-yellow-600"
                                                        >{userGroup.pendingCount} pending</span
                                                    >
                                                {/if}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <table class="w-full">
                                <thead class="bg-ds-surface2/30">
                                    <tr>
                                        <th
                                            class="px-4 py-3 text-left text-sm font-semibold text-ds-text-secondary"
                                            >Date</th
                                        >
                                        <th
                                            class="px-4 py-3 text-left text-sm font-semibold text-ds-text-secondary"
                                            >Item</th
                                        >
                                        <th
                                            class="px-4 py-3 text-left text-sm font-semibold text-ds-text-secondary"
                                            >Cost</th
                                        >
                                        <th
                                            class="px-4 py-3 text-left text-sm font-semibold text-ds-text-secondary"
                                            >Status</th
                                        >
                                        <th
                                            class="px-4 py-3 text-left text-sm font-semibold text-ds-text-secondary"
                                            >Actions</th
                                        >
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-ds-border">
                                    {#each userGroup.transactions as transaction (transaction.transactionId)}
                                        <tr class="hover:bg-ds-surface2/30">
                                            <td class="px-4 py-3 text-sm text-ds-text-secondary"
                                                >{formatDate(transaction.createdAt)}</td
                                            >
                                            <td class="px-4 py-3">
                                                <p class="text-sm font-medium text-ds-text">
                                                    {transaction.item.name}
                                                    {#if transaction.variant}
                                                        <span class="text-ds-link">
                                                            ({transaction.variant.name})</span
                                                        >
                                                    {/if}
                                                </p>
                                            </td>
                                            <td
                                                class="px-4 py-3 text-sm font-semibold text-ds-accent"
                                                >{transaction.cost} hours</td
                                            >
                                            <td class="px-4 py-3">
                                                {#if transaction.isFulfilled}
                                                    <div class="flex flex-col gap-1">
                                                        <span
                                                            class="px-2 py-1 text-xs rounded bg-green-500/20 border border-green-400 text-green-700 w-fit"
                                                            >Fulfilled</span
                                                        >
                                                        {#if transaction.fulfilledAt}
                                                            <span class="text-xs text-ds-text-placeholder"
                                                                >{formatDate(
                                                                    transaction.fulfilledAt
                                                                )}</span
                                                            >
                                                        {/if}
                                                    </div>
                                                {:else}
                                                    <span
                                                        class="px-2 py-1 text-xs rounded bg-yellow-500/20 border border-yellow-400 text-yellow-600"
                                                        >Pending</span
                                                    >
                                                {/if}
                                            </td>
                                            <td class="px-4 py-3">
                                                <div class="flex gap-2">
                                                    {#if transaction.isFulfilled}
                                                        <Button
                                                            variant="ghost"
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
                                                        </Button>
                                                    {:else}
                                                        <Button
                                                            variant="approve"
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
                                                        </Button>
                                                    {/if}
                                                    <Button
                                                        variant="reject"
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
                                                    </Button>
                                                </div>
                                            </td>
                                        </tr>
                                    {/each}
                                </tbody>
                            </table>
                            <div
                                class="bg-ds-surface2/30 px-6 py-4 border-t border-ds-border"
                            >
                                <div class="flex items-center justify-between">
                                    <span class="text-sm font-semibold text-ds-text-secondary"
                                        >Total</span
                                    >
                                    <div class="flex gap-6 text-sm">
                                        <div class="text-right">
                                            <p class="text-ds-text-secondary">Hours</p>
                                            <p class="text-lg font-bold text-ds-accent">
                                                {userGroup.totalCost}
                                            </p>
                                        </div>
                                        <div class="text-right">
                                            <p class="text-ds-text-secondary">
                                                Money Cost (only leo should use this - guesstimate)
                                            </p>
                                            <p class="text-lg font-bold text-green-700">
                                                ${(userGroup.totalCost * 10).toFixed(2)}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </Card>
                    {/each}
                </div>
            {/if}
        {/if}
    {/if}
</section>
</div></div>
