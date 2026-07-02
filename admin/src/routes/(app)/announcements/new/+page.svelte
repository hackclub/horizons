<script lang="ts">
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { onMount } from 'svelte';
	import { api } from '$lib/api';
	import { Button } from '$lib/components';
	import AnnouncementForm, { type AnnouncementFormState } from '../AnnouncementForm.svelte';

	let form = $state<AnnouncementFormState>({
		title: '',
		previewText: '',
		body: '',
		eventSlugs: [],
		showOnOpen: false,
		showAsTag: false,
		isActive: true,
	});

	let events = $state<{ eventId: number; title: string; slug: string }[]>([]);
	let saving = $state(false);
	let formError = $state('');
	let formSuccess = $state('');

	let isFormValid = $derived(!!form.title && !!form.previewText && !!form.body);

	onMount(async () => {
		const { data } = await api.GET('/api/events/admin' as any, {});
		if (data) events = data as any;
	});

	async function create() {
		saving = true;
		formError = '';
		formSuccess = '';
		try {
			const { error } = await api.POST('/api/announcements/admin' as any, {
				body: {
					title: form.title,
					previewText: form.previewText,
					body: form.body,
					eventSlugs: form.eventSlugs,
					showOnOpen: form.showOnOpen,
					showAsTag: form.showAsTag,
					isActive: form.isActive,
				},
			});
			if (error) {
				formError = (error as any)?.message ?? 'Failed to create announcement';
				return;
			}
			formSuccess = 'Announcement created. Redirecting...';
			setTimeout(() => goto(`${base}/announcements`), 700);
		} catch (err) {
			formError = err instanceof Error ? err.message : 'Failed to create announcement';
		} finally {
			saving = false;
		}
	}
</script>

<div class="p-6">
	<div class="mx-auto max-w-3xl space-y-6">
		<a href="{base}/announcements" class="text-xs text-ds-text-secondary hover:text-ds-text">
			&larr; Back to Announcements
		</a>

		<section class="space-y-4">
			<h2 class="text-2xl font-semibold text-ds-text">New Announcement</h2>

			<div class="rounded-lg border border-ds-border bg-ds-surface p-6 backdrop-blur">
				<AnnouncementForm bind:form {events} />

				<div class="flex flex-wrap items-center gap-3 pt-4">
					<Button variant="approve" onclick={create} disabled={saving || !isFormValid}>
						{saving ? 'Creating...' : 'Create Announcement'}
					</Button>
					<Button variant="ghost" onclick={() => goto(`${base}/announcements`)}>Cancel</Button>
					{#if formError}
						<span class="text-sm text-ds-red">{formError}</span>
					{/if}
					{#if formSuccess}
						<span class="text-sm text-ds-green">{formSuccess}</span>
					{/if}
				</div>
			</div>
		</section>
	</div>
</div>
