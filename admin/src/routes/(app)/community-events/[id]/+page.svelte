<script lang="ts">
	import { base } from '$app/paths';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { api, type components } from '$lib/api';
	import { Button, TextField, Checkbox } from '$lib/components';

	type CommunityEventResponse = components['schemas']['CommunityEventResponse'];

	const id = $derived($page.params.id ?? '');

	let event = $state<CommunityEventResponse | null>(null);
	let loading = $state(true);
	let error = $state<string | null>(null);

	let editing = $state(false);
	let saving = $state(false);
	let deleting = $state(false);
	let editError = $state('');
	let editForm = $state({
		name: '',
		start: '',
		end: '',
		tagline: '',
		joinInfo: '',
		actionUrl: '',
		actionLabel: '',
		description: '',
		isActive: true,
	});

	onMount(loadEvent);

	async function loadEvent() {
		loading = true;
		error = null;
		try {
			const { data, error: err } = await api.GET('/api/community-events/admin/{id}', {
				params: { path: { id } },
			});
			if (err) {
				error = (err as any)?.message ?? 'Failed to load event';
				return;
			}
			event = data ?? null;
			populateEditForm();
		} finally {
			loading = false;
		}
	}

	function toIsoString(d: string | Date): string {
		return typeof d === 'string' ? new Date(d).toISOString() : d.toISOString();
	}

	function populateEditForm() {
		if (!event) return;
		editForm = {
			name: event.name,
			start: toIsoString(event.start),
			end: toIsoString(event.end),
			tagline: event.tagline ?? '',
			joinInfo: event.joinInfo ?? '',
			actionUrl: event.actionUrl ?? '',
			actionLabel: event.actionLabel ?? '',
			description: event.description ?? '',
			isActive: event.isActive,
		};
	}

	async function saveEvent() {
		if (!event) return;
		saving = true;
		editError = '';
		try {
			const { error: err } = await api.PUT('/api/community-events/admin/{id}', {
				params: { path: { id: event.communityEventId } },
				body: {
					name: editForm.name,
					start: editForm.start,
					end: editForm.end,
					tagline: editForm.tagline || undefined,
					joinInfo: editForm.joinInfo || undefined,
					actionUrl: editForm.actionUrl || undefined,
					actionLabel: editForm.actionLabel || undefined,
					description: editForm.description || undefined,
					isActive: editForm.isActive,
				},
			});
			if (err) {
				editError = (err as any)?.message ?? 'Failed to save';
				return;
			}
			editing = false;
			await loadEvent();
		} finally {
			saving = false;
		}
	}

	async function deleteEvent() {
		if (!event) return;
		if (!confirm(`Delete community event "${event.name}"? This cannot be undone.`)) return;
		deleting = true;
		try {
			const { error: err } = await api.DELETE('/api/community-events/admin/{id}', {
				params: { path: { id: event.communityEventId } },
			});
			if (err) {
				editError = (err as any)?.message ?? 'Failed to delete';
				return;
			}
			goto(`${base}/community-events`);
		} finally {
			deleting = false;
		}
	}

	function formatDateTime(d: string | Date): string {
		const date = typeof d === 'string' ? new Date(d) : d;
		return date.toLocaleString(undefined, {
			weekday: 'short',
			month: 'short',
			day: 'numeric',
			year: 'numeric',
			hour: 'numeric',
			minute: '2-digit',
		});
	}
</script>

<div class="p-6">
	<div class="mx-auto max-w-3xl space-y-6">
		<a href="{base}/community-events" class="text-xs text-ds-text-secondary hover:text-ds-text">
			&larr; Back to Community Events
		</a>

		{#if loading}
			<p class="text-sm text-ds-text-secondary">Loading event...</p>
		{:else if error}
			<div class="flex flex-col items-start gap-2 py-8">
				<p class="text-red-500">{error}</p>
				<Button onclick={loadEvent}>Retry</Button>
			</div>
		{:else if event}
			<div class="flex items-start justify-between gap-4">
				<div class="flex flex-col gap-1">
					<div class="flex items-center gap-2">
						<h1 class="text-2xl font-semibold text-ds-text">{event.name}</h1>
						{#if !event.isActive}
							<span class="rounded bg-red-600/20 px-1.5 py-0.5 text-xs text-red-500">Inactive</span>
						{/if}
					</div>
					<p class="text-xs text-ds-text-secondary">
						{formatDateTime(event.start)} → {formatDateTime(event.end)}
					</p>
					{#if event.tagline}
						<p class="text-sm text-ds-text-secondary">{event.tagline}</p>
					{/if}
				</div>
				<Button onclick={() => (editing = !editing)}>
					{editing ? 'Cancel' : 'Edit'}
				</Button>
			</div>

			{#if event.joinInfo}
				<div class="rounded-lg border border-ds-border bg-ds-surface p-4">
					<p class="text-[11px] font-semibold uppercase tracking-wide text-ds-text-secondary mb-1">
						Join Info (raw markdown)
					</p>
					<pre class="text-sm text-ds-text whitespace-pre-wrap font-mono">{event.joinInfo}</pre>
				</div>
			{/if}

			{#if event.description}
				<div class="rounded-lg border border-ds-border bg-ds-surface p-4">
					<p class="text-[11px] font-semibold uppercase tracking-wide text-ds-text-secondary mb-1">
						Description (raw markdown)
					</p>
					<pre class="text-sm text-ds-text whitespace-pre-wrap font-mono">{event.description}</pre>
				</div>
			{/if}

			{#if editing}
				<div class="rounded-lg border border-ds-border bg-ds-surface p-6 space-y-4">
					<h2 class="text-lg font-semibold text-ds-text">Edit Event</h2>

					<div class="space-y-2">
						<label class="text-sm font-medium text-ds-text-secondary" for="edit-name">Name</label>
						<TextField id="edit-name" bind:value={editForm.name} />
					</div>

					<div class="grid gap-4 md:grid-cols-2">
						<div class="space-y-2">
							<label class="text-sm font-medium text-ds-text-secondary" for="edit-start">Start (UTC)</label>
							<TextField id="edit-start" placeholder="2026-05-15T16:00:00Z" bind:value={editForm.start} />
							<p class="text-[11px] text-ds-text-secondary">ISO 8601 UTC, e.g. <code>2026-05-15T16:00:00Z</code></p>
						</div>
						<div class="space-y-2">
							<label class="text-sm font-medium text-ds-text-secondary" for="edit-end">End (UTC)</label>
							<TextField id="edit-end" placeholder="2026-05-15T17:00:00Z" bind:value={editForm.end} />
						</div>
					</div>

					<div class="space-y-2">
						<label class="text-sm font-medium text-ds-text-secondary" for="edit-tagline">Tagline</label>
						<TextField id="edit-tagline" bind:value={editForm.tagline} />
					</div>

					<div class="space-y-2">
						<label class="text-sm font-medium text-ds-text-secondary" for="edit-join">Join Info</label>
						<textarea
							id="edit-join"
							rows="2"
							bind:value={editForm.joinInfo}
							class="w-full rounded-lg border border-ds-border bg-ds-surface2 px-3 py-2 text-sm text-ds-text focus:border-ds-text-secondary focus:outline-none"
						></textarea>
						<p class="text-[11px] text-ds-text-secondary">Markdown supported</p>
					</div>

					<div class="grid gap-4 md:grid-cols-2">
						<div class="space-y-2">
							<label class="text-sm font-medium text-ds-text-secondary" for="edit-action-url">Action URL</label>
							<TextField id="edit-action-url" placeholder="https://..." bind:value={editForm.actionUrl} />
							<p class="text-[11px] text-ds-text-secondary">Renders as a button on /app and /app/community.</p>
						</div>
						<div class="space-y-2">
							<label class="text-sm font-medium text-ds-text-secondary" for="edit-action-label">Action Button Label</label>
							<TextField id="edit-action-label" placeholder="RSVP" bind:value={editForm.actionLabel} />
						</div>
					</div>

					<div class="space-y-2">
						<label class="text-sm font-medium text-ds-text-secondary" for="edit-desc">Description</label>
						<textarea
							id="edit-desc"
							rows="8"
							bind:value={editForm.description}
							class="w-full rounded-lg border border-ds-border bg-ds-surface2 px-3 py-2 text-sm text-ds-text focus:border-ds-text-secondary focus:outline-none"
						></textarea>
					</div>

					<label class="flex items-center gap-2 text-sm text-ds-text-secondary">
						<Checkbox bind:checked={editForm.isActive} />
						Active
					</label>

					<div class="flex flex-wrap items-center gap-3 pt-2">
						<Button variant="approve" onclick={saveEvent} disabled={saving}>
							{saving ? 'Saving...' : 'Save Changes'}
						</Button>
						<Button onclick={() => { editing = false; populateEditForm(); }}>Cancel</Button>
						{#if editError}
							<span class="text-sm text-red-600">{editError}</span>
						{/if}
					</div>
				</div>
			{/if}

			<div class="border-t border-ds-border pt-4">
				<Button onclick={deleteEvent} disabled={deleting}>
					{deleting ? 'Deleting...' : 'Delete Event'}
				</Button>
			</div>
		{/if}
	</div>
</div>
