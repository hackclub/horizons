<script lang="ts">
    import { onMount } from 'svelte';
    import { api, type components } from '$lib/api';

    type ReviewerLeaderboardEntry = components['schemas']['ReviewerLeaderboardEntry'];
    type PriorityUserResponse = components['schemas']['PriorityUserResponse'];
    type GlobalSettingsResponse = components['schemas']['GlobalSettingsResponse'];

    // Global settings state
    let globalSettings = $state<GlobalSettingsResponse | null>(null);
    let globalSettingsLoading = $state(false);

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

    onMount(() => {
        loadGlobalSettings();
        loadReviewerLeaderboard();
        loadPriorityUsers();
    });
</script>

<div class="space-y-8">
    <h1 class="text-3xl font-bold">Settings</h1>

    <!-- Global Settings Section -->
    <div class="rounded-2xl border border-gray-700 bg-gray-900/70 backdrop-blur p-6 space-y-4">
        <h2 class="text-xl font-semibold flex items-center gap-2">
            Global Settings
        </h2>

        {#if globalSettingsLoading && !globalSettings}
            <p class="text-gray-400 text-sm">Loading settings...</p>
        {:else if globalSettings}
            <div class="space-y-4">
                <div class="flex items-center justify-between rounded-xl border border-gray-700 bg-gray-800/50 p-4">
                    <div>
                        <p class="font-medium text-white">Submissions Frozen</p>
                        <p class="text-sm text-gray-400">
                            When enabled, users cannot submit or resubmit projects.
                        </p>
                    </div>
                    <button
                        class={`px-4 py-2 rounded-lg border transition-colors flex items-center gap-2 ${
                            globalSettings.submissionsFrozen
                                ? 'bg-blue-600/20 border-blue-500 text-blue-300 hover:bg-blue-600/30'
                                : 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700'
                        }`}
                        onclick={toggleGlobalSubmissionsFrozen}
                        disabled={globalSettingsLoading}
                    >
                        {#if globalSettingsLoading}
                            <span class="animate-spin">⟳</span>
                        {:else}
                            <span>{globalSettings.submissionsFrozen ? '🧊' : '▶️'}</span>
                        {/if}
                        {globalSettings.submissionsFrozen ? 'Submissions Frozen' : 'Freeze All Submissions'}
                    </button>
                </div>

                {#if globalSettings.submissionsFrozen}
                    <div class="rounded-xl border border-blue-500 bg-blue-600/10 p-4 flex items-center gap-3">
                        <span class="text-2xl">🧊</span>
                        <div>
                            <p class="font-semibold text-blue-300">
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
            <p class="text-gray-400 text-sm">Failed to load settings.</p>
        {/if}
    </div>

    <!-- Reviewer Leaderboard Section -->
    <div class="rounded-2xl border border-gray-700 bg-gray-900/70 backdrop-blur p-6 space-y-4">
        <div class="flex items-center justify-between">
            <h2 class="text-xl font-semibold flex items-center gap-2">
                🏆 Reviewer Leaderboard
            </h2>
            <button
                class="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg border border-gray-700 transition-colors text-sm"
                onclick={loadReviewerLeaderboard}
                disabled={leaderboardLoading}
            >
                {leaderboardLoading
                    ? 'Loading...'
                    : leaderboardLoaded
                      ? 'Refresh'
                      : 'Load Leaderboard'}
            </button>
        </div>

        {#if leaderboardLoaded && reviewerLeaderboard.length > 0}
            <div class="overflow-x-auto">
                <table class="w-full">
                    <thead class="bg-gray-800/50">
                        <tr>
                            <th class="px-4 py-3 text-left text-sm font-semibold text-gray-300">#</th>
                            <th class="px-4 py-3 text-left text-sm font-semibold text-gray-300">Reviewer</th>
                            <th class="px-4 py-3 text-center text-sm font-semibold text-green-400">Approved</th>
                            <th class="px-4 py-3 text-center text-sm font-semibold text-red-400">Rejected</th>
                            <th class="px-4 py-3 text-center text-sm font-semibold text-purple-400">Total</th>
                            <th class="px-4 py-3 text-left text-sm font-semibold text-gray-300">Last Review</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-700">
                        {#each reviewerLeaderboard as reviewer, index}
                            <tr
                                class="hover:bg-gray-800/30 {index === 0
                                    ? 'bg-yellow-500/10'
                                    : index === 1
                                      ? 'bg-gray-400/10'
                                      : index === 2
                                        ? 'bg-amber-600/10'
                                        : ''}"
                            >
                                <td
                                    class="px-4 py-3 text-sm font-bold {index === 0
                                        ? 'text-yellow-400'
                                        : index === 1
                                          ? 'text-gray-300'
                                          : index === 2
                                            ? 'text-amber-500'
                                            : 'text-gray-400'}"
                                >
                                    {#if index === 0}🥇{:else if index === 1}🥈{:else if index === 2}🥉{:else}{index + 1}{/if}
                                </td>
                                <td class="px-4 py-3">
                                    <p class="text-sm font-medium text-white">
                                        {reviewer.firstName || ''} {reviewer.lastName || ''}
                                    </p>
                                    <p class="text-xs text-gray-400">
                                        {reviewer.email || `ID: ${reviewer.reviewerId}`}
                                    </p>
                                </td>
                                <td class="px-4 py-3 text-center text-sm font-semibold text-green-400">
                                    {reviewer.approved}
                                </td>
                                <td class="px-4 py-3 text-center text-sm font-semibold text-red-400">
                                    {reviewer.rejected}
                                </td>
                                <td class="px-4 py-3 text-center text-sm font-bold text-purple-400">
                                    {reviewer.total}
                                </td>
                                <td class="px-4 py-3 text-sm text-gray-400">
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
            <p class="text-gray-400 text-sm">No reviews recorded yet.</p>
        {:else if leaderboardLoading}
            <p class="text-gray-400 text-sm">Loading leaderboard...</p>
        {:else}
            <p class="text-gray-500 text-sm">
                Click "Load Leaderboard" to see reviewer stats.
            </p>
        {/if}
    </div>

    <!-- Priority Users Section -->
    <div class="rounded-2xl border border-gray-700 bg-gray-900/70 backdrop-blur p-6 space-y-4">
        <div class="flex items-center justify-between">
            <h2 class="text-xl font-semibold flex items-center gap-2">
                Priority Users (50+ approved hours)
            </h2>
            <button
                class="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg border border-gray-700 transition-colors text-sm"
                onclick={loadPriorityUsers}
                disabled={priorityUsersLoading}
            >
                {priorityUsersLoading
                    ? 'Loading...'
                    : priorityUsersLoaded
                      ? 'Refresh'
                      : 'Load Priority Users'}
            </button>
        </div>

        {#if priorityUsersLoaded && priorityUsers.length > 0}
            <div class="text-sm text-gray-400 mb-2">
                {priorityUsers.length} priority user{priorityUsers.length !== 1 ? 's' : ''} found
            </div>
            <div class="overflow-x-auto">
                <table class="w-full">
                    <thead class="bg-gray-800/50">
                        <tr>
                            <th class="px-4 py-3 text-left text-sm font-semibold text-gray-300">User</th>
                            <th class="px-4 py-3 text-left text-sm font-semibold text-gray-300">Email</th>
                            <th class="px-4 py-3 text-center text-sm font-semibold text-green-400">Approved Hours</th>
                            <th class="px-4 py-3 text-center text-sm font-semibold text-yellow-400">Potential Hours</th>
                            <th class="px-4 py-3 text-left text-sm font-semibold text-gray-300">Reason</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-700">
                        {#each priorityUsers as user}
                            <tr class="hover:bg-gray-800/30">
                                <td class="px-4 py-3">
                                    <p class="text-sm font-medium text-white">
                                        {user.firstName || ''} {user.lastName || ''}
                                    </p>
                                    <p class="text-xs text-gray-500">ID: {user.userId}</p>
                                </td>
                                <td class="px-4 py-3 text-sm text-gray-300">
                                    {user.email}
                                </td>
                                <td class="px-4 py-3 text-center text-sm font-semibold text-green-400">
                                    {user.totalApprovedHours.toFixed(1)}
                                </td>
                                <td class="px-4 py-3 text-center text-sm font-semibold text-yellow-400">
                                    {user.potentialHoursIfApproved.toFixed(1)}
                                </td>
                                <td class="px-4 py-3 text-sm text-gray-400">
                                    {user.reason}
                                </td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            </div>
        {:else if priorityUsersLoaded}
            <p class="text-gray-400 text-sm">No priority users found.</p>
        {:else if priorityUsersLoading}
            <p class="text-gray-400 text-sm">Loading priority users...</p>
        {:else}
            <p class="text-gray-500 text-sm">
                Click "Load Priority Users" to see users with 50+ approved hours.
            </p>
        {/if}
    </div>
</div>
