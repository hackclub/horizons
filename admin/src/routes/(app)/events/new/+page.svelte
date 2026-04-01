<script lang="ts">
    import { goto } from '$app/navigation';
    import { api } from '$lib/api';

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
    let saving = $state(false);
    let formError = $state('');
    let formSuccess = $state('');

    async function createEvent() {
        saving = true;
        formError = '';
        formSuccess = '';

        try {
            const { data, error } = await api.POST('/api/events/admin', {
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
                formError = (error as any)?.message ?? 'Failed to create event';
                return;
            }

            formSuccess = 'Event created successfully! Redirecting...';
            setTimeout(() => {
                goto('/admin/events');
            }, 1000);
        } catch (err) {
            formError = err instanceof Error ? err.message : 'Failed to create event';
        } finally {
            saving = false;
        }
    }

    function cancel() {
        goto('/admin/events');
    }

    let isFormValid = $derived(
        !!eventForm.slug && !!eventForm.title && !!eventForm.startDate && !!eventForm.endDate && !!eventForm.hourCost
    );
</script>

<section class="space-y-4">
    <div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <h2 class="text-2xl font-semibold">Create New Event</h2>
        <button
            class="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg border border-gray-700 transition-colors"
            onclick={cancel}
        >
            Back to Events
        </button>
    </div>

    <div class="rounded-2xl border border-gray-700 bg-gray-900/70 backdrop-blur p-6 space-y-6">
        <div class="grid gap-4 md:grid-cols-2">
            <div class="space-y-2">
                <label class="text-sm font-medium text-gray-300" for="event-slug">Slug *</label>
                <input
                    id="event-slug"
                    type="text"
                    class="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                    placeholder="my-event"
                    bind:value={eventForm.slug}
                />
            </div>
            <div class="space-y-2">
                <label class="text-sm font-medium text-gray-300" for="event-title">Title *</label>
                <input
                    id="event-title"
                    type="text"
                    class="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                    placeholder="Event title"
                    bind:value={eventForm.title}
                />
            </div>
            <div class="space-y-2">
                <label class="text-sm font-medium text-gray-300" for="event-description">Description</label>
                <input
                    id="event-description"
                    type="text"
                    class="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                    placeholder="Event description..."
                    bind:value={eventForm.description}
                />
            </div>
            <div class="space-y-2">
                <label class="text-sm font-medium text-gray-300" for="event-image">Image URL</label>
                <input
                    id="event-image"
                    type="text"
                    class="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                    placeholder="https://..."
                    bind:value={eventForm.imageUrl}
                />
            </div>
            <div class="space-y-2">
                <label class="text-sm font-medium text-gray-300" for="event-location">Location</label>
                <input
                    id="event-location"
                    type="text"
                    class="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                    placeholder="San Francisco, CA"
                    bind:value={eventForm.location}
                />
            </div>
            <div class="space-y-2">
                <label class="text-sm font-medium text-gray-300" for="event-start-date">Start Date *</label>
                <input
                    id="event-start-date"
                    type="date"
                    class="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                    bind:value={eventForm.startDate}
                />
            </div>
            <div class="space-y-2">
                <label class="text-sm font-medium text-gray-300" for="event-end-date">End Date *</label>
                <input
                    id="event-end-date"
                    type="date"
                    class="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                    bind:value={eventForm.endDate}
                />
            </div>
            <div class="space-y-2">
                <label class="text-sm font-medium text-gray-300" for="event-cost">Hour Cost *</label>
                <input
                    id="event-cost"
                    type="number"
                    step="0.1"
                    min="0"
                    class="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                    placeholder="0"
                    bind:value={eventForm.hourCost}
                />
            </div>
            <div class="flex items-center gap-4">
                <label class="flex items-center gap-2 text-sm text-gray-300">
                    <input type="checkbox" bind:checked={eventForm.isActive} class="rounded" />
                    Active
                </label>
            </div>
        </div>

        <div class="flex flex-wrap gap-3 items-center">
            <button
                class="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 transition-colors disabled:bg-gray-700 disabled:cursor-not-allowed"
                onclick={createEvent}
                disabled={saving || !isFormValid}
            >
                {saving ? 'Creating...' : 'Create Event'}
            </button>
            <button
                class="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 transition-colors"
                onclick={cancel}
            >
                Cancel
            </button>
            {#if formError}
                <span class="text-red-400 text-sm">{formError}</span>
            {/if}
            {#if formSuccess}
                <span class="text-green-400 text-sm">{formSuccess}</span>
            {/if}
        </div>
    </div>
</section>
