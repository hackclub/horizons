<script lang="ts">
    import { onMount, type Snippet } from 'svelte';
    import { api, type components } from '$lib/api';
    import Button from './Button.svelte';
    import Card from './Card.svelte';
    import TextField from './TextField.svelte';

    type WhitelistUser = components['schemas']['WhitelistUserResponse'];
    type AddBody = { userId?: number; slackUserId?: string };
    type ApiResult = { data?: WhitelistUser[]; error?: unknown };

    // Superadmin-only editor for a user ID whitelist stored on GlobalSettings.
    // The caller supplies the three API calls so this stays endpoint-agnostic.
    let {
        title,
        description,
        load,
        add,
        remove,
        idPrefix
    }: {
        title: string;
        description: Snippet;
        load: () => Promise<ApiResult>;
        add: (body: AddBody) => Promise<ApiResult>;
        remove: (userId: number) => Promise<ApiResult>;
        idPrefix: string;
    } = $props();

    let whitelist = $state<WhitelistUser[]>([]);
    let loading = $state(false);
    let errorMessage = $state('');
    let pendingUserId = $state<number | null>(null);
    let searchQuery = $state('');
    let searchResults = $state<
        { userId: number; email: string; firstName: string | null; lastName: string | null }[]
    >([]);
    let searchLoading = $state(false);
    let slackIdInput = $state('');
    let slackIdBusy = $state(false);

    async function loadWhitelist() {
        loading = true;
        errorMessage = '';
        try {
            const { data, error } = await load();
            if (error || !data) {
                errorMessage = 'Failed to load whitelist';
                return;
            }
            whitelist = data;
        } catch {
            errorMessage = 'Failed to load whitelist';
        } finally {
            loading = false;
        }
    }

    let searchTimeout: ReturnType<typeof setTimeout>;
    function debouncedSearch() {
        clearTimeout(searchTimeout);
        if (searchQuery.trim().length < 2) {
            searchResults = [];
            return;
        }
        searchTimeout = setTimeout(searchUsers, 300);
    }

    async function searchUsers() {
        if (searchQuery.trim().length < 2) {
            searchResults = [];
            return;
        }
        searchLoading = true;
        try {
            const { data, error } = await api.GET('/api/admin/users/search', {
                params: { query: { q: searchQuery.trim() } }
            });
            if (error || !data) return;
            searchResults = data.map((u) => ({
                userId: u.userId,
                email: u.email,
                firstName: u.firstName,
                lastName: u.lastName
            }));
        } finally {
            searchLoading = false;
        }
    }

    async function addUser(body: AddBody) {
        errorMessage = '';
        try {
            const { data, error } = await add(body);
            if (error || !data) {
                errorMessage =
                    (error as { message?: string })?.message ?? 'Failed to add user to whitelist';
                return false;
            }
            whitelist = data;
            return true;
        } catch {
            errorMessage = 'Failed to add user to whitelist';
            return false;
        }
    }

    async function addById(userId: number) {
        pendingUserId = userId;
        try {
            const ok = await addUser({ userId });
            if (ok) {
                searchResults = [];
                searchQuery = '';
            }
        } finally {
            pendingUserId = null;
        }
    }

    async function addBySlackId() {
        const slackUserId = slackIdInput.trim();
        if (!slackUserId) return;
        slackIdBusy = true;
        try {
            const ok = await addUser({ slackUserId });
            if (ok) slackIdInput = '';
        } finally {
            slackIdBusy = false;
        }
    }

    async function removeUser(userId: number) {
        pendingUserId = userId;
        errorMessage = '';
        try {
            const { data, error } = await remove(userId);
            if (error || !data) {
                errorMessage = 'Failed to remove user from whitelist';
                return;
            }
            whitelist = data;
        } catch {
            errorMessage = 'Failed to remove user from whitelist';
        } finally {
            pendingUserId = null;
        }
    }

    onMount(loadWhitelist);
</script>

<Card class="p-6 space-y-4">
    <div class="flex items-center justify-between">
        <h2 class="text-xl font-semibold flex items-center gap-2">{title}</h2>
        <Button variant="ghost" onclick={loadWhitelist} disabled={loading}>
            {loading ? 'Loading...' : 'Refresh'}
        </Button>
    </div>
    <p class="text-sm text-ds-text-secondary">{@render description()}</p>

    {#if errorMessage}
        <p class="text-xs text-ds-red">{errorMessage}</p>
    {/if}

    <!-- Add by name/email search -->
    <div class="space-y-2">
        <TextField
            bind:value={searchQuery}
            placeholder="Search by name or email..."
            oninput={debouncedSearch}
        />
        {#if searchLoading}
            <p class="text-ds-text-secondary text-sm">Searching...</p>
        {:else if searchResults.length > 0}
            <div class="space-y-2">
                {#each searchResults as result (result.userId)}
                    {@const added = whitelist.some((w) => w.userId === result.userId)}
                    <div class="flex items-center justify-between rounded-lg border border-ds-border bg-ds-surface2/50 p-3">
                        <div>
                            <p class="text-sm font-medium text-ds-text">
                                {result.firstName || ''} {result.lastName || ''}
                            </p>
                            <p class="text-xs text-ds-text-secondary">{result.email}</p>
                        </div>
                        <Button
                            variant="approve"
                            onclick={() => addById(result.userId)}
                            disabled={pendingUserId === result.userId || added}
                        >
                            {added ? 'Added' : 'Add'}
                        </Button>
                    </div>
                {/each}
            </div>
        {:else if searchQuery.trim()}
            <p class="text-ds-text-placeholder text-sm">No users found matching "{searchQuery}"</p>
        {/if}
    </div>

    <!-- Add by Slack user ID -->
    <div class="flex items-end gap-2">
        <div class="flex-1">
            <label class="text-sm text-ds-text-secondary" for="{idPrefix}-slack-id">
                Or add by Slack user ID
            </label>
            <TextField
                id="{idPrefix}-slack-id"
                bind:value={slackIdInput}
                placeholder="e.g. U01ABCDEF"
            />
        </div>
        <Button onclick={addBySlackId} disabled={slackIdBusy || !slackIdInput.trim()}>
            {slackIdBusy ? 'Adding...' : 'Add by Slack ID'}
        </Button>
    </div>

    <!-- Current whitelist -->
    <div class="space-y-2">
        <h3 class="text-sm font-semibold text-ds-text">
            Whitelisted users
            <span class="text-xs text-ds-text-placeholder">{whitelist.length}</span>
        </h3>
        {#if loading}
            <p class="text-ds-text-secondary text-sm">Loading whitelist...</p>
        {:else if whitelist.length === 0}
            <p class="text-ds-text-placeholder text-sm">No users whitelisted.</p>
        {:else}
            <div class="overflow-x-auto rounded-lg border border-ds-border">
                <table class="w-full">
                    <thead class="bg-ds-surface2/50">
                        <tr>
                            <th class="px-4 py-3 text-left text-sm font-semibold text-ds-text-secondary">User</th>
                            <th class="px-4 py-3 text-left text-sm font-semibold text-ds-text-secondary">Email</th>
                            <th class="px-4 py-3 text-left text-sm font-semibold text-ds-text-secondary">Slack ID</th>
                            <th class="px-4 py-3 text-center text-sm font-semibold text-ds-text-secondary">Actions</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-ds-border-divider">
                        {#each whitelist as user (user.userId)}
                            <tr class="hover:bg-ds-surface2/30">
                                <td class="px-4 py-3">
                                    <p class="text-sm font-medium text-ds-text">
                                        {user.firstName || ''} {user.lastName || ''}
                                    </p>
                                    <p class="text-xs text-ds-text-placeholder">ID: {user.userId}</p>
                                </td>
                                <td class="px-4 py-3 text-sm text-ds-text-secondary">{user.email}</td>
                                <td class="px-4 py-3 text-sm text-ds-text-secondary">
                                    {user.slackUserId || '—'}
                                </td>
                                <td class="px-4 py-3 text-center">
                                    <Button
                                        variant="reject"
                                        onclick={() => removeUser(user.userId)}
                                        disabled={pendingUserId === user.userId}
                                    >
                                        Remove
                                    </Button>
                                </td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            </div>
        {/if}
    </div>
</Card>
