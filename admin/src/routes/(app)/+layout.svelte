<script lang="ts">
    import { page } from '$app/stores';
    import { goto } from '$app/navigation';
    import { api, type components } from '$lib/api';
    import { onMount } from 'svelte';

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

    onMount(async () => {
        const { data: userData, error } = await api.GET('/api/user/auth/me');
        if (error || !userData) {
            goto('/login');
            return;
        }
        if (userData.role !== 'admin') {
            goto('/app/projects');
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

    const navItems = [
        { href: '/submissions', label: 'Submissions' },
        { href: '/projects', label: 'Projects' },
        { href: '/users', label: 'Users' },
        { href: '/shop', label: 'Shop' },
        { href: '/giftcodes', label: 'Gift Codes' },
        { href: '/events', label: 'Events' },
        { href: '/settings', label: 'Settings' },
    ];

    function isActive(href: string): boolean {
        const path = $page.url.pathname.replace(/^\/admin/, '');
        return path === href || path.startsWith(href + '/');
    }
</script>

{#if loading}
    <div class="min-h-screen bg-gray-950 flex items-center justify-center">
        <p class="text-white text-lg">Loading...</p>
    </div>
{:else}
<div class="min-h-screen bg-gray-950 text-white p-4 md:p-6 overflow-x-hidden">
    <div class="max-w-7xl mx-auto space-y-8 w-full">
        <header class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
                <h1 class="text-4xl font-bold">Admin Panel</h1>
                <p class="text-gray-300">Signed in as {user?.email}</p>
            </div>
            <nav class="flex gap-2 flex-wrap">
                {#each navItems as item}
                    <a
                        href="/admin{item.href}"
                        class={`px-4 py-2 rounded-lg border transition-colors ${isActive(item.href) ? 'bg-purple-600 border-purple-400' : 'bg-gray-800 border-gray-700 hover:bg-gray-700'}`}
                    >
                        {item.label}
                    </a>
                {/each}
            </nav>
        </header>

        <section class="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
            <div class="rounded-2xl border border-gray-700 bg-gray-900/70 backdrop-blur p-6 space-y-2">
                <p class="text-sm text-gray-400 uppercase tracking-wide">Total Hackatime Hours</p>
                <p class="text-3xl font-bold text-white">{formatTotalHoursValue(metrics.totalHackatimeHours)}</p>
            </div>
            <div class="rounded-2xl border border-gray-700 bg-gray-900/70 backdrop-blur p-6 space-y-2">
                <p class="text-sm text-gray-400 uppercase tracking-wide">Total Approved Hours</p>
                <p class="text-3xl font-bold text-white">{formatTotalHoursValue(metrics.totalApprovedHours)}</p>
            </div>
            <div class="rounded-2xl border border-gray-700 bg-gray-900/70 backdrop-blur p-6 space-y-2">
                <p class="text-sm text-gray-400 uppercase tracking-wide">Submitted Projects Hours</p>
                <p class="text-3xl font-bold text-white">{formatTotalHoursValue(metrics.totalSubmittedHackatimeHours)}</p>
            </div>
            <div class="rounded-2xl border border-gray-700 bg-gray-900/70 backdrop-blur p-6 space-y-2">
                <p class="text-sm text-gray-400 uppercase tracking-wide">Projects</p>
                <p class="text-3xl font-bold text-white">{formatCount(metrics.totalProjects)}</p>
            </div>
            <div class="rounded-2xl border border-gray-700 bg-gray-900/70 backdrop-blur p-6 space-y-2">
                <p class="text-sm text-gray-400 uppercase tracking-wide">Users</p>
                <p class="text-3xl font-bold text-white">{formatCount(metrics.totalUsers)}</p>
            </div>
        </section>

        <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div class="flex gap-2">
                <button
                    class="px-4 py-2 rounded-lg border border-gray-700 bg-gray-800 hover:bg-gray-700 transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
                    onclick={loadMetrics}
                    disabled={metricsLoading}
                >
                    {metricsLoading ? 'Refreshing totals...' : 'Refresh totals'}
                </button>
                <button
                    class="px-4 py-2 rounded-lg border border-purple-500 bg-purple-600 hover:bg-purple-500 transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
                    onclick={recalculateAllProjectsHours}
                    disabled={recalcAllBusy}
                >
                    {recalcAllBusy ? 'Recalculating projects...' : 'Recalculate all projects'}
                </button>
            </div>
            <div class="text-sm">
                {#if bulkProjectError}
                    <span class="text-red-400">{bulkProjectError}</span>
                {:else if bulkProjectMessage}
                    <span class="text-green-400">{bulkProjectMessage}</span>
                {/if}
            </div>
        </div>

        {@render children()}
    </div>
</div>
{/if}
