<script lang="ts">
	import { browser } from '$app/environment';
	import { TextField, Checkbox } from '$lib/components';
	import { marked } from 'marked';
	import DOMPurify from 'dompurify';

	export type AnnouncementFormState = {
		title: string;
		previewText: string;
		body: string;
		eventSlugs: string[];
		showOnOpen: boolean;
		showAsTag: boolean;
		isActive: boolean;
	};

	type EventOption = { eventId: number; title: string; slug: string };

	let {
		form = $bindable(),
		events = [],
	}: {
		form: AnnouncementFormState;
		events: EventOption[];
	} = $props();

	const previewHtml = $derived(
		browser && form.body ? DOMPurify.sanitize(marked.parse(form.body, { breaks: true }) as string) : '',
	);

	function toggleEvent(slug: string, checked: boolean) {
		form.eventSlugs = checked
			? [...form.eventSlugs, slug]
			: form.eventSlugs.filter((s) => s !== slug);
	}
</script>

<div class="space-y-4">
	<div class="space-y-2">
		<label class="text-sm font-medium text-ds-text-secondary" for="a-title">Title *</label>
		<TextField id="a-title" placeholder="HORIZONS UPDATE" bind:value={form.title} />
		<p class="text-[11px] text-ds-text-secondary">Shown as the announcement heading (rendered uppercase).</p>
	</div>

	<div class="space-y-2">
		<label class="text-sm font-medium text-ds-text-secondary" for="a-preview">Preview text *</label>
		<TextField id="a-preview" placeholder="Macondo tickets added to shop." bind:value={form.previewText} />
		<p class="text-[11px] text-ds-text-secondary">One-liner shown in the inbox list and the floating tag.</p>
	</div>

	<div class="space-y-2">
		<label class="text-sm font-medium text-ds-text-secondary" for="a-body">Body (Markdown) *</label>
		<div class="grid gap-3 md:grid-cols-2">
			<textarea
				id="a-body"
				rows="12"
				placeholder="## What's new&#10;&#10;- Point one&#10;- [A link](https://...)"
				bind:value={form.body}
				class="w-full rounded-lg border border-ds-border bg-ds-surface2 px-3 py-2 font-mono text-sm text-ds-text placeholder:text-ds-text-placeholder focus:border-ds-text-secondary focus:outline-none"
			></textarea>
			<div class="rounded-lg border border-ds-border bg-ds-surface2 px-3 py-2 overflow-y-auto" style="max-height: 20rem;">
				{#if previewHtml}
					<div class="announcement-preview text-sm text-ds-text">{@html previewHtml}</div>
				{:else}
					<p class="text-sm text-ds-text-placeholder">Markdown preview…</p>
				{/if}
			</div>
		</div>
	</div>

	<div class="space-y-2">
		<span class="text-sm font-medium text-ds-text-secondary">Event tags</span>
		<p class="text-[11px] text-ds-text-secondary">
			Leave all unchecked to show this to <strong>everyone</strong>. Otherwise it shows only to users whose
			pinned event is selected here.
		</p>
		{#if events.length === 0}
			<p class="text-sm text-ds-text-placeholder">No events available.</p>
		{:else}
			<div class="grid gap-1.5 sm:grid-cols-2">
				{#each events as ev (ev.eventId)}
					<label class="flex items-center gap-2 text-sm text-ds-text-secondary">
						<Checkbox
							checked={form.eventSlugs.includes(ev.slug)}
							onchange={(e) => toggleEvent(ev.slug, (e.currentTarget as HTMLInputElement).checked)}
						/>
						{ev.title}
					</label>
				{/each}
			</div>
		{/if}
	</div>

	<div class="flex flex-col gap-2 border-t border-ds-border pt-3">
		<label class="flex items-center gap-2 text-sm text-ds-text-secondary">
			<Checkbox bind:checked={form.showOnOpen} />
			Show on open <span class="text-ds-text-placeholder">— pops up as a modal on the user's next app load, until read</span>
		</label>
		<label class="flex items-center gap-2 text-sm text-ds-text-secondary">
			<Checkbox bind:checked={form.showAsTag} />
			Show as tag <span class="text-ds-text-placeholder">— floating top-right tag (only the most recent tagged one shows)</span>
		</label>
		<label class="flex items-center gap-2 text-sm text-ds-text-secondary">
			<Checkbox bind:checked={form.isActive} />
			Active <span class="text-ds-text-placeholder">— uncheck to hide from users without deleting</span>
		</label>
	</div>
</div>

<style>
	.announcement-preview :global(h1),
	.announcement-preview :global(h2),
	.announcement-preview :global(h3) {
		font-weight: 700;
		margin: 0.6em 0 0.3em;
	}
	.announcement-preview :global(h1) {
		font-size: 1.3em;
	}
	.announcement-preview :global(h2) {
		font-size: 1.15em;
	}
	.announcement-preview :global(p) {
		margin: 0 0 0.6em;
	}
	.announcement-preview :global(ul),
	.announcement-preview :global(ol) {
		margin: 0 0 0.6em;
		padding-left: 1.25em;
	}
	.announcement-preview :global(ul) {
		list-style: disc;
	}
	.announcement-preview :global(ol) {
		list-style: decimal;
	}
	.announcement-preview :global(a) {
		text-decoration: underline;
	}
	.announcement-preview :global(code) {
		font-family: ui-monospace, monospace;
		background: rgba(127, 127, 127, 0.15);
		padding: 0.1em 0.3em;
		border-radius: 4px;
	}
	.announcement-preview :global(strong) {
		font-weight: 700;
	}
</style>
