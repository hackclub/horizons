<script lang="ts">
    import { base } from '$app/paths';
    import { onMount } from 'svelte';
    import { api, type components } from '$lib/api';
    import { TextField } from '$lib/components';
    import yaml from 'js-yaml';

    type AdminEventResponse = components['schemas']['AdminEventResponse'];

    interface EventConfig {
        name: string;
        logo: string;
        colors: { primary: string; background: string };
    }

    let eventsLoading = $state(true);
    let events = $state<AdminEventResponse[]>([]);
    let eventConfigs = $state<Record<string, EventConfig>>({});
    let search = $state('');

    let filteredEvents = $derived(
        search.trim()
            ? events.filter((e) =>
                e.title.toLowerCase().includes(search.toLowerCase()) ||
                e.slug.toLowerCase().includes(search.toLowerCase())
            )
            : events,
    );

    onMount(async () => {
        await Promise.all([loadEvents(), loadEventConfigs()]);
    });

    async function loadEvents() {
        eventsLoading = true;
        try {
            const { data, error } = await api.GET('/api/events/admin');
            if (!error && data) events = data;
        } finally {
            eventsLoading = false;
        }
    }

    async function loadEventConfigs() {
        try {
            const resp = await fetch(`${base}/events.yaml`);
            if (resp.ok) {
                const text = await resp.text();
                eventConfigs = (yaml.load(text) as Record<string, EventConfig>) ?? {};
            }
        } catch {
            // Event configs are optional — logos just won't show
        }
    }

    function getEventLogo(slug: string): string | null {
        const config = eventConfigs[slug];
        if (!config?.logo) return null;
        // Logos are in /admin/logos/ (copied from frontend)
        return `${base}${config.logo}`;
    }

    function getPinnedCount(event: AdminEventResponse): number {
        return (event as any)._count?.pinnedBy ?? 0;
    }
</script>

<div class="p-6">
    <div class="mx-auto max-w-3xl space-y-4">
        <h1 class="text-2xl font-semibold text-ds-text">Events</h1>

        <TextField
            placeholder="Search for an event..."
            bind:value={search}
        />

        {#if eventsLoading}
            <p class="text-sm text-ds-text-secondary">Loading events...</p>
        {:else if filteredEvents.length === 0}
            <p class="text-sm text-ds-text-secondary">No events found.</p>
        {:else}
            <div class="space-y-3">
                {#each filteredEvents as event}
                    <a
                        href="{base}/events/{event.slug}"
                        class="block rounded-lg border border-ds-border bg-ds-surface2 p-3 shadow-[var(--color-ds-shadow)] hover:border-ds-text-secondary transition-colors"
                    >
                        <div class="flex items-start justify-between gap-4">
                            <div class="flex flex-col gap-2">
                                {#if getEventLogo(event.slug)}
                                    <img
                                        src={getEventLogo(event.slug)}
                                        alt={event.title}
                                        class="h-7 w-auto object-contain object-left"
                                    />
                                {/if}
                                <div class="flex items-center gap-2">
                                    <span class="text-base font-semibold text-ds-text">{event.title}</span>
                                    <span class="rounded-lg bg-neutral-700 px-1.5 py-0.5 text-xs text-neutral-400">{event.slug}</span>
                                </div>
                            </div>
                            <span class="shrink-0 rounded-full border border-ds-border px-2.5 py-0.5 text-xs text-ds-text">
                                Pinned by {getPinnedCount(event)} participant{getPinnedCount(event) !== 1 ? 's' : ''}
                            </span>
                        </div>
                        {#if event.description}
                            <p class="mt-1 text-xs text-ds-text-secondary line-clamp-2">{event.description}</p>
                        {/if}
                        <div class="mt-3 flex justify-end">
                            <span class="text-xs text-ds-text">View/Edit Event &rarr;</span>
                        </div>
                    </a>
                {/each}
            </div>
        {/if}
    </div>
</div>
