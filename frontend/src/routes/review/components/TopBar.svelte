<script lang="ts">
	interface Props {
		currentIndex: number;
		totalCount: number;
		onPrev: () => void;
		onNext: () => void;
		onBackToGallery?: () => void;
	}

	let { currentIndex, totalCount, onPrev, onNext, onBackToGallery }: Props = $props();
</script>

<div class="flex items-center justify-between px-5 py-2.5 bg-rv-surface border-b border-rv-border shrink-0">
	<div class="flex items-center gap-3">
		{#if onBackToGallery}
			<button class="bg-rv-surface2 border border-rv-border text-rv-dim px-3.5 py-1.5 rounded-md cursor-pointer text-[12px] font-inherit transition-all duration-150 hover:text-rv-text hover:border-rv-accent" onclick={onBackToGallery}>← Gallery</button>
		{/if}
		<div class="font-[Space_Mono,monospace] font-bold text-[18px] text-rv-accent">HORIZONS <span class="text-rv-text font-normal text-[13px] ml-2">Project Review</span></div>
	</div>
	<div class="text-[12px] text-rv-dim">
		Reviewing <strong class="text-rv-accent">{currentIndex + 1}</strong> of <strong class="text-rv-accent">{totalCount}</strong> pending
	</div>
	<div class="flex gap-1.5">
		<button class="bg-rv-surface2 border border-rv-border text-rv-dim px-3.5 py-1.5 rounded-md cursor-pointer text-[12px] font-inherit transition-all duration-150 hover:not-disabled:text-rv-text hover:not-disabled:border-rv-accent disabled:opacity-40 disabled:cursor-not-allowed" onclick={onPrev} disabled={currentIndex <= 0}>← Prev</button>
		<button class="bg-rv-surface2 border border-rv-border text-rv-dim px-3.5 py-1.5 rounded-md cursor-pointer text-[12px] font-inherit transition-all duration-150 hover:not-disabled:text-rv-text hover:not-disabled:border-rv-accent disabled:opacity-40 disabled:cursor-not-allowed" onclick={onNext} disabled={currentIndex >= totalCount - 1}>Next →</button>
	</div>
</div>
