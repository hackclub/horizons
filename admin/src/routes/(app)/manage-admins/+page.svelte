<script lang="ts">
    import { onMount } from 'svelte';
    import { api, type components } from '$lib/api';
    import { Button, TextField, Card, Select } from '$lib/components';

    type ElevatedUser = components['schemas']['ElevatedUserResponse'];

    let elevatedUsers = $state<ElevatedUser[]>([]);
    let loading = $state(true);
    let error = $state<string | null>(null);

    // Search for adding new users
    let searchQuery = $state('');
    let searchResults = $state<{ userId: number; email: string; firstName: string | null; lastName: string | null; role: string }[]>([]);
    let searchLoading = $state(false);

    // Pending role change
    let pendingChange = $state<{ userId: number; role: string } | null>(null);

    const roleOptions = ['user', 'admin', 'reviewer', 'event_viewer'] as const;

    const roleBadgeClass: Record<string, string> = {
        superadmin: 'bg-purple-600/20 border-purple-500 text-purple-400',
        admin: 'bg-blue-600/20 border-blue-500 text-blue-400',
        reviewer: 'bg-green-600/20 border-green-500 text-green-400',
        event_viewer: 'bg-amber-600/20 border-amber-500 text-amber-400',
        user: 'bg-ds-surface2 border-ds-border text-ds-text-secondary'
    };

    const roleOrder = ['superadmin', 'admin', 'reviewer', 'event_viewer', 'user'];
    const roleLabel: Record<string, string> = {
        superadmin: 'Superadmins',
        admin: 'Admins',
        reviewer: 'Reviewers',
        event_viewer: 'Event Viewers',
        user: 'Users'
    };

    const groupedUsers = $derived.by(() => {
        const groups = new Map<string, ElevatedUser[]>();
        for (const user of elevatedUsers) {
            const list = groups.get(user.role) ?? [];
            list.push(user);
            groups.set(user.role, list);
        }
        return roleOrder
            .filter((role) => groups.has(role))
            .map((role) => ({ role, users: groups.get(role)! }))
            .concat(
                [...groups.keys()]
                    .filter((role) => !roleOrder.includes(role))
                    .map((role) => ({ role, users: groups.get(role)! }))
            );
    });

    async function loadElevatedUsers() {
        loading = true;
        error = null;
        try {
            const { data, error: err } = await api.GET('/api/admin/elevated-users');
            if (err) {
                error = 'Failed to load elevated users';
                return;
            }
            elevatedUsers = data;
        } catch {
            error = 'Failed to load elevated users';
        } finally {
            loading = false;
        }
    }

    let searchTimeout: ReturnType<typeof setTimeout>;

    function debouncedSearch() {
        clearTimeout(searchTimeout);
        if (!searchQuery.trim() || searchQuery.trim().length < 2) {
            searchResults = [];
            return;
        }
        searchTimeout = setTimeout(searchUsers, 300);
    }

    async function searchUsers() {
        if (!searchQuery.trim() || searchQuery.trim().length < 2) {
            searchResults = [];
            return;
        }
        searchLoading = true;
        try {
            const { data, error: err } = await api.GET('/api/admin/users/search', {
                params: { query: { q: searchQuery.trim() } }
            });
            if (err || !data) return;
            searchResults = (data as any[]).map((u) => ({
                userId: u.userId,
                email: u.email,
                firstName: u.firstName,
                lastName: u.lastName,
                role: u.role
            }));
        } finally {
            searchLoading = false;
        }
    }

    async function updateRole(userId: number, role: string) {
        pendingChange = { userId, role };
        try {
            const { error: err } = await api.PUT('/api/admin/users/{id}/role', {
                params: { path: { id: userId } },
                body: { role: role as any }
            });
            if (err) {
                alert('Failed to update role. You may not have permission.');
                return;
            }
            await loadElevatedUsers();
            searchResults = [];
            searchQuery = '';
        } finally {
            pendingChange = null;
        }
    }

    onMount(() => {
        loadElevatedUsers();
    });
</script>

<div class="p-6">
    <div class="mx-auto max-w-4xl space-y-6">
        <h1 class="text-3xl font-bold">Manage Admins</h1>
        <p class="text-ds-text-secondary text-sm">
            Add, remove, or change roles for users with elevated privileges. Only superadmins can access this page.
        </p>

        <!-- Add User Section -->
        <Card class="p-6 space-y-4">
            <h2 class="text-xl font-semibold">Add User</h2>
            <div class="flex gap-2">
                <TextField
                    bind:value={searchQuery}
                    placeholder="Search by name or email..."
                    class="flex-1"
                    oninput={debouncedSearch}
                />
            </div>

            {#if searchLoading}
                <p class="text-ds-text-secondary text-sm">Searching...</p>
            {:else if searchResults.length > 0}
                <div class="space-y-2">
                    {#each searchResults as result}
                        <div class="flex items-center justify-between rounded-lg border border-ds-border bg-ds-surface2/50 p-3">
                            <div>
                                <p class="text-sm font-medium text-ds-text">
                                    {result.firstName || ''} {result.lastName || ''}
                                </p>
                                <p class="text-xs text-ds-text-secondary">{result.email}</p>
                            </div>
                            <div class="flex gap-2">
                                <Button
                                    variant="approve"
                                    onclick={() => updateRole(result.userId, 'reviewer')}
                                    disabled={pendingChange?.userId === result.userId}
                                >
                                    Make Reviewer
                                </Button>
                                <Button
                                    class="bg-amber-600/20 border-amber-500 text-amber-400 hover:bg-amber-600/30"
                                    onclick={() => updateRole(result.userId, 'event_viewer')}
                                    disabled={pendingChange?.userId === result.userId}
                                >
                                    Make Event Viewer
                                </Button>
                                <Button
                                    class="bg-blue-600/20 border-blue-500 text-blue-400 hover:bg-blue-600/30"
                                    onclick={() => updateRole(result.userId, 'admin')}
                                    disabled={pendingChange?.userId === result.userId}
                                >
                                    Make Admin
                                </Button>
                            </div>
                        </div>
                    {/each}
                </div>
            {:else if searchQuery.trim()}
                <p class="text-ds-text-placeholder text-sm">No regular users found matching "{searchQuery}"</p>
            {/if}
        </Card>

        <!-- Elevated Users List -->
        <Card class="p-6 space-y-4">
            <div class="flex items-center justify-between">
                <h2 class="text-xl font-semibold">Elevated Users</h2>
                <Button variant="default" onclick={loadElevatedUsers} disabled={loading}>
                    {loading ? 'Loading...' : 'Refresh'}
                </Button>
            </div>

            {#if loading}
                <p class="text-ds-text-secondary text-sm">Loading elevated users...</p>
            {:else if error}
                <p class="text-red-400 text-sm">{error}</p>
            {:else if elevatedUsers.length === 0}
                <p class="text-ds-text-placeholder text-sm">No elevated users found.</p>
            {:else}
                <div class="space-y-6">
                    {#each groupedUsers as group (group.role)}
                        <div class="space-y-2">
                            <div class="flex items-center gap-3">
                                <h3 class="text-sm font-semibold text-ds-text">
                                    {roleLabel[group.role] || group.role}
                                </h3>
                                <span class="text-xs text-ds-text-placeholder">{group.users.length}</span>
                            </div>
                            <div class="overflow-x-auto rounded-lg border border-ds-border">
                                <table class="w-full">
                                    <thead class="bg-ds-surface2/50">
                                        <tr>
                                            <th class="px-4 py-3 text-left text-sm font-semibold text-ds-text-secondary">User</th>
                                            <th class="px-4 py-3 text-left text-sm font-semibold text-ds-text-secondary">Email</th>
                                            <th class="px-4 py-3 text-center text-sm font-semibold text-ds-text-secondary">Role</th>
                                            <th class="px-4 py-3 text-center text-sm font-semibold text-ds-text-secondary">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody class="divide-y divide-gray-700">
                                        {#each group.users as user (user.userId)}
                                            <tr class="hover:bg-ds-surface2/30">
                                                <td class="px-4 py-3">
                                                    <p class="text-sm font-medium text-ds-text">
                                                        {user.firstName || ''} {user.lastName || ''}
                                                    </p>
                                                    <p class="text-xs text-ds-text-placeholder">ID: {user.userId}</p>
                                                </td>
                                                <td class="px-4 py-3 text-sm text-ds-text-secondary">
                                                    {user.email}
                                                </td>
                                                <td class="px-4 py-3 text-center">
                                                    <span class="inline-block rounded-full border px-3 py-0.5 text-xs font-semibold capitalize {roleBadgeClass[user.role] || roleBadgeClass.user}">
                                                        {user.role}
                                                    </span>
                                                </td>
                                                <td class="px-4 py-3 text-center">
                                                    {#if user.role === 'superadmin'}
                                                        <span class="text-xs text-ds-text-placeholder">—</span>
                                                    {:else}
                                                        <div class="flex justify-center gap-2">
                                                            <Select
                                                                value={user.role}
                                                                onchange={(e) => {
                                                                    const target = e.target as HTMLSelectElement;
                                                                    if (target.value !== user.role) {
                                                                        updateRole(user.userId, target.value);
                                                                    }
                                                                }}
                                                                disabled={pendingChange?.userId === user.userId}
                                                            >
                                                                {#each roleOptions as opt}
                                                                    <option value={opt} selected={user.role === opt}>{opt}</option>
                                                                {/each}
                                                            </Select>
                                                        </div>
                                                    {/if}
                                                </td>
                                            </tr>
                                        {/each}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    {/each}
                </div>
            {/if}
        </Card>
    </div>
</div>
