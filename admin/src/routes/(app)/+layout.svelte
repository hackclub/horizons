<script lang="ts">
    import { api } from '$lib/api';
    import { onMount } from 'svelte';
    import { Sidebar, Button } from '$lib/components';

    let { children } = $props();

    type Metrics = {
        totalHackatimeHours: number;
        totalApprovedHours: number;
        totalUsers: number;
        totalProjects: number;
        totalSubmittedHackatimeHours: number;
    };

    let user = $state<{ email: string; role: string } | null>(null);
    let metrics = $state<Metrics>({
        totalHackatimeHours: 0,
        totalApprovedHours: 0,
        totalUsers: 0,
        totalProjects: 0,
        totalSubmittedHackatimeHours: 0,
    });
    let metricsLoading = $state(false);
    let recalcAllBusy = $state(false);
    let bulkProjectMessage = $state('');
    let bulkProjectError = $state('');
    let loading = $state(true);
    let sidebarCollapsed = $state(false);

    onMount(async () => {
        const { data: userData, error } = await api.GET('/api/user/auth/me');
        if (error || !userData) {
            window.location.href = '/';
            return;
        }
        if (userData.role !== 'admin') {
            window.location.href = '/app/projects';
            return;
        }
        user = userData as any;
        await loadMetrics();
        loading = false;
    });

    function formatTotalHoursValue(value: number) {
        return value.toLocaleString(undefined, { maximumFractionDigits: 1 });
    }

    function formatCount(value: number) {
        return value.toLocaleString();
    }

    async function loadMetrics() {
        metricsLoading = true;
        try {
            const { data: result } = await api.GET('/api/admin/metrics');
            if (result) {
                metrics = result.totals;
            }
        } finally {
            metricsLoading = false;
        }
    }

    async function recalculateAllProjectsHours() {
        if (recalcAllBusy) return;
        recalcAllBusy = true;
        bulkProjectMessage = '';
        bulkProjectError = '';
        try {
            const { data: body, error } = await api.POST('/api/admin/projects/recalculate-all');
            if (error) {
                bulkProjectError = 'Failed to recalculate projects';
                return;
            }
            const updatedCount = body?.updated ?? 0;
            bulkProjectMessage = `Recalculated ${updatedCount} project${updatedCount === 1 ? '' : 's'}.`;
            await loadMetrics();
        } catch (err) {
            bulkProjectError = err instanceof Error ? err.message : 'Failed to recalculate projects';
        } finally {
            recalcAllBusy = false;
        }
    }
</script>

{#if loading}
    <div class="flex min-h-screen items-center justify-center bg-ds-bg">
        <p class="font-dm text-lg text-ds-text-secondary">Loading...</p>
    </div>
{:else}
<div class="flex min-h-screen bg-ds-bg font-dm">
    <Sidebar {user} bind:collapsed={sidebarCollapsed} />

    <main class="flex-1 overflow-x-hidden p-6">
        <div class="mx-auto max-w-6xl space-y-6">
            <!-- Metrics cards -->
            <section class="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <div class="space-y-1 rounded-lg border border-ds-border bg-ds-surface p-4 shadow-[var(--color-ds-shadow)]">
                    <p class="text-[11px] font-semibold uppercase tracking-wide text-ds-text-secondary">Hackatime Hours</p>
                    <p class="text-2xl font-bold text-ds-text">{formatTotalHoursValue(metrics.totalHackatimeHours)}</p>
                </div>
                <div class="space-y-1 rounded-lg border border-ds-border bg-ds-surface p-4 shadow-[var(--color-ds-shadow)]">
                    <p class="text-[11px] font-semibold uppercase tracking-wide text-ds-text-secondary">Approved Hours</p>
                    <p class="text-2xl font-bold text-ds-text">{formatTotalHoursValue(metrics.totalApprovedHours)}</p>
                </div>
                <div class="space-y-1 rounded-lg border border-ds-border bg-ds-surface p-4 shadow-[var(--color-ds-shadow)]">
                    <p class="text-[11px] font-semibold uppercase tracking-wide text-ds-text-secondary">Submitted Hours</p>
                    <p class="text-2xl font-bold text-ds-text">{formatTotalHoursValue(metrics.totalSubmittedHackatimeHours)}</p>
                </div>
                <div class="space-y-1 rounded-lg border border-ds-border bg-ds-surface p-4 shadow-[var(--color-ds-shadow)]">
                    <p class="text-[11px] font-semibold uppercase tracking-wide text-ds-text-secondary">Projects</p>
                    <p class="text-2xl font-bold text-ds-text">{formatCount(metrics.totalProjects)}</p>
                </div>
                <div class="space-y-1 rounded-lg border border-ds-border bg-ds-surface p-4 shadow-[var(--color-ds-shadow)]">
                    <p class="text-[11px] font-semibold uppercase tracking-wide text-ds-text-secondary">Users</p>
                    <p class="text-2xl font-bold text-ds-text">{formatCount(metrics.totalUsers)}</p>
                </div>
            </section>

            <!-- Action bar -->
            <div class="flex items-center gap-2">
                <Button onclick={loadMetrics} disabled={metricsLoading}>
                    {metricsLoading ? 'Refreshing...' : 'Refresh totals'}
                </Button>
                <Button onclick={recalculateAllProjectsHours} disabled={recalcAllBusy}>
                    {recalcAllBusy ? 'Recalculating...' : 'Recalculate all projects'}
                </Button>
                {#if bulkProjectError}
                    <span class="text-xs text-red-600">{bulkProjectError}</span>
                {:else if bulkProjectMessage}
                    <span class="text-xs text-green-700">{bulkProjectMessage}</span>
                {/if}
            </div>

            {@render children()}
        </div>
    </main>
</div>
{/if}
