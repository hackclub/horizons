<script lang="ts">
    import { api } from '$lib/api';
    import { onMount } from 'svelte';
    import { Sidebar } from '$lib/components';

    let { children } = $props();

    let user = $state<{ email: string; role: string; name?: string } | null>(null);
    let loading = $state(true);
    let sidebarCollapsed = $state(false);

    onMount(async () => {
        const { data: userData, error } = await api.GET('/api/user/auth/me');
        if (error || !userData) {
            window.location.href = '/';
            return;
        }
        if (userData.role !== 'admin' && userData.role !== 'superadmin' && userData.role !== 'reviewer') {
            window.location.href = '/app/projects';
            return;
        }
        user = userData as any;
        loading = false;
    });
</script>

{#if loading}
    <div class="flex min-h-screen items-center justify-center bg-ds-bg">
        <p class="font-dm text-lg text-ds-text-secondary">Loading...</p>
    </div>
{:else}
<div class="flex min-h-screen bg-ds-bg font-dm">
    <Sidebar {user} bind:collapsed={sidebarCollapsed} />

    <main class="flex-1 overflow-x-hidden">
        {@render children()}
    </main>
</div>
{/if}
