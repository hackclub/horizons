<script lang="ts">
    import { onMount } from 'svelte';
    import { api, type components } from '$lib/api';
    import { Button, TextField, Card } from '$lib/components';

    type AdminUserResponse = components['schemas']['AdminUserResponse'];
    type AdminUserProjectResponse = components['schemas']['AdminUserProjectResponse'];
    type SlackLookupResponse = components['schemas']['SlackLookupResponse'];

    let users = $state<AdminUserResponse[]>([]);
    let usersLoading = $state(false);
    let usersLoaded = $state(false);
    let userSearch = $state('');

    // Slack editing state
    let slackEditingUserId = $state<number | null>(null);
    let slackEditValue = $state('');
    let slackLookupLoading = $state(false);
    let slackSaving = $state(false);
    let slackError = $state('');
    let slackLookupResult = $state<SlackLookupResponse | null>(null);

    // Hackatime start date editing state
    let startDateEditingUserId = $state<number | null>(null);
    let startDateEditValue = $state('');
    let startDateSaving = $state(false);
    let startDateError = $state('');

    function toDateInputValue(value: string | Date | null | undefined): string {
        if (!value) return '';
        const d = typeof value === 'string' ? new Date(value) : value;
        if (isNaN(d.getTime())) return '';
        return d.toISOString().split('T')[0];
    }

    function startDateEdit(user: AdminUserResponse) {
        startDateEditingUserId = user.userId;
        startDateEditValue = toDateInputValue((user as any).hackatimeStartDate);
        startDateError = '';
    }

    function cancelStartDateEdit() {
        startDateEditingUserId = null;
        startDateEditValue = '';
        startDateError = '';
    }

    async function saveStartDate(userId: number) {
        startDateSaving = true;
        startDateError = '';
        try {
            const body: { hackatimeStartDate: string | null } = {
                hackatimeStartDate: startDateEditValue
                    ? new Date(startDateEditValue).toISOString()
                    : null,
            };
            const { data, error } = await (api as any).PATCH('/api/admin/users/{id}', {
                params: { path: { id: userId } },
                body,
            });
            if (error) {
                startDateError = (error as any)?.message || 'Failed to save';
                return;
            }
            if (data) {
                users = users.map((u) =>
                    u.userId === userId
                        ? { ...u, hackatimeStartDate: data.hackatimeStartDate }
                        : u,
                );
                cancelStartDateEdit();
            }
        } catch (e) {
            startDateError = 'Failed to save start date';
        } finally {
            startDateSaving = false;
        }
    }

    function formatDate(value: string) {
        return new Date(value).toLocaleString();
    }

    function formatHours(value: number | null) {
        if (value === null || value === undefined) {
            return '—';
        }
        return value.toFixed(1);
    }

    function fullName(user: AdminUserResponse) {
        const first = user.firstName ?? '';
        const last = user.lastName ?? '';
        const name = `${first} ${last}`.trim();
        return name || 'Unknown';
    }

    let usersLoadPromise: Promise<void> | null = null;
    async function loadUsers() {
        if (usersLoading && usersLoadPromise) {
            return usersLoadPromise;
        }
        usersLoading = true;
        usersLoadPromise = (async () => {
            try {
                const { data, error } = await api.GET('/api/admin/users');
                if (error) {
                    console.error('Failed to load users:', error);
                    return;
                }
                if (data) {
                    users = data;
                    usersLoaded = true;
                }
            } finally {
                usersLoading = false;
                usersLoadPromise = null;
            }
        })();
        return usersLoadPromise;
    }

    function startSlackEdit(user: AdminUserResponse) {
        slackEditingUserId = user.userId;
        slackEditValue = user.slackUserId ?? '';
        slackError = '';
        slackLookupResult = null;
    }

    function cancelSlackEdit() {
        slackEditingUserId = null;
        slackEditValue = '';
        slackError = '';
        slackLookupResult = null;
    }

    async function lookupSlackByEmail(email: string) {
        slackLookupLoading = true;
        slackError = '';
        slackLookupResult = null;
        try {
            const { data, error } = await api.GET('/api/admin/slack/lookup-by-email', {
                params: { query: { email } }
            } as any);
            if (error) {
                slackError = 'Failed to lookup Slack user';
                return;
            }
            if (data) {
                slackLookupResult = data;
                if (data.found && data.slackUserId) {
                    slackEditValue = data.slackUserId;
                }
            }
        } catch (e) {
            slackError = 'Failed to lookup Slack user';
        } finally {
            slackLookupLoading = false;
        }
    }

    async function saveSlackId(userId: number) {
        slackSaving = true;
        slackError = '';
        try {
            const { data, error } = await api.PUT('/api/admin/users/{id}/slack', {
                params: { path: { id: userId } },
                body: { slackUserId: slackEditValue.trim() || null }
            } as any);
            if (error) {
                slackError = (error as any)?.message || 'Failed to save';
                return;
            }
            if (data) {
                users = users.map((u) =>
                    u.userId === userId
                        ? { ...u, slackUserId: data.slackUserId }
                        : u
                );
                cancelSlackEdit();
            }
        } catch (e) {
            slackError = 'Failed to save Slack ID';
        } finally {
            slackSaving = false;
        }
    }

    async function toggleUserFraudFlag(userId: number, currentValue: boolean) {
        try {
            const { data, error } = await api.PUT('/api/admin/users/{id}/fraud-flag', {
                params: { path: { id: userId } },
                body: { isFraud: !currentValue }
            } as any);
            if (error) {
                console.error('Failed to toggle fraud flag:', error);
                return;
            }
            if (data) {
                users = users.map((u) =>
                    u.userId === userId
                        ? { ...u, isFraud: data.isFraud }
                        : u
                );
            }
        } catch (err) {
            console.error('Failed to toggle fraud flag:', err);
        }
    }

    async function toggleSusFlag(userId: number, currentValue: boolean) {
        try {
            const { data, error } = await api.PUT('/api/admin/users/{id}/sus-flag', {
                params: { path: { id: userId } },
                body: { isSus: !currentValue }
            } as any);
            if (error) {
                console.error('Failed to toggle sus flag:', error);
                return;
            }
            if (data) {
                users = users.map((u) =>
                    u.userId === userId
                        ? { ...u, isSus: data.isSus }
                        : u
                );
            }
        } catch (err) {
            console.error('Failed to toggle sus flag:', err);
        }
    }

    let filteredUsers = $derived(() => {
        if (!userSearch.trim()) return users;
        const query = userSearch.toLowerCase().trim();
        return users.filter((user) => {
            const name = fullName(user).toLowerCase();
            const email = user.email.toLowerCase();
            const slack = (user.slackUserId ?? '').toLowerCase();
            return name.includes(query) || email.includes(query) || slack.includes(query);
        });
    });

    onMount(() => {
        loadUsers();
    });
</script>

<div class="p-6"><div class="mx-auto max-w-6xl space-y-6">
<section class="space-y-4">
    <div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <h2 class="text-2xl font-semibold">Users</h2>
        <div class="flex items-center gap-3">
            <TextField
                placeholder="Search users..."
                bind:value={userSearch}
            />
            <Button variant="default" onclick={loadUsers}>
                Refresh
            </Button>
        </div>
    </div>

    {#if usersLoading}
        <div class="py-12 text-center text-ds-text-secondary">
            Loading users...
        </div>
    {:else if users.length === 0}
        <div class="py-12 text-center text-ds-text-secondary">
            No users available.
        </div>
    {:else}
        {#if userSearch.trim() && filteredUsers().length === 0}
            <div class="py-12 text-center text-ds-text-secondary">
                No users match your search.
            </div>
        {:else}
            <p class="text-sm text-ds-text-secondary">
                Showing {filteredUsers().length} of {users.length} users
            </p>
            <div class="grid gap-6">
                {#each filteredUsers() as user (user.userId)}
                    <Card class="p-6 space-y-4 backdrop-blur">

                        <div
                            class="flex flex-col gap-2 md:flex-row md:items-start md:justify-between"
                        >
                            <div>
                                <h3 class="text-xl font-semibold">
                                    {fullName(user)}
                                    <span class="text-sm font-normal text-ds-text-placeholder">#{user.userId}</span>
                                </h3>
                                <p class="text-sm text-ds-text-secondary">
                                    {user.email}
                                </p>
                            </div>
                            <div
                                class="flex flex-wrap gap-2 text-sm text-ds-text-secondary"
                            >
                                <span
                                    class="rounded-full border border-ds-border px-3 py-1 capitalize"
                                >{user.role}</span>
                                <span
                                    class="rounded-full border border-ds-border px-3 py-1"
                                >{(user as any).onboardComplete
                                    ? 'Onboarding complete'
                                    : 'Onboarding pending'}</span>
                                <span
                                    class="rounded-full border border-ds-border px-3 py-1"
                                >
                                    Projects: {user.projects.length}
                                </span>
                            </div>
                        </div>

                        <div
                            class="grid gap-4 md:grid-cols-3 text-sm text-ds-text-secondary"
                        >
                            <div>
                                <p>
                                    Joined {formatDate(user.createdAt)}
                                </p>
                                <p>
                                    Updated {formatDate(user.updatedAt)}
                                </p>
                            </div>
                            <div>
                                <p>{user.addressLine1}</p>
                                <p>{user.addressLine2}</p>
                                <p>
                                    {[
                                        user.city,
                                        user.state,
                                        user.zipCode,
                                    ]
                                        .filter(Boolean)
                                        .join(', ')}
                                </p>
                                <p>{user.country}</p>
                            </div>
                            <div class="space-y-2">
                                <p>
                                    Hackatime: {user.hackatimeAccount ?? 'Not linked'}
                                </p>
                                <p>
                                    Referral code: {(user as any).referralCode ?? '—'}
                                </p>
                                <p>
                                    Referred by: {(user as any).referredByUserId ? `User #${(user as any).referredByUserId}` : '—'}
                                </p>
                                {#if slackEditingUserId === user.userId}
                                    <div
                                        class="space-y-2 p-3 bg-ds-surface2 rounded-lg border border-ds-border"
                                    >
                                        <div class="flex gap-2">
                                            <TextField
                                                class="flex-1 text-xs"
                                                placeholder="Slack User ID (e.g., U12345678)"
                                                bind:value={slackEditValue}
                                            />
                                            <Button
                                                class="bg-blue-600 hover:bg-blue-500 text-white border-none"
                                                onclick={() =>
                                                    lookupSlackByEmail(
                                                        user.email,
                                                    )}
                                                disabled={slackLookupLoading}
                                            >
                                                {slackLookupLoading
                                                    ? '...'
                                                    : 'Lookup'}
                                            </Button>
                                        </div>
                                        {#if slackLookupResult}
                                            <p
                                                class="text-xs {slackLookupResult.found
                                                    ? 'text-green-700'
                                                    : 'text-yellow-600'}"
                                            >
                                                {slackLookupResult.found
                                                    ? `Found: ${slackLookupResult.displayName}`
                                                    : slackLookupResult.message}
                                            </p>
                                        {/if}
                                        {#if slackError}
                                            <p
                                                class="text-xs text-red-600"
                                            >
                                                {slackError}
                                            </p>
                                        {/if}
                                        <div class="flex gap-2">
                                            <Button
                                                variant="approve"
                                                onclick={() =>
                                                    saveSlackId(
                                                        user.userId,
                                                    )}
                                                disabled={slackSaving}
                                            >
                                                {slackSaving
                                                    ? 'Saving...'
                                                    : 'Save'}
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                onclick={cancelSlackEdit}
                                            >
                                                Cancel
                                            </Button>
                                        </div>
                                    </div>
                                {:else}
                                    <div
                                        class="flex items-center gap-2"
                                    >
                                        <span
                                            class={user.slackUserId
                                                ? 'text-green-700'
                                                : 'text-ds-text-placeholder'}
                                        >
                                            Slack: {user.slackUserId
                                                ? user.slackUserId
                                                : 'Not linked'}
                                        </span>
                                        <Button
                                            variant="ghost"
                                            onclick={() =>
                                                startSlackEdit(user)}
                                        >
                                            Edit
                                        </Button>
                                    </div>
                                {/if}
                                {#if startDateEditingUserId === user.userId}
                                    <div
                                        class="space-y-2 p-3 bg-ds-surface2 rounded-lg border border-ds-border"
                                    >
                                        <label class="block text-xs text-ds-text-secondary" for="startdate-{user.userId}">
                                            Hackatime Start Date (overrides global cutoff; leave blank to clear)
                                        </label>
                                        <p class="text-[11px] text-yellow-600 dark:text-yellow-400 leading-snug">
                                            ⚠ Setting this widens the Hackatime time window for <em>all</em> of this user's linked projects, not just CSV-imported ones.
                                            Any post-cutoff project they link manually will also get credit for pre-cutoff activity on that project.
                                            Only set this for admin-curated backfill users.
                                        </p>
                                        <input
                                            id="startdate-{user.userId}"
                                            type="date"
                                            class="rounded-lg border border-ds-border bg-ds-surface2 px-3 py-1.5 text-sm text-ds-text"
                                            bind:value={startDateEditValue}
                                        />
                                        {#if startDateError}
                                            <p class="text-xs text-red-600">{startDateError}</p>
                                        {/if}
                                        <div class="flex gap-2">
                                            <Button
                                                variant="approve"
                                                onclick={() => saveStartDate(user.userId)}
                                                disabled={startDateSaving}
                                            >
                                                {startDateSaving ? 'Saving...' : 'Save & Recalc'}
                                            </Button>
                                            <Button variant="ghost" onclick={cancelStartDateEdit}>
                                                Cancel
                                            </Button>
                                        </div>
                                    </div>
                                {:else}
                                    <div class="flex items-center gap-2">
                                        <span
                                            class={(user as any).hackatimeStartDate
                                                ? 'text-green-700'
                                                : 'text-ds-text-placeholder'}
                                        >
                                            Hackatime start: {(user as any).hackatimeStartDate
                                                ? toDateInputValue((user as any).hackatimeStartDate)
                                                : 'default cutoff'}
                                        </span>
                                        <Button variant="ghost" onclick={() => startDateEdit(user)}>
                                            Edit
                                        </Button>
                                    </div>
                                {/if}
                            </div>
                        </div>

                        <!-- Fraud / Sus flag toggles -->
                        <div class="flex flex-wrap gap-3">
                            <Button
                                class={`px-3 py-2 text-sm transition-colors ${
                                    user.isFraud
                                        ? 'bg-red-600/20 border-red-500 text-red-600 hover:bg-red-600/30'
                                        : 'bg-ds-surface2 border-ds-border text-ds-text-secondary hover:bg-ds-surface-inactive'
                                }`}
                                onclick={() =>
                                    toggleUserFraudFlag(
                                        user.userId,
                                        user.isFraud,
                                    )}
                            >
                                {user.isFraud
                                    ? 'Fraud Flagged'
                                    : 'Flag as Fraud'}
                            </Button>
                            <Button
                                class={`px-3 py-2 text-sm transition-colors ${
                                    user.isSus
                                        ? 'bg-yellow-600/20 border-yellow-500 text-yellow-600 hover:bg-yellow-600/30'
                                        : 'bg-ds-surface2 border-ds-border text-ds-text-secondary hover:bg-ds-surface-inactive'
                                }`}
                                onclick={() =>
                                    toggleSusFlag(
                                        user.userId,
                                        user.isSus,
                                    )}
                            >
                                {user.isSus
                                    ? 'Sus Flagged'
                                    : 'Flag as Sus'}
                            </Button>
                        </div>

                        {#if user.projects.length > 0}
                            <div class="space-y-3">
                                <h4
                                    class="text-sm font-semibold uppercase tracking-wide text-ds-text-secondary"
                                >
                                    Projects
                                </h4>
                                <div class="grid gap-3">
                                    {#each user.projects as project (project.projectId)}
                                        <div
                                            class="rounded-xl border border-ds-border bg-ds-surface2/60 p-4 space-y-2"
                                        >
                                            <div
                                                class="flex flex-col gap-2 md:flex-row md:items-start md:justify-between"
                                            >
                                                <div>
                                                    <p
                                                        class="font-medium"
                                                    >
                                                        {project.projectTitle}
                                                    </p>
                                                    <p
                                                        class="text-xs uppercase tracking-wide text-ds-text-secondary"
                                                    >
                                                        {project.projectType}
                                                    </p>
                                                </div>
                                                <div
                                                    class="flex flex-wrap gap-2 text-xs text-ds-text-secondary"
                                                >
                                                    <span
                                                        class="rounded-full border border-ds-border px-2 py-1"
                                                    >Hackatime {formatHours(
                                                        project.nowHackatimeHours,
                                                    )}</span>
                                                    {#if project.isFraud}
                                                        <span
                                                            class="rounded-full border border-red-500 bg-red-600/20 text-red-600 px-2 py-1"
                                                        >Fraud</span>
                                                    {/if}
                                                    <span
                                                        class="rounded-full border border-ds-border px-2 py-1"
                                                    >{project.isLocked ? "Locked" : "Unlocked"}</span>
                                                </div>
                                            </div>
                                            {#if project.submissions.length > 0}
                                                <p
                                                    class="text-xs text-ds-text-secondary"
                                                >
                                                    Latest submission: {project
                                                        .submissions[0]
                                                        .approvalStatus}
                                                    &bull; {formatDate(
                                                        project
                                                            .submissions[0]
                                                            .createdAt,
                                                    )}
                                                </p>
                                            {:else}
                                                <p
                                                    class="text-xs text-ds-text-placeholder"
                                                >
                                                    No submissions yet.
                                                </p>
                                            {/if}
                                        </div>
                                    {/each}
                                </div>
                            </div>
                        {/if}
                    </Card>
                {/each}
            </div>
        {/if}
    {/if}
</section>
</div></div>
