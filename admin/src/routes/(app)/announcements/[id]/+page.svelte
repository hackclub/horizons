<script lang="ts">
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { page } from '$app/stores';
	import { onMount } from 'svelte';
	import { api } from '$lib/api';
	import { Button } from '$lib/components';
	import AnnouncementForm, { type AnnouncementFormState } from '../AnnouncementForm.svelte';

	const id = Number($page.params.id);

	let loading = $state(true);
	let notFound = $state(false);
	let events = $state<{ eventId: number; title: string; slug: string }[]>([]);
	let form = $state<AnnouncementFormState>({
		title: '',
		previewText: '',
		body: '',
		eventSlugs: [],
		showOnOpen: false,
		showAsTag: false,
		isActive: true,
	});

	let saving = $state(false);
	let deleting = $state(false);
	let confirmingDelete = $state(false);
	let formError = $state('');
	let formSuccess = $state('');

	let isFormValid = $derived(!!form.title && !!form.previewText && !!form.body);

	onMount(async () => {
		const [aRes, evRes] = await Promise.all([
			api.GET('/api/announcements/admin/{id}' as any, { params: { path: { id } } }),
			api.GET('/api/events/admin' as any, {}),
		]);
		if (evRes.data) events = evRes.data as any;
		const a = aRes.data as any;
		if (!a) {
			notFound = true;
			loading = false;
			return;
		}
		form = {
			title: a.title,
			previewText: a.previewText,
			body: a.body,
			eventSlugs: a.eventSlugs ?? [],
			showOnOpen: a.showOnOpen,
			showAsTag: a.showAsTag,
			isActive: a.isActive,
		};
		loading = false;
	});

	async function save() {
		saving = true;
		formError = '';
		formSuccess = '';
		try {
			const { error } = await api.PUT('/api/announcements/admin/{id}' as any, {
				params: { path: { id } },
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
				formError = (error as any)?.message ?? 'Failed to save';
				return;
			}
			formSuccess = 'Saved.';
		} catch (err) {
			formError = err instanceof Error ? err.message : 'Failed to save';
		} finally {
			saving = false;
		}
	}

	async function remove() {
		deleting = true;
		formError = '';
		try {
			const { error } = await api.DELETE('/api/announcements/admin/{id}' as any, {
				params: { path: { id } },
			});
			if (error) {
				formError = (error as any)?.message ?? 'Failed to delete';
				return;
			}
			goto(`${base}/announcements`);
		} catch (err) {
			formError = err instanceof Error ? err.message : 'Failed to delete';
		} finally {
			deleting = false;
		}
	}
</script>

<div class="p-6">
	<div class="mx-auto max-w-3xl space-y-6">
		<a href="{base}/announcements" class="text-xs text-ds-text-secondary hover:text-ds-text">
			&larr; Back to Announcements
		</a>

		{#if loading}
			<p class="text-sm text-ds-text-secondary">Loading...</p>
		{:else if notFound}
			<p class="text-sm text-ds-red">Announcement not found.</p>
		{:else}
			<section class="space-y-4">
				<h2 class="text-2xl font-semibold text-ds-text">Edit Announcement</h2>

				<div class="rounded-lg border border-ds-border bg-ds-surface p-6 backdrop-blur">
					<AnnouncementForm bind:form {events} />

					<div class="flex flex-wrap items-center gap-3 pt-4">
						<Button variant="approve" onclick={save} disabled={saving || !isFormValid}>
							{saving ? 'Saving...' : 'Save Changes'}
						</Button>
						<Button variant="ghost" onclick={() => goto(`${base}/announcements`)}>Cancel</Button>

						{#if confirmingDelete}
							<Button variant="reject" onclick={remove} disabled={deleting}>
								{deleting ? 'Deleting...' : 'Confirm delete'}
							</Button>
							<Button variant="ghost" onclick={() => (confirmingDelete = false)}>Keep</Button>
						{:else}
							<Button variant="reject" onclick={() => (confirmingDelete = true)}>Delete</Button>
						{/if}

						{#if formError}
							<span class="text-sm text-ds-red">{formError}</span>
						{/if}
						{#if formSuccess}
							<span class="text-sm text-ds-green">{formSuccess}</span>
						{/if}
					</div>
				</div>
			</section>
		{/if}
	</div>
</div>
