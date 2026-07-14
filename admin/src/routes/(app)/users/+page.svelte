<script lang="ts">
    import { onMount } from 'svelte';
    import { base } from '$app/paths';
    import { page as pageStore } from '$app/stores';
    import { api, type components } from '$lib/api';
    import { ensureUser } from '$lib/auth';
    import { Button, TextField, Card } from '$lib/components';

    type AdminUserResponse = components['schemas']['AdminUserResponse'];
    type AdminUserProjectResponse = components['schemas']['AdminUserProjectResponse'];

    let users = $state<AdminUserResponse[]>([]);
    let usersLoading = $state(false);
    let usersLoaded = $state(false);
    let userSearch = $state('');
    type SortMode = 'recent' | 'streak-desc' | 'streak-asc' | 'longest-desc';
    let sortMode = $state<SortMode>('recent');

    // Server-side pagination: the backend searches, sorts, and pages so we
    // never pull the whole user table into the browser.
    const PAGE_SIZE = 50;
    let page = $state(1);
    let total = $state(0);
    let appliedSearch = $state('');
    const totalPages = $derived(Math.max(1, Math.ceil(total / PAGE_SIZE)));

    let currentUserRole = $state<string | null>(null);
    const isSuperadmin = $derived(currentUserRole === 'superadmin');

    // Hours adjustment state (superadmin only)
    let hoursEditingUserId = $state<number | null>(null);
    let hoursDelta = $state('');
    let hoursReason = $state('');
    let hoursSaving = $state(false);
    let hoursError = $state('');
    let hoursLastAdjustment = $state<{
        userId: number;
        hours: number;
        newBalance: number;
    } | null>(null);

    function startHoursEdit(user: AdminUserResponse) {
        hoursEditingUserId = user.userId;
        hoursDelta = '';
        hoursReason = '';
        hoursError = '';
    }

    function cancelHoursEdit() {
        hoursEditingUserId = null;
        hoursDelta = '';
        hoursReason = '';
        hoursError = '';
    }

    async function submitHoursAdjustment(userId: number) {
        const parsed = parseFloat(hoursDelta);
        if (!Number.isFinite(parsed) || parsed === 0) {
            hoursError = 'Enter a non-zero number of hours.';
            return;
        }
        const reason = hoursReason.trim();
        if (!reason) {
            hoursError = 'A reason is required.';
            return;
        }
        const action = parsed > 0 ? 'award' : 'deduct';
        const confirmed =
            typeof window !== 'undefined'
                ? window.confirm(
                      `${action === 'award' ? 'Award' : 'Deduct'} ${Math.abs(parsed)}h ${
                          action === 'award' ? 'to' : 'from'
                      } this user?\n\nReason: ${reason}\n\nThis creates a ledger transaction.`,
                  )
                : true;
        if (!confirmed) return;

        hoursSaving = true;
        hoursError = '';
        try {
            const { data, error } = await (api as any).POST(
                '/api/admin/users/{id}/hours-adjustment',
                {
                    params: { path: { id: userId } },
                    body: { hours: parsed, reason },
                },
            );
            if (error) {
                hoursError = (error as any)?.message || 'Failed to adjust hours';
                return;
            }
            if (data) {
                hoursLastAdjustment = {
                    userId,
                    hours: data.hours,
                    newBalance: data.newBalance,
                };
                // Adjustments land in the ledger as cost = -hours, so earned
                // stays put and spent moves; keep the balance chip in sync.
                users = users.map((u) =>
                    u.userId === userId
                        ? {
                              ...u,
                              balance: data.newBalance,
                              totalSpent:
                                  Math.round((u.totalSpent - data.hours) * 10) / 10,
                          }
                        : u,
                );
                cancelHoursEdit();
            }
        } catch (e) {
            hoursError = 'Failed to adjust hours';
        } finally {
            hoursSaving = false;
        }
    }

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

    let loadSequence = 0;
    async function loadUsers() {
        const seq = ++loadSequence;
        usersLoading = true;
        try {
            const { data, error } = await api.GET('/api/admin/users', {
                params: {
                    query: {
                        page,
                        limit: PAGE_SIZE,
                        q: appliedSearch.trim() || undefined,
                        sort: sortMode,
                    },
                },
            });
            // A newer request (search keystroke, page change) superseded this one.
            if (seq !== loadSequence) return;
            if (error) {
                console.error('Failed to load users:', error);
                return;
            }
            if (data) {
                users = data.users;
                total = data.total;
                usersLoaded = true;
            }
        } finally {
            if (seq === loadSequence) usersLoading = false;
        }
    }

    function goToPage(next: number) {
        page = Math.min(Math.max(1, next), totalPages);
        loadUsers();
    }

    function changeSort() {
        page = 1;
        loadUsers();
    }

    // Debounced server-side search: wait for typing to settle, then reload
    // from page 1. The $effect cleanup cancels the pending timer on each
    // keystroke.
    $effect(() => {
        const q = userSearch;
        if (q === appliedSearch) return;
        const timer = setTimeout(() => {
            appliedSearch = q;
            page = 1;
            loadUsers();
        }, 300);
        return () => clearTimeout(timer);
    });


    // Split text into segments around the active search tokens so the template
    // can wrap hits in <mark>. Token-aware to mirror the backend search, where
    // every whitespace-separated token matches independently ("jane doe"
    // highlights both names). Case-insensitive plain substring per token.
    function highlightSegments(text: string): { text: string; hit: boolean }[] {
        const tokens = appliedSearch
            .trim()
            .toLowerCase()
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 5);
        if (!tokens.length || !text) return [{ text, hit: false }];
        const lower = text.toLowerCase();
        const segments: { text: string; hit: boolean }[] = [];
        let pos = 0;
        while (pos < text.length) {
            // Earliest token match from the current position (longest wins ties
            // so overlapping tokens like "ma" + "manitej" mark the full run).
            let matchIdx = -1;
            let matchLen = 0;
            for (const token of tokens) {
                const idx = lower.indexOf(token, pos);
                if (idx === -1) continue;
                if (matchIdx === -1 || idx < matchIdx || (idx === matchIdx && token.length > matchLen)) {
                    matchIdx = idx;
                    matchLen = token.length;
                }
            }
            if (matchIdx === -1) {
                segments.push({ text: text.slice(pos), hit: false });
                break;
            }
            if (matchIdx > pos) segments.push({ text: text.slice(pos, matchIdx), hit: false });
            segments.push({ text: text.slice(matchIdx, matchIdx + matchLen), hit: true });
            pos = matchIdx + matchLen;
        }
        return segments.length ? segments : [{ text, hit: false }];
    }

    function setUserFlag(userId: number, patch: Partial<AdminUserResponse>) {
        users = users.map((u) => (u.userId === userId ? { ...u, ...patch } : u));
    }

    // Both flag toggles apply optimistically — the button flips immediately and
    // reverts if the server rejects — so the UI doesn't hang on the round trip.
    async function toggleUserFraudFlag(userId: number, currentValue: boolean) {
        setUserFlag(userId, { isFraud: !currentValue });
        try {
            const { data, error } = await api.PUT('/api/admin/users/{id}/fraud-flag', {
                params: { path: { id: userId } },
                body: { isFraud: !currentValue }
            } as any);
            if (error) throw error;
            if (data) setUserFlag(userId, { isFraud: data.isFraud });
        } catch (err) {
            console.error('Failed to toggle fraud flag:', err);
            setUserFlag(userId, { isFraud: currentValue });
        }
    }

    async function toggleSusFlag(userId: number, currentValue: boolean) {
        setUserFlag(userId, { isSus: !currentValue });
        try {
            const { data, error } = await api.PUT('/api/admin/users/{id}/sus-flag', {
                params: { path: { id: userId } },
                body: { isSus: !currentValue }
            } as any);
            if (error) throw error;
            if (data) setUserFlag(userId, { isSus: data.isSus });
        } catch (err) {
            console.error('Failed to toggle sus flag:', err);
            setUserFlag(userId, { isSus: currentValue });
        }
    }

    onMount(() => {
        // Deep-link support: ?q= seeds the search (e.g. the project detail
        // page links here with the owner's email). Applied before the initial
        // load so the list opens pre-filtered without a debounce round-trip.
        const q = $pageStore.url.searchParams.get('q');
        if (q) {
            userSearch = q;
            appliedSearch = q;
        }
        loadUsers();
        ensureUser().then((me) => {
            currentUserRole = me?.role ?? null;
        });
    });
</script>

{#snippet highlighted(text: string)}
    {#each highlightSegments(text) as segment}
        {#if segment.hit}<mark class="rounded-xs bg-yellow-400/50 text-inherit dark:bg-yellow-500/40">{segment.text}</mark>{:else}{segment.text}{/if}
    {/each}
{/snippet}

<div class="p-6"><div class="mx-auto max-w-6xl space-y-6">
<section class="space-y-4">
    <div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <h2 class="text-2xl font-semibold">Users</h2>
        <div class="flex items-center gap-3">
            <TextField
                class="min-w-72"
                placeholder="Search by name, email, Slack ID, Hackatime ID..."
                bind:value={userSearch}
            />
            <select
                class="rounded-md border border-ds-border bg-ds-surface px-3 py-2 text-sm"
                bind:value={sortMode}
                onchange={changeSort}
            >
                <option value="recent">Sort: Most recent</option>
                <option value="streak-desc">Sort: Highest streak</option>
                <option value="streak-asc">Sort: Lowest streak</option>
                <option value="longest-desc">Sort: Longest-ever streak</option>
            </select>
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
            {appliedSearch.trim() ? 'No users match your search.' : 'No users available.'}
        </div>
    {:else}
        <p class="text-sm text-ds-text-secondary">
            Showing {(page - 1) * PAGE_SIZE + 1}–{(page - 1) * PAGE_SIZE + users.length} of {total} users
        </p>
        <div class="grid gap-6">
                {#each users as user (user.userId)}
                    <Card class="p-6 space-y-4 backdrop-blur">

                        <div
                            class="flex flex-col gap-2 md:flex-row md:items-start md:justify-between"
                        >
                            <div>
                                <h3 class="text-xl font-semibold">
                                    {@render highlighted(fullName(user))}
                                    <span class="text-sm font-normal text-ds-text-placeholder">#{user.userId}</span>
                                </h3>
                                <p class="text-sm text-ds-text-secondary">
                                    {@render highlighted(user.email)}
                                </p>
                                <p class="text-sm text-ds-text-secondary">
                                    Slack: <span class={user.slackUserId ? '' : 'text-ds-text-placeholder'}>{#if user.slackUserId}{@render highlighted(user.slackUserId)}{:else}not linked{/if}</span>
                                    <span class="text-ds-text-placeholder">·</span>
                                    Hackatime: <span class={user.hackatimeAccount ? '' : 'text-ds-text-placeholder'}>{#if user.hackatimeAccount}{@render highlighted(user.hackatimeAccount)}{:else}not linked{/if}</span>
                                </p>
                                <a
                                    href="{base}/projects?field=user&q={encodeURIComponent(user.email)}"
                                    class="text-sm text-ds-link hover:underline"
                                    title="Open the projects page filtered to this user"
                                >
                                    Open in Projects →
                                </a>
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
                                <span
                                    class="rounded-full border border-ds-border px-3 py-1"
                                    title="Live Hackatime tracked hours across this user's projects"
                                >
                                    Hackatime: {formatHours(user.totalHackatimeHours)}h
                                </span>
                                <span
                                    class="rounded-full border border-ds-border px-3 py-1"
                                    title="Hours on each project's latest submission — what's been put up for review, regardless of verdict"
                                >
                                    Submitted: {formatHours(user.totalSubmittedHours)}h
                                </span>
                                <span
                                    class="rounded-full border border-ds-border px-3 py-1"
                                    title="Approved hours earned across this user's projects"
                                >
                                    Approved: {formatHours(user.totalApprovedHours)}h
                                </span>
                                <span
                                    class="rounded-full border border-ds-border px-3 py-1"
                                    title="Spendable balance = approved hours earned minus unrefunded ledger spend"
                                >
                                    Balance: {formatHours(user.balance)}h
                                    <span class="text-ds-text-placeholder">· spent {formatHours(user.totalSpent)}</span>
                                </span>
                                <span
                                    class="rounded-full border border-ds-border px-3 py-1"
                                    title={(user as any).lastActiveDate
                                        ? `Last active: ${formatDate((user as any).lastActiveDate)}${(user as any).timezone ? ` (${(user as any).timezone})` : ''}`
                                        : 'No activity yet'}
                                >
                                    🔥 {(user as any).currentStreak ?? 0}d
                                    {#if ((user as any).longestStreak ?? 0) > 0}
                                        <span class="text-ds-text-placeholder">· best {(user as any).longestStreak}d</span>
                                    {/if}
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
                                    Referral code: {(user as any).referralCode ?? '—'}
                                </p>
                                <p>
                                    Referred by: {(user as any).referredByUserId ? `User #${(user as any).referredByUserId}` : '—'}
                                </p>
                                    {#if startDateEditingUserId === user.userId}
                                    <div
                                        class="space-y-2 p-3 bg-ds-surface2 rounded-lg border border-ds-border"
                                    >
                                        <label class="block text-xs text-ds-text-secondary" for="startdate-{user.userId}">
                                            Hackatime Start Date (overrides global cutoff; leave blank to clear)
                                        </label>
                                        <p class="rounded-md border border-yellow-600 bg-yellow-500/15 px-2 py-1.5 text-[12px] text-yellow-800 dark:text-yellow-200 leading-snug">
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
                                            <p class="text-xs text-ds-red">{startDateError}</p>
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
                                {:else if (user as any).hackatimeStartDate}
                                    <div class="rounded-md border border-yellow-600 bg-yellow-500/15 px-2 py-1.5 text-[12px] text-yellow-800 dark:text-yellow-200 flex items-center gap-2 flex-wrap">
                                        <span class="font-semibold">
                                            ⚠ Custom Hackatime start: {toDateInputValue((user as any).hackatimeStartDate)}
                                        </span>
                                        <span>
                                            — hours include activity since this admin-set date, not the default cutoff.
                                        </span>
                                        <Button variant="ghost" onclick={() => startDateEdit(user)}>
                                            Edit
                                        </Button>
                                    </div>
                                {:else}
                                    <div class="flex items-center gap-2">
                                        <span class="text-ds-text-placeholder">
                                            Hackatime start: default cutoff
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
                                        ? 'bg-red-600/20 border-red-500 text-red-700 dark:text-red-300 hover:bg-red-600/30'
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
                                        ? 'bg-yellow-600/20 border-yellow-500 text-yellow-700 dark:text-yellow-300 hover:bg-yellow-600/30'
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

                        {#if isSuperadmin}
                            <div class="rounded-xl border border-purple-500/40 bg-purple-500/5 p-4 space-y-3">
                                <div class="flex items-center justify-between">
                                    <h4 class="text-sm font-semibold text-purple-700 dark:text-purple-300">
                                        Hours adjustment (superadmin)
                                    </h4>
                                    {#if hoursLastAdjustment?.userId === user.userId}
                                        <span class="text-xs text-purple-700 dark:text-purple-300">
                                            Last: {hoursLastAdjustment.hours > 0 ? '+' : ''}{hoursLastAdjustment.hours}h
                                            · new balance {hoursLastAdjustment.newBalance}h
                                        </span>
                                    {/if}
                                </div>
                                {#if hoursEditingUserId === user.userId}
                                    <div class="space-y-2">
                                        <p class="text-xs text-ds-text-secondary">
                                            Positive = award hours, negative = deduct hours. Recorded in the transactions ledger and refundable from there.
                                        </p>
                                        <div class="flex flex-wrap gap-2">
                                            <TextField
                                                class="w-32"
                                                placeholder="e.g. 5 or -2"
                                                bind:value={hoursDelta}
                                            />
                                            <TextField
                                                class="flex-1 min-w-50"
                                                placeholder="Reason (visible in ledger)"
                                                bind:value={hoursReason}
                                            />
                                            <Button
                                                variant="approve"
                                                onclick={() => submitHoursAdjustment(user.userId)}
                                                disabled={hoursSaving}
                                            >
                                                {hoursSaving ? 'Saving…' : 'Apply'}
                                            </Button>
                                            <Button variant="ghost" onclick={cancelHoursEdit} disabled={hoursSaving}>
                                                Cancel
                                            </Button>
                                        </div>
                                        {#if hoursError}
                                            <p class="text-xs text-ds-red">{hoursError}</p>
                                        {/if}
                                    </div>
                                {:else}
                                    <Button variant="ghost" onclick={() => startHoursEdit(user)}>
                                        Adjust hours
                                    </Button>
                                {/if}
                            </div>
                        {/if}

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
                                                        <a href="{base}/projects/{project.projectId}" class="hover:underline">{project.projectTitle}</a>
                                                        <span class="text-xs font-normal text-ds-text-placeholder">#{project.projectId}</span>
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
        {#if totalPages > 1}
            <div class="flex items-center justify-center gap-4 pt-4">
                <Button
                    variant="default"
                    onclick={() => goToPage(page - 1)}
                    disabled={page <= 1 || usersLoading}
                >
                    Previous
                </Button>
                <span class="text-sm text-ds-text-secondary">
                    Page {page} of {totalPages}
                </span>
                <Button
                    variant="default"
                    onclick={() => goToPage(page + 1)}
                    disabled={page >= totalPages || usersLoading}
                >
                    Next
                </Button>
            </div>
        {/if}
    {/if}
</section>
</div></div>
