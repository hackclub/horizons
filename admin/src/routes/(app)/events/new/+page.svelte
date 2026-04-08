<script lang="ts">
    import { goto } from '$app/navigation';
    import { api } from '$lib/api';
    import { Button, TextField, Checkbox } from '$lib/components';

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

<div class="p-6"><div class="mx-auto max-w-6xl space-y-6">
<section class="space-y-4">
    <div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <h2 class="text-2xl font-semibold">Create New Event</h2>
        <Button variant="ghost" onclick={cancel}>
            Back to Events
        </Button>
    </div>

    <div class="rounded-lg border border-ds-border bg-ds-surface backdrop-blur p-6 space-y-6">
        <div class="grid gap-4 md:grid-cols-2">
            <div class="space-y-2">
                <label class="text-sm font-medium text-ds-text-secondary" for="event-slug">Slug *</label>
                <TextField
                    id="event-slug"
                    placeholder="my-event"
                    bind:value={eventForm.slug}
                />
            </div>
            <div class="space-y-2">
                <label class="text-sm font-medium text-ds-text-secondary" for="event-title">Title *</label>
                <TextField
                    id="event-title"
                    placeholder="Event title"
                    bind:value={eventForm.title}
                />
            </div>
            <div class="space-y-2">
                <label class="text-sm font-medium text-ds-text-secondary" for="event-description">Description</label>
                <TextField
                    id="event-description"
                    placeholder="Event description..."
                    bind:value={eventForm.description}
                />
            </div>
            <div class="space-y-2">
                <label class="text-sm font-medium text-ds-text-secondary" for="event-image">Image URL</label>
                <TextField
                    id="event-image"
                    placeholder="https://..."
                    bind:value={eventForm.imageUrl}
                />
            </div>
            <div class="space-y-2">
                <label class="text-sm font-medium text-ds-text-secondary" for="event-location">Location</label>
                <TextField
                    id="event-location"
                    placeholder="San Francisco, CA"
                    bind:value={eventForm.location}
                />
            </div>
            <div class="space-y-2">
                <label class="text-sm font-medium text-ds-text-secondary" for="event-start-date">Start Date *</label>
                <TextField
                    id="event-start-date"
                    type="date"
                    bind:value={eventForm.startDate}
                />
            </div>
            <div class="space-y-2">
                <label class="text-sm font-medium text-ds-text-secondary" for="event-end-date">End Date *</label>
                <TextField
                    id="event-end-date"
                    type="date"
                    bind:value={eventForm.endDate}
                />
            </div>
            <div class="space-y-2">
                <label class="text-sm font-medium text-ds-text-secondary" for="event-cost">Hour Cost *</label>
                <TextField
                    id="event-cost"
                    type="number"
                    step="0.1"
                    min="0"
                    placeholder="0"
                    bind:value={eventForm.hourCost}
                />
            </div>
            <div class="flex items-center gap-4">
                <label class="flex items-center gap-2 text-sm text-ds-text-secondary">
                    <Checkbox bind:checked={eventForm.isActive} />
                    Active
                </label>
            </div>
        </div>

        <div class="flex flex-wrap gap-3 items-center">
            <Button
                variant="approve"
                onclick={createEvent}
                disabled={saving || !isFormValid}
            >
                {saving ? 'Creating...' : 'Create Event'}
            </Button>
            <Button variant="ghost" onclick={cancel}>
                Cancel
            </Button>
            {#if formError}
                <span class="text-red-600 text-sm">{formError}</span>
            {/if}
            {#if formSuccess}
                <span class="text-green-700 text-sm">{formSuccess}</span>
            {/if}
        </div>
    </div>
</section>
</div></div>
