<script lang="ts">
	import { base } from '$app/paths';
	import { onMount } from 'svelte';
	import { api, type components } from '$lib/api';
	import { Button, TextField } from '$lib/components';

	type CommunityEventResponse = components['schemas']['CommunityEventResponse'];

	let loading = $state(true);
	let events = $state<CommunityEventResponse[]>([]);
	let search = $state('');

	let filteredEvents = $derived(
		search.trim()
			? events.filter((e) => e.name.toLowerCase().includes(search.toLowerCase()))
			: events,
	);

	onMount(async () => {
		await loadEvents();
	});

	async function loadEvents() {
		loading = true;
		try {
			const { data, error } = await api.GET('/api/community-events/admin');
			if (!error && data) events = data;
		} finally {
			loading = false;
		}
	}

	function formatDateTime(d: string | Date): string {
		const date = typeof d === 'string' ? new Date(d) : d;
		return date.toLocaleString(undefined, {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
			hour: 'numeric',
			minute: '2-digit',
		});
	}
</script>

<div class="p-6">
	<div class="mx-auto max-w-3xl space-y-4">
		<div class="flex items-center justify-between gap-4">
			<h1 class="text-2xl font-semibold text-ds-text">Community Events</h1>
			<a
				href="{base}/community-events/new"
				class="rounded-lg border border-ds-border bg-ds-surface px-3 py-1.5 text-sm font-medium text-ds-text shadow-[var(--color-ds-shadow)] hover:border-ds-text-secondary"
			>
				+ New Event
			</a>
		</div>

		<TextField placeholder="Search events..." bind:value={search} />

		{#if loading}
			<p class="text-sm text-ds-text-secondary">Loading events...</p>
		{:else if filteredEvents.length === 0}
			<p class="text-sm text-ds-text-secondary">No community events yet.</p>
		{:else}
			<div class="space-y-3">
				{#each filteredEvents as event (event.communityEventId)}
					<a
						href="{base}/community-events/{event.communityEventId}"
						class="block rounded-lg border border-ds-border bg-ds-surface2 p-3 shadow-[var(--color-ds-shadow)] hover:border-ds-text-secondary transition-colors"
					>
						<div class="flex items-start justify-between gap-4">
							<div class="flex flex-col gap-1">
								<div class="flex items-center gap-2">
									<span class="text-base font-semibold text-ds-text">{event.name}</span>
									{#if !event.isActive}
										<span class="rounded bg-red-600/20 px-1.5 py-0.5 text-xs text-red-500">Inactive</span>
									{/if}
								</div>
								<p class="text-xs text-ds-text-secondary">
									{formatDateTime(event.start)} → {formatDateTime(event.end)}
								</p>
								{#if event.tagline}
									<p class="text-xs text-ds-text-secondary line-clamp-1">{event.tagline}</p>
								{/if}
							</div>
							<span class="shrink-0 self-center text-xs text-ds-text">View/Edit &rarr;</span>
						</div>
					</a>
				{/each}
			</div>
		{/if}
	</div>
</div>
