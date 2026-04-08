<script lang="ts">
    import { onMount } from 'svelte';
    import { api, type components } from '$lib/api';

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

    const roleOptions = ['user', 'admin', 'reviewer', 'superadmin'] as const;

    const roleBadgeClass: Record<string, string> = {
        superadmin: 'bg-purple-600/20 border-purple-500 text-purple-400',
        admin: 'bg-blue-600/20 border-blue-500 text-blue-400',
        reviewer: 'bg-green-600/20 border-green-500 text-green-400',
        user: 'bg-ds-surface2 border-ds-border text-ds-text-secondary'
    };

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

    async function searchUsers() {
        if (!searchQuery.trim()) {
            searchResults = [];
            return;
        }
        searchLoading = true;
        try {
            const { data, error: err } = await api.GET('/api/admin/users');
            if (err || !data) return;
            const query = searchQuery.toLowerCase();
            searchResults = data
                .filter(
                    (u: any) =>
                        (u.email?.toLowerCase().includes(query) ||
                            u.firstName?.toLowerCase().includes(query) ||
                            u.lastName?.toLowerCase().includes(query)) &&
                        u.role === 'user'
                )
                .slice(0, 10)
                .map((u: any) => ({
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
        <div class="rounded-lg border border-ds-border bg-ds-surface p-6 space-y-4">
            <h2 class="text-xl font-semibold">Add User</h2>
            <div class="flex gap-2">
                <input
                    type="text"
                    bind:value={searchQuery}
                    placeholder="Search by name or email..."
                    class="flex-1 rounded-lg border border-ds-border bg-ds-surface2 px-3 py-2 text-sm text-ds-text placeholder:text-ds-text-placeholder focus:border-ds-accent focus:outline-none"
                    oninput={searchUsers}
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
                                <button
                                    class="rounded-lg border border-green-500 bg-green-600/20 px-3 py-1 text-xs text-green-400 hover:bg-green-600/30 transition-colors"
                                    onclick={() => updateRole(result.userId, 'reviewer')}
                                    disabled={pendingChange?.userId === result.userId}
                                >
                                    Make Reviewer
                                </button>
                                <button
                                    class="rounded-lg border border-blue-500 bg-blue-600/20 px-3 py-1 text-xs text-blue-400 hover:bg-blue-600/30 transition-colors"
                                    onclick={() => updateRole(result.userId, 'admin')}
                                    disabled={pendingChange?.userId === result.userId}
                                >
                                    Make Admin
                                </button>
                                <button
                                    class="rounded-lg border border-purple-500 bg-purple-600/20 px-3 py-1 text-xs text-purple-400 hover:bg-purple-600/30 transition-colors"
                                    onclick={() => updateRole(result.userId, 'superadmin')}
                                    disabled={pendingChange?.userId === result.userId}
                                >
                                    Make Superadmin
                                </button>
                            </div>
                        </div>
                    {/each}
                </div>
            {:else if searchQuery.trim()}
                <p class="text-ds-text-placeholder text-sm">No regular users found matching "{searchQuery}"</p>
            {/if}
        </div>

        <!-- Elevated Users List -->
        <div class="rounded-lg border border-ds-border bg-ds-surface p-6 space-y-4">
            <div class="flex items-center justify-between">
                <h2 class="text-xl font-semibold">Elevated Users</h2>
                <button
                    class="px-4 py-2 bg-ds-surface2 hover:bg-ds-surface-inactive rounded-lg border border-ds-border transition-colors text-sm"
                    onclick={loadElevatedUsers}
                    disabled={loading}
                >
                    {loading ? 'Loading...' : 'Refresh'}
                </button>
            </div>

            {#if loading}
                <p class="text-ds-text-secondary text-sm">Loading elevated users...</p>
            {:else if error}
                <p class="text-red-400 text-sm">{error}</p>
            {:else if elevatedUsers.length === 0}
                <p class="text-ds-text-placeholder text-sm">No elevated users found.</p>
            {:else}
                <div class="overflow-x-auto">
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
                            {#each elevatedUsers as user}
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
                                        <div class="flex justify-center gap-2">
                                            <select
                                                class="rounded-lg border border-ds-border bg-ds-surface2 px-2 py-1 text-xs text-ds-text"
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
                                            </select>
                                        </div>
                                    </td>
                                </tr>
                            {/each}
                        </tbody>
                    </table>
                </div>
            {/if}
        </div>
    </div>
</div>
