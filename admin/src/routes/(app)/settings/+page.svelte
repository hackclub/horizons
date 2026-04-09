<script lang="ts">
    import { onMount } from 'svelte';
    import { api, type components } from '$lib/api';
    import { Button, Card } from '$lib/components';

    type ReviewerLeaderboardEntry = components['schemas']['ReviewerLeaderboardEntry'];
    type PriorityUserResponse = components['schemas']['PriorityUserResponse'];
    type GlobalSettingsResponse = components['schemas']['GlobalSettingsResponse'];

    // Global settings state
    let globalSettings = $state<GlobalSettingsResponse | null>(null);
    let globalSettingsLoading = $state(false);

    // Recalculate state
    let recalcAllBusy = $state(false);
    let recalcMessage = $state('');
    let recalcError = $state('');

    // Backfill state
    let backfillBusy = $state(false);
    let backfillMessage = $state('');
    let backfillError = $state('');
    let backfillDays = $state('30');

    // Reviewer leaderboard state
    let reviewerLeaderboard = $state<ReviewerLeaderboardEntry[]>([]);
    let leaderboardLoading = $state(false);
    let leaderboardLoaded = $state(false);

    // Priority users state
    let priorityUsers = $state<PriorityUserResponse[]>([]);
    let priorityUsersLoading = $state(false);
    let priorityUsersLoaded = $state(false);

    function formatDate(value: string) {
        return new Date(value).toLocaleString();
    }

    async function loadGlobalSettings() {
        globalSettingsLoading = true;
        try {
            const { data, error } = await api.GET('/api/admin/settings');
            if (error) {
                console.error('Failed to load global settings:', error);
                return;
            }
            globalSettings = data;
        } catch (err) {
            console.error('Failed to load global settings:', err);
        } finally {
            globalSettingsLoading = false;
        }
    }

    async function toggleGlobalSubmissionsFrozen() {
        if (!globalSettings) return;
        globalSettingsLoading = true;
        try {
            const { data, error } = await api.PUT('/api/admin/settings/submissions-frozen', {
                body: { submissionsFrozen: !globalSettings.submissionsFrozen }
            });
            if (error) {
                console.error('Failed to toggle submissions frozen:', error);
                return;
            }
            globalSettings = data;
        } catch (err) {
            console.error('Failed to toggle submissions frozen:', err);
        } finally {
            globalSettingsLoading = false;
        }
    }

    async function loadReviewerLeaderboard() {
        leaderboardLoading = true;
        try {
            const { data, error } = await api.GET('/api/admin/reviewer-leaderboard');
            if (error) {
                console.error('Failed to load reviewer leaderboard:', error);
                return;
            }
            reviewerLeaderboard = data;
            leaderboardLoaded = true;
        } catch (err) {
            console.error('Failed to load reviewer leaderboard:', err);
        } finally {
            leaderboardLoading = false;
        }
    }

    async function loadPriorityUsers() {
        priorityUsersLoading = true;
        try {
            const { data, error } = await api.GET('/api/admin/priority-users');
            if (error) {
                console.error('Failed to load priority users:', error);
                return;
            }
            priorityUsers = data;
            priorityUsersLoaded = true;
        } catch (err) {
            console.error('Failed to load priority users:', err);
        } finally {
            priorityUsersLoading = false;
        }
    }

    async function runBackfill() {
        if (backfillBusy) return;
        backfillBusy = true;
        backfillMessage = '';
        backfillError = '';
        try {
            const days = parseInt(backfillDays) || 30;
            const endDate = new Date();
            endDate.setUTCDate(endDate.getUTCDate() - 1);
            const startDate = new Date(endDate);
            startDate.setUTCDate(startDate.getUTCDate() - days + 1);
            const { data, error } = await api.POST('/api/admin/stats/backfill', {
                params: { query: {
                    startDate: startDate.toISOString().split('T')[0],
                    endDate: endDate.toISOString().split('T')[0],
                } },
            });
            if (error) { backfillError = 'Backfill failed'; return; }
            backfillMessage = `Backfilled ${data?.results?.length ?? 0} days.`;
        } catch (err) {
            backfillError = err instanceof Error ? err.message : 'Backfill failed';
        } finally {
            backfillBusy = false;
        }
    }

    async function recalculateAllProjects() {
        if (recalcAllBusy) return;
        recalcAllBusy = true;
        recalcMessage = '';
        recalcError = '';
        try {
            const { data: body, error } = await api.POST('/api/admin/projects/recalculate-all');
            if (error) { recalcError = 'Failed to recalculate projects'; return; }
            const updatedCount = body?.updated ?? 0;
            recalcMessage = `Recalculated ${updatedCount} project${updatedCount === 1 ? '' : 's'}.`;
        } catch (err) {
            recalcError = err instanceof Error ? err.message : 'Failed to recalculate projects';
        } finally {
            recalcAllBusy = false;
        }
    }

    onMount(() => {
        loadGlobalSettings();
        loadReviewerLeaderboard();
        loadPriorityUsers();
    });
</script>

<div class="p-6"><div class="mx-auto max-w-6xl space-y-6">
<div class="space-y-8">
    <h1 class="text-3xl font-bold">Settings</h1>

    <!-- Global Settings Section -->
    <Card class="p-6 space-y-4">
        <h2 class="text-xl font-semibold flex items-center gap-2">
            Global Settings
        </h2>

        {#if globalSettingsLoading && !globalSettings}
            <p class="text-ds-text-secondary text-sm">Loading settings...</p>
        {:else if globalSettings}
            <div class="space-y-4">
                <div class="flex items-center justify-between rounded-xl border border-ds-border bg-ds-surface2/50 p-4">
                    <div>
                        <p class="font-medium text-ds-text">Submissions Frozen</p>
                        <p class="text-sm text-ds-text-secondary">
                            When enabled, users cannot submit or resubmit projects.
                        </p>
                    </div>
                    <Button
                        variant="ghost"
                        class={globalSettings.submissionsFrozen
                            ? 'bg-blue-600/20 border-blue-500 text-ds-link hover:bg-blue-600/30'
                            : ''}
                        onclick={toggleGlobalSubmissionsFrozen}
                        disabled={globalSettingsLoading}
                    >
                        {#if globalSettingsLoading}
                            <span class="animate-spin">⟳</span>
                        {:else}
                            <span>{globalSettings.submissionsFrozen ? '🧊' : '▶️'}</span>
                        {/if}
                        {globalSettings.submissionsFrozen ? 'Submissions Frozen' : 'Freeze All Submissions'}
                    </Button>
                </div>

                {#if globalSettings.submissionsFrozen}
                    <div class="rounded-xl border border-blue-500 bg-blue-600/10 p-4 flex items-center gap-3">
                        <span class="text-2xl">🧊</span>
                        <div>
                            <p class="font-semibold text-ds-link">
                                Submissions are currently frozen
                            </p>
                            <p class="text-sm text-blue-400">
                                Users cannot submit or resubmit projects until unfrozen.
                            </p>
                            {#if globalSettings.submissionsFrozenAt}
                                <p class="text-xs text-blue-500 mt-1">
                                    Frozen at: {formatDate(globalSettings.submissionsFrozenAt)}
                                    {#if globalSettings.submissionsFrozenBy}
                                        by {globalSettings.submissionsFrozenBy}
                                    {/if}
                                </p>
                            {/if}
                        </div>
                    </div>
                {/if}
            </div>
        {:else}
            <p class="text-ds-text-secondary text-sm">Failed to load settings.</p>
        {/if}
    </Card>

    <!-- Project Actions -->
    <Card class="p-6 space-y-4">
        <h2 class="text-xl font-semibold">Project Actions</h2>
        <div class="flex items-center gap-3">
            <Button onclick={recalculateAllProjects} disabled={recalcAllBusy}>
                {recalcAllBusy ? 'Recalculating...' : 'Recalculate all projects'}
            </Button>
            {#if recalcError}
                <span class="text-xs text-red-600">{recalcError}</span>
            {:else if recalcMessage}
                <span class="text-xs text-green-700">{recalcMessage}</span>
            {/if}
        </div>
        <p class="text-sm text-ds-text-secondary">
            Recalculates Hackatime hours for all projects by fetching the latest data from the Hackatime API.
        </p>
    </Card>

    <!-- Metrics Backfill -->
    <Card class="p-6 space-y-4">
        <h2 class="text-xl font-semibold">Metrics Backfill</h2>
        <p class="text-sm text-ds-text-secondary">
            Populate historical metrics for the stats dashboard charts. DAU will be 0 for backfilled dates since the Hackatime API cannot provide retroactive daily activity.
        </p>
        <div class="flex items-center gap-3">
            <label class="text-sm text-ds-text-secondary" for="backfill-days">Days to backfill:</label>
            <input
                id="backfill-days"
                type="number"
                min="1"
                max="365"
                bind:value={backfillDays}
                class="w-20 rounded-md border border-ds-border bg-ds-surface px-3 py-1.5 text-sm text-ds-text"
            />
            <Button onclick={runBackfill} disabled={backfillBusy}>
                {backfillBusy ? 'Running...' : 'Run Backfill'}
            </Button>
            {#if backfillError}
                <span class="text-xs text-red-600">{backfillError}</span>
            {:else if backfillMessage}
                <span class="text-xs text-green-700">{backfillMessage}</span>
            {/if}
        </div>
    </Card>

    <!-- Reviewer Leaderboard Section -->
    <Card class="p-6 space-y-4">
        <div class="flex items-center justify-between">
            <h2 class="text-xl font-semibold flex items-center gap-2">
                🏆 Reviewer Leaderboard
            </h2>
            <Button variant="ghost" onclick={loadReviewerLeaderboard} disabled={leaderboardLoading}>
                {leaderboardLoading
                    ? 'Loading...'
                    : leaderboardLoaded
                      ? 'Refresh'
                      : 'Load Leaderboard'}
            </Button>
        </div>

        {#if leaderboardLoaded && reviewerLeaderboard.length > 0}
            <div class="overflow-x-auto">
                <table class="w-full">
                    <thead class="bg-ds-surface2/50">
                        <tr>
                            <th class="px-4 py-3 text-left text-sm font-semibold text-ds-text-secondary">#</th>
                            <th class="px-4 py-3 text-left text-sm font-semibold text-ds-text-secondary">Reviewer</th>
                            <th class="px-4 py-3 text-center text-sm font-semibold text-green-700">Approved</th>
                            <th class="px-4 py-3 text-center text-sm font-semibold text-red-600">Rejected</th>
                            <th class="px-4 py-3 text-center text-sm font-semibold text-purple-400">Total</th>
                            <th class="px-4 py-3 text-left text-sm font-semibold text-ds-text-secondary">Last Review</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-700">
                        {#each reviewerLeaderboard as reviewer, index}
                            <tr
                                class="hover:bg-ds-surface2/30 {index === 0
                                    ? 'bg-yellow-500/10'
                                    : index === 1
                                      ? 'bg-gray-400/10'
                                      : index === 2
                                        ? 'bg-amber-600/10'
                                        : ''}"
                            >
                                <td
                                    class="px-4 py-3 text-sm font-bold {index === 0
                                        ? 'text-yellow-600'
                                        : index === 1
                                          ? 'text-ds-text-secondary'
                                          : index === 2
                                            ? 'text-amber-500'
                                            : 'text-ds-text-secondary'}"
                                >
                                    {#if index === 0}🥇{:else if index === 1}🥈{:else if index === 2}🥉{:else}{index + 1}{/if}
                                </td>
                                <td class="px-4 py-3">
                                    <p class="text-sm font-medium text-ds-text">
                                        {reviewer.firstName || ''} {reviewer.lastName || ''}
                                    </p>
                                    <p class="text-xs text-ds-text-secondary">
                                        {reviewer.email || `ID: ${reviewer.reviewerId}`}
                                    </p>
                                </td>
                                <td class="px-4 py-3 text-center text-sm font-semibold text-green-700">
                                    {reviewer.approved}
                                </td>
                                <td class="px-4 py-3 text-center text-sm font-semibold text-red-600">
                                    {reviewer.rejected}
                                </td>
                                <td class="px-4 py-3 text-center text-sm font-bold text-purple-400">
                                    {reviewer.total}
                                </td>
                                <td class="px-4 py-3 text-sm text-ds-text-secondary">
                                    {reviewer.lastReviewedAt
                                        ? formatDate(reviewer.lastReviewedAt)
                                        : '—'}
                                </td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            </div>
        {:else if leaderboardLoaded}
            <p class="text-ds-text-secondary text-sm">No reviews recorded yet.</p>
        {:else if leaderboardLoading}
            <p class="text-ds-text-secondary text-sm">Loading leaderboard...</p>
        {:else}
            <p class="text-ds-text-placeholder text-sm">
                Click "Load Leaderboard" to see reviewer stats.
            </p>
        {/if}
    </Card>

    <!-- Priority Users Section -->
    <Card class="p-6 space-y-4">
        <div class="flex items-center justify-between">
            <h2 class="text-xl font-semibold flex items-center gap-2">
                Priority Users (50+ approved hours)
            </h2>
            <Button variant="ghost" onclick={loadPriorityUsers} disabled={priorityUsersLoading}>
                {priorityUsersLoading
                    ? 'Loading...'
                    : priorityUsersLoaded
                      ? 'Refresh'
                      : 'Load Priority Users'}
            </Button>
        </div>

        {#if priorityUsersLoaded && priorityUsers.length > 0}
            <div class="text-sm text-ds-text-secondary mb-2">
                {priorityUsers.length} priority user{priorityUsers.length !== 1 ? 's' : ''} found
            </div>
            <div class="overflow-x-auto">
                <table class="w-full">
                    <thead class="bg-ds-surface2/50">
                        <tr>
                            <th class="px-4 py-3 text-left text-sm font-semibold text-ds-text-secondary">User</th>
                            <th class="px-4 py-3 text-left text-sm font-semibold text-ds-text-secondary">Email</th>
                            <th class="px-4 py-3 text-center text-sm font-semibold text-green-700">Approved Hours</th>
                            <th class="px-4 py-3 text-center text-sm font-semibold text-yellow-600">Potential Hours</th>
                            <th class="px-4 py-3 text-left text-sm font-semibold text-ds-text-secondary">Reason</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-700">
                        {#each priorityUsers as user}
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
                                <td class="px-4 py-3 text-center text-sm font-semibold text-green-700">
                                    {user.totalApprovedHours.toFixed(1)}
                                </td>
                                <td class="px-4 py-3 text-center text-sm font-semibold text-yellow-600">
                                    {user.potentialHoursIfApproved.toFixed(1)}
                                </td>
                                <td class="px-4 py-3 text-sm text-ds-text-secondary">
                                    {user.reason}
                                </td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            </div>
        {:else if priorityUsersLoaded}
            <p class="text-ds-text-secondary text-sm">No priority users found.</p>
        {:else if priorityUsersLoading}
            <p class="text-ds-text-secondary text-sm">Loading priority users...</p>
        {:else}
            <p class="text-ds-text-placeholder text-sm">
                Click "Load Priority Users" to see users with 50+ approved hours.
            </p>
        {/if}
    </Card>
</div>
</div></div>
