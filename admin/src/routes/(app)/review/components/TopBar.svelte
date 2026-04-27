<script lang="ts">
	import { theme, toggleTheme } from '$lib/themeStore';

	interface Props {
		currentIndex: number;
		totalCount: number;
		onNext: () => void;
		onPrev: () => void;
		onBackToGallery?: () => void;
		/** Reviewer's own decision — null when the reviewer hasn't voted yet. */
		reviewPassed?: boolean | null;
		/** Whether there is an unseen project ahead/behind to navigate to. */
		nextDisabled?: boolean;
		prevDisabled?: boolean;
	}

	let {
		currentIndex,
		totalCount,
		onNext,
		onPrev,
		onBackToGallery,
		reviewPassed = null,
		nextDisabled,
		prevDisabled,
	}: Props = $props();

	let alreadyReviewed = $derived(reviewPassed !== null);

	const btnClass = "bg-rv-surface2 border border-rv-border text-rv-dim px-3.5 py-1.5 rounded-md cursor-pointer text-[12px] font-inherit transition-all duration-150 hover:not-disabled:text-rv-text hover:not-disabled:border-rv-accent disabled:opacity-40 disabled:cursor-not-allowed";
</script>

<div class="flex items-center justify-between px-5 py-2.5 bg-rv-surface border-b border-rv-border shrink-0">
	<div class="flex items-center gap-1.5">
		{#if onBackToGallery}
			<button class={btnClass} onclick={onBackToGallery}>← Gallery</button>
		{/if}
		<a href="/admin/review/stats" class="{btnClass} no-underline inline-block">Stats</a>
		{#if alreadyReviewed}
			<span
				class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold border bg-yellow-500/15 text-yellow-600 border-yellow-500/40"
				title="Reviewer has already voted on this submission. Submitting again will overwrite the prior decision."
			>
				<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
					<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
					<line x1="12" y1="9" x2="12" y2="13" />
					<line x1="12" y1="17" x2="12.01" y2="17" />
				</svg>
				Already {reviewPassed ? 'Approved' : 'Rejected'}
			</span>
		{/if}
	</div>

	<div class="flex items-center gap-3">
		{#if !alreadyReviewed}
			<div class="text-[12px] text-rv-dim">
				Reviewing <strong class="text-rv-accent">{currentIndex + 1}</strong> of <strong class="text-rv-accent">{totalCount}</strong> pending
			</div>
		{/if}

		<!-- Dark/Light toggle -->
		<button
			class="bg-rv-surface2 border border-rv-border text-rv-dim p-1.5 rounded-md cursor-pointer transition-all duration-150 hover:border-rv-accent hover:text-rv-accent"
			onclick={toggleTheme}
			title="Toggle dark/light mode"
		>
			{#if $theme === 'dark'}
				<!-- Sun icon for switching to light -->
				<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<circle cx="12" cy="12" r="5" />
					<line x1="12" y1="1" x2="12" y2="3" />
					<line x1="12" y1="21" x2="12" y2="23" />
					<line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
					<line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
					<line x1="1" y1="12" x2="3" y2="12" />
					<line x1="21" y1="12" x2="23" y2="12" />
					<line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
					<line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
				</svg>
			{:else}
				<!-- Moon icon for switching to dark -->
				<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
				</svg>
			{/if}
		</button>

		{#if !alreadyReviewed}
			<button
				class={btnClass}
				onclick={onPrev}
				disabled={prevDisabled ?? currentIndex <= 0}
			>Previous</button>
			<button
				class={btnClass}
				onclick={onNext}
				disabled={nextDisabled ?? currentIndex >= totalCount - 1}
			>Skip</button>
		{/if}
	</div>
</div>
