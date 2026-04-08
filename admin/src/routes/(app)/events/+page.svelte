<script lang="ts">
    import { onMount } from 'svelte';
    import { api, type components } from '$lib/api';

    type AdminEventResponse = components['schemas']['AdminEventResponse'];

    let eventsLoading = $state(false);
    let events = $state<AdminEventResponse[]>([]);

    let eventForm = $state<{
        slug: string;
        title: string;
        description: string;
        imageUrl: string;
        location: string;
        startDate: string;
        endDate: string;
        hourCost: string;
        isActive: boolean;
    }>({
        slug: '',
        title: '',
        description: '',
        imageUrl: '',
        location: '',
        startDate: '',
        endDate: '',
        hourCost: '',
        isActive: true
    });
    let editingEventSlug = $state<string | null>(null);
    let eventFormSaving = $state(false);
    let eventFormError = $state('');
    let eventFormSuccess = $state('');

    async function loadEvents() {
        eventsLoading = true;
        try {
            const { data, error } = await api.GET('/api/events/admin');
            if (error) {
                console.error('Failed to load events:', error);
                return;
            }
            if (data) {
                events = data;
            }
        } catch (err) {
            console.error('Failed to load events:', err);
        } finally {
            eventsLoading = false;
        }
    }

    function resetEventForm() {
        eventForm = {
            slug: '',
            title: '',
            description: '',
            imageUrl: '',
            location: '',
            startDate: '',
            endDate: '',
            hourCost: '',
            isActive: true
        };
        editingEventSlug = null;
        eventFormError = '';
        eventFormSuccess = '';
    }

    function startEditEvent(event: AdminEventResponse) {
        editingEventSlug = event.slug;
        eventForm = {
            slug: event.slug,
            title: event.title,
            description: event.description || '',
            imageUrl: event.imageUrl || '',
            location: event.location || '',
            startDate: event.startDate ? new Date(event.startDate).toISOString().slice(0, 10) : '',
            endDate: event.endDate ? new Date(event.endDate).toISOString().slice(0, 10) : '',
            hourCost: String(event.hourCost),
            isActive: event.isActive
        };
        eventFormError = '';
        eventFormSuccess = '';
    }

    async function saveEvent() {
        eventFormSaving = true;
        eventFormError = '';
        eventFormSuccess = '';

        try {
            if (editingEventSlug) {
                const { error } = await api.PUT('/api/events/admin/{slug}', {
                    params: { path: { slug: editingEventSlug } },
                    body: {
                        slug: eventForm.slug,
                        title: eventForm.title,
                        description: eventForm.description || undefined,
                        imageUrl: eventForm.imageUrl || undefined,
                        location: eventForm.location || undefined,
                        startDate: eventForm.startDate || undefined,
                        endDate: eventForm.endDate || undefined,
                        hourCost: parseFloat(eventForm.hourCost),
                        isActive: eventForm.isActive
                    }
                });

                if (error) {
                    eventFormError = (error as any)?.message ?? 'Failed to save event';
                    return;
                }

                eventFormSuccess = 'Event updated successfully';
            } else {
                const { error } = await api.POST('/api/events/admin', {
                    body: {
                        slug: eventForm.slug,
                        title: eventForm.title,
                        description: eventForm.description || undefined,
                        imageUrl: eventForm.imageUrl || undefined,
                        location: eventForm.location || undefined,
                        startDate: eventForm.startDate,
                        endDate: eventForm.endDate,
                        hourCost: parseFloat(eventForm.hourCost)
                    }
                });

                if (error) {
                    eventFormError = (error as any)?.message ?? 'Failed to save event';
                    return;
                }

                eventFormSuccess = 'Event created successfully';
            }

            resetEventForm();
            await loadEvents();
        } catch (err) {
            eventFormError = err instanceof Error ? err.message : 'Failed to save event';
        } finally {
            eventFormSaving = false;
        }
    }

    async function deleteEvent(slug: string) {
        const confirmDelete = window.confirm('Delete this event? This cannot be undone.');
        if (!confirmDelete) return;

        try {
            const { error } = await api.DELETE('/api/events/admin/{slug}', {
                params: { path: { slug } }
            });
            if (error) {
                console.error('Failed to delete event:', error);
                return;
            }
            await loadEvents();
        } catch (err) {
            console.error('Failed to delete event:', err);
        }
    }

    onMount(() => {
        loadEvents();
    });
</script>

<section class="space-y-4">
    <div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <h2 class="text-2xl font-semibold">Events Management</h2>
        <button
            class="px-4 py-2 bg-ds-surface2 hover:bg-ds-surface-inactive rounded-lg border border-ds-border transition-colors"
            onclick={loadEvents}
        >
            Refresh
        </button>
    </div>

    <div class="rounded-lg border border-ds-border bg-ds-surface backdrop-blur p-6 space-y-6">
        <h3 class="text-lg font-semibold">
            {editingEventSlug ? 'Edit Event' : 'Create New Event'}
        </h3>
        <div class="grid gap-4 md:grid-cols-2">
            <div class="space-y-2">
                <label class="text-sm font-medium text-ds-text-secondary" for="event-slug">Slug *</label>
                <input
                    id="event-slug"
                    type="text"
                    class="w-full rounded-lg border border-ds-border bg-ds-surface2 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ds-accent"
                    placeholder="my-event"
                    bind:value={eventForm.slug}
                />
            </div>
            <div class="space-y-2">
                <label class="text-sm font-medium text-ds-text-secondary" for="event-title">Title *</label>
                <input
                    id="event-title"
                    type="text"
                    class="w-full rounded-lg border border-ds-border bg-ds-surface2 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ds-accent"
                    placeholder="Event title"
                    bind:value={eventForm.title}
                />
            </div>
            <div class="space-y-2">
                <label class="text-sm font-medium text-ds-text-secondary" for="event-description">Description</label>
                <input
                    id="event-description"
                    type="text"
                    class="w-full rounded-lg border border-ds-border bg-ds-surface2 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ds-accent"
                    placeholder="Event description..."
                    bind:value={eventForm.description}
                />
            </div>
            <div class="space-y-2">
                <label class="text-sm font-medium text-ds-text-secondary" for="event-image">Image URL</label>
                <input
                    id="event-image"
                    type="text"
                    class="w-full rounded-lg border border-ds-border bg-ds-surface2 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ds-accent"
                    placeholder="https://..."
                    bind:value={eventForm.imageUrl}
                />
            </div>
            <div class="space-y-2">
                <label class="text-sm font-medium text-ds-text-secondary" for="event-location">Location</label>
                <input
                    id="event-location"
                    type="text"
                    class="w-full rounded-lg border border-ds-border bg-ds-surface2 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ds-accent"
                    placeholder="San Francisco, CA"
                    bind:value={eventForm.location}
                />
            </div>
            <div class="space-y-2">
                <label class="text-sm font-medium text-ds-text-secondary" for="event-start-date">Start Date *</label>
                <input
                    id="event-start-date"
                    type="date"
                    class="w-full rounded-lg border border-ds-border bg-ds-surface2 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ds-accent"
                    bind:value={eventForm.startDate}
                />
            </div>
            <div class="space-y-2">
                <label class="text-sm font-medium text-ds-text-secondary" for="event-end-date">End Date *</label>
                <input
                    id="event-end-date"
                    type="date"
                    class="w-full rounded-lg border border-ds-border bg-ds-surface2 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ds-accent"
                    bind:value={eventForm.endDate}
                />
            </div>
            <div class="space-y-2">
                <label class="text-sm font-medium text-ds-text-secondary" for="event-cost">Hour Cost *</label>
                <input
                    id="event-cost"
                    type="number"
                    step="0.1"
                    min="0"
                    class="w-full rounded-lg border border-ds-border bg-ds-surface2 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ds-accent"
                    placeholder="0"
                    bind:value={eventForm.hourCost}
                />
            </div>
            <div class="flex items-center gap-4">
                <label class="flex items-center gap-2 text-sm text-ds-text-secondary">
                    <input type="checkbox" bind:checked={eventForm.isActive} class="rounded" />
                    Active
                </label>
            </div>
        </div>

        <div class="flex flex-wrap gap-3 items-center">
            <button
                class="px-4 py-2 rounded-lg bg-ds-accent hover:bg-ds-accent/80 transition-colors disabled:bg-ds-surface-inactive disabled:cursor-not-allowed"
                onclick={saveEvent}
                disabled={eventFormSaving || !eventForm.slug || !eventForm.title || !eventForm.startDate || !eventForm.endDate || !eventForm.hourCost}
            >
                {eventFormSaving ? 'Saving...' : editingEventSlug ? 'Update Event' : 'Create Event'}
            </button>
            {#if editingEventSlug}
                <button
                    class="px-4 py-2 rounded-lg bg-ds-surface2 hover:bg-ds-surface-inactive transition-colors"
                    onclick={resetEventForm}
                >
                    Cancel Edit
                </button>
            {/if}
            {#if eventFormError}
                <span class="text-red-600 text-sm">{eventFormError}</span>
            {/if}
            {#if eventFormSuccess}
                <span class="text-green-700 text-sm">{eventFormSuccess}</span>
            {/if}
        </div>
    </div>

    {#if eventsLoading}
        <div class="py-12 text-center text-ds-text-secondary">
            Loading events...
        </div>
    {:else if events.length === 0}
        <div class="py-12 text-center text-ds-text-secondary">
            No events yet. Create one above.
        </div>
    {:else}
        <div class="space-y-2">
            {#each events as event (event.eventId)}
                <div class="flex items-center justify-between rounded-lg border border-ds-border bg-ds-surface2 px-4 py-3">
                    <div class="flex items-center gap-3 flex-wrap">
                        <span class="font-medium">{event.title}</span>
                        <span class="text-sm text-ds-text-secondary">{event.slug}</span>
                        <span class="text-sm text-ds-text-secondary">
                            {new Date(event.startDate).toLocaleDateString()} – {event.endDate ? new Date(event.endDate).toLocaleDateString() : ''}
                        </span>
                        {#if event.location}
                            <span class="text-sm text-ds-text-secondary">{event.location}</span>
                        {/if}
                        <span class="text-sm text-ds-text-secondary">{event.hourCost}h</span>
                        {#if event._count}
                            <span class="px-2 py-0.5 text-xs bg-purple-900/50 text-purple-400 rounded">
                                {event._count.pinnedBy} pinned
                            </span>
                        {/if}
                        {#if !event.isActive}
                            <span class="px-2 py-0.5 text-xs bg-red-900/50 text-red-600 rounded">Inactive</span>
                        {/if}
                    </div>
                    <div class="flex gap-2">
                        <button
                            class="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-500 rounded transition-colors"
                            onclick={() => startEditEvent(event)}
                        >
                            Edit
                        </button>
                        <button
                            class="px-3 py-1 text-xs bg-red-600 hover:bg-red-500 rounded transition-colors"
                            onclick={() => deleteEvent(event.slug)}
                        >
                            Delete
                        </button>
                    </div>
                </div>
            {/each}
        </div>
    {/if}
</section>
