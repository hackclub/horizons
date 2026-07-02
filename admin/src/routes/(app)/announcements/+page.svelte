<script lang="ts">
	import { base } from '$app/paths';
	import { onMount } from 'svelte';
	import { api } from '$lib/api';
	import { TextField } from '$lib/components';

	interface AdminAnnouncement {
		announcementId: number;
		title: string;
		previewText: string;
		showOnOpen: boolean;
		showAsTag: boolean;
		isActive: boolean;
		createdAt: string;
		eventSlugs: string[];
	}

	let loading = $state(true);
	let items = $state<AdminAnnouncement[]>([]);
	let search = $state('');

	let filtered = $derived(
		search.trim()
			? items.filter((a) => a.title.toLowerCase().includes(search.toLowerCase()))
			: items,
	);

	onMount(async () => {
		try {
			const { data, error } = await api.GET('/api/announcements/admin' as any, {});
			if (!error && data) items = data as AdminAnnouncement[];
		} finally {
			loading = false;
		}
	});

	function formatDate(d: string): string {
		return new Date(d).toLocaleString(undefined, {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
		});
	}
</script>

<div class="p-6">
	<div class="mx-auto max-w-3xl space-y-4">
		<div class="flex items-center justify-between gap-4">
			<h1 class="text-2xl font-semibold text-ds-text">Announcements</h1>
			<a
				href="{base}/announcements/new"
				class="rounded-lg border border-ds-border bg-ds-surface px-3 py-1.5 text-sm font-medium text-ds-text shadow-(--color-ds-shadow) hover:border-ds-text-secondary"
			>
				+ New Announcement
			</a>
		</div>

		<TextField placeholder="Search announcements..." bind:value={search} />

		{#if loading}
			<p class="text-sm text-ds-text-secondary">Loading announcements...</p>
		{:else if filtered.length === 0}
			<p class="text-sm text-ds-text-secondary">No announcements yet.</p>
		{:else}
			<div class="space-y-3">
				{#each filtered as a (a.announcementId)}
					<a
						href="{base}/announcements/{a.announcementId}"
						class="block rounded-lg border border-ds-border bg-ds-surface2 p-3 shadow-(--color-ds-shadow) transition-colors hover:border-ds-text-secondary"
					>
						<div class="flex items-start justify-between gap-4">
							<div class="flex min-w-0 flex-col gap-1">
								<div class="flex flex-wrap items-center gap-2">
									<span class="text-base font-semibold text-ds-text">{a.title}</span>
									{#if !a.isActive}
										<span class="rounded bg-red-600/20 px-1.5 py-0.5 text-xs text-red-700 dark:text-red-300">Inactive</span>
									{/if}
									{#if a.showOnOpen}
										<span class="rounded bg-ds-accent-bg px-1.5 py-0.5 text-xs text-ds-accent">On open</span>
									{/if}
									{#if a.showAsTag}
										<span class="rounded bg-ds-accent-bg px-1.5 py-0.5 text-xs text-ds-accent">Tag</span>
									{/if}
								</div>
								<p class="truncate text-xs text-ds-text-secondary">{a.previewText}</p>
								<p class="text-[11px] text-ds-text-secondary">
									{formatDate(a.createdAt)}
									·
									{#if a.eventSlugs.length === 0}
										Everyone
									{:else}
										{a.eventSlugs.join(', ')}
									{/if}
								</p>
							</div>
							<span class="shrink-0 self-center text-xs text-ds-text">View/Edit &rarr;</span>
						</div>
					</a>
				{/each}
			</div>
		{/if}
	</div>
</div>
