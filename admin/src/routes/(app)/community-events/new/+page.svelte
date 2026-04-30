<script lang="ts">
	import { goto } from '$app/navigation';
	import { base } from '$app/paths';
	import { api } from '$lib/api';
	import { Button, TextField, Checkbox } from '$lib/components';

	let form = $state({
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
	let saving = $state(false);
	let formError = $state('');
	let formSuccess = $state('');

	let isFormValid = $derived(!!form.name && !!form.start && !!form.end);

	async function createEvent() {
		saving = true;
		formError = '';
		formSuccess = '';

		try {
			const { error } = await api.POST('/api/community-events/admin', {
				body: {
					name: form.name,
					start: form.start,
					end: form.end,
					tagline: form.tagline || undefined,
					joinInfo: form.joinInfo || undefined,
					actionUrl: form.actionUrl || undefined,
					actionLabel: form.actionLabel || undefined,
					description: form.description || undefined,
					isActive: form.isActive,
				},
			});

			if (error) {
				formError = (error as any)?.message ?? 'Failed to create event';
				return;
			}

			formSuccess = 'Event created. Redirecting...';
			setTimeout(() => goto(`${base}/community-events`), 700);
		} catch (err) {
			formError = err instanceof Error ? err.message : 'Failed to create event';
		} finally {
			saving = false;
		}
	}

	function cancel() {
		goto(`${base}/community-events`);
	}
</script>

<div class="p-6">
	<div class="mx-auto max-w-3xl space-y-6">
		<a href="{base}/community-events" class="text-xs text-ds-text-secondary hover:text-ds-text">
			&larr; Back to Community Events
		</a>

		<section class="space-y-4">
			<h2 class="text-2xl font-semibold text-ds-text">New Community Event</h2>

			<div class="rounded-lg border border-ds-border bg-ds-surface backdrop-blur p-6 space-y-4">
				<div class="space-y-2">
					<label class="text-sm font-medium text-ds-text-secondary" for="ce-name">Name *</label>
					<TextField id="ce-name" placeholder="Lock In Call" bind:value={form.name} />
				</div>

				<div class="grid gap-4 md:grid-cols-2">
					<div class="space-y-2">
						<label class="text-sm font-medium text-ds-text-secondary" for="ce-start">Start (UTC) *</label>
						<TextField id="ce-start" placeholder="2026-05-15T16:00:00Z" bind:value={form.start} />
						<p class="text-[11px] text-ds-text-secondary">ISO 8601 UTC, e.g. <code>2026-05-15T16:00:00Z</code></p>
					</div>
					<div class="space-y-2">
						<label class="text-sm font-medium text-ds-text-secondary" for="ce-end">End (UTC) *</label>
						<TextField id="ce-end" placeholder="2026-05-15T17:00:00Z" bind:value={form.end} />
					</div>
				</div>

				<div class="space-y-2">
					<label class="text-sm font-medium text-ds-text-secondary" for="ce-tagline">Tagline</label>
					<TextField id="ce-tagline" placeholder="Lock in!!!!" bind:value={form.tagline} />
				</div>

				<div class="space-y-2">
					<label class="text-sm font-medium text-ds-text-secondary" for="ce-join">Join Info</label>
					<textarea
						id="ce-join"
						rows="2"
						placeholder="[Join the call in #horizons!](https://hackclub.enterprise.slack.com/...)"
						bind:value={form.joinInfo}
						class="w-full rounded-lg border border-ds-border bg-ds-surface2 px-3 py-2 text-sm text-ds-text placeholder:text-ds-text-placeholder focus:border-ds-text-secondary focus:outline-none"
					></textarea>
					<p class="text-[11px] text-ds-text-secondary">
						Markdown supported &mdash; e.g. <code>[Join in #horizons!](https://...)</code>
					</p>
				</div>

				<div class="grid gap-4 md:grid-cols-2">
					<div class="space-y-2">
						<label class="text-sm font-medium text-ds-text-secondary" for="ce-action-url">Action URL</label>
						<TextField
							id="ce-action-url"
							placeholder="https://..."
							bind:value={form.actionUrl}
						/>
						<p class="text-[11px] text-ds-text-secondary">Renders as a button on /app and /app/community.</p>
					</div>
					<div class="space-y-2">
						<label class="text-sm font-medium text-ds-text-secondary" for="ce-action-label">Action Button Label</label>
						<TextField
							id="ce-action-label"
							placeholder="RSVP"
							bind:value={form.actionLabel}
						/>
						<p class="text-[11px] text-ds-text-secondary">Defaults to "Open" if blank.</p>
					</div>
				</div>

				<div class="space-y-2">
					<label class="text-sm font-medium text-ds-text-secondary" for="ce-desc">Description</label>
					<textarea
						id="ce-desc"
						rows="8"
						placeholder="Come hang out!"
						bind:value={form.description}
						class="w-full rounded-lg border border-ds-border bg-ds-surface2 px-3 py-2 text-sm text-ds-text placeholder:text-ds-text-placeholder focus:border-ds-text-secondary focus:outline-none"
					></textarea>
					<p class="text-[11px] text-ds-text-secondary">Markdown supported (links, **bold**)</p>
				</div>

				<label class="flex items-center gap-2 text-sm text-ds-text-secondary">
					<Checkbox bind:checked={form.isActive} />
					Active
				</label>

				<div class="flex flex-wrap items-center gap-3 pt-2">
					<Button variant="approve" onclick={createEvent} disabled={saving || !isFormValid}>
						{saving ? 'Creating...' : 'Create Event'}
					</Button>
					<Button variant="ghost" onclick={cancel}>Cancel</Button>
					{#if formError}
						<span class="text-sm text-red-600">{formError}</span>
					{/if}
					{#if formSuccess}
						<span class="text-sm text-green-700">{formSuccess}</span>
					{/if}
				</div>
			</div>
		</section>
	</div>
</div>
