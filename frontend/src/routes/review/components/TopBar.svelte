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

<div class="topbar">
	<div class="topbar-left">
		{#if onBackToGallery}
			<button class="back-btn" onclick={onBackToGallery}>← Gallery</button>
		{/if}
		<div class="topbar-logo">HORIZONS <span>Project Review</span></div>
	</div>
	<div class="project-counter">
		Reviewing <strong>{currentIndex + 1}</strong> of <strong>{totalCount}</strong> pending
	</div>
	<div class="topbar-nav">
		<button onclick={onPrev} disabled={currentIndex <= 0}>← Prev</button>
		<button onclick={onNext} disabled={currentIndex >= totalCount - 1}>Next →</button>
	</div>
</div>

<style>
	.topbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 10px 20px;
		background: var(--surface);
		border-bottom: 1px solid var(--border);
		flex-shrink: 0;
	}

	.topbar-left {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.back-btn {
		background: var(--surface2);
		border: 1px solid var(--border);
		color: var(--text-dim);
		padding: 6px 14px;
		border-radius: 6px;
		cursor: pointer;
		font-size: 12px;
		font-family: inherit;
		transition: all 0.15s;
	}

	.back-btn:hover {
		color: var(--text);
		border-color: var(--accent);
	}

	.topbar-logo {
		font-family: 'Space Mono', monospace;
		font-weight: 700;
		font-size: 18px;
		color: var(--accent);
	}

	.topbar-logo span {
		color: var(--text);
		font-weight: 400;
		font-size: 13px;
		margin-left: 8px;
	}

	.project-counter {
		font-size: 12px;
		color: var(--text-dim);
	}

	.project-counter strong {
		color: var(--accent);
	}

	.topbar-nav {
		display: flex;
		gap: 6px;
	}

	.topbar-nav button {
		background: var(--surface2);
		border: 1px solid var(--border);
		color: var(--text-dim);
		padding: 6px 14px;
		border-radius: 6px;
		cursor: pointer;
		font-size: 12px;
		font-family: inherit;
		transition: all 0.15s;
	}

	.topbar-nav button:hover:not(:disabled) {
		color: var(--text);
		border-color: var(--accent);
	}

	.topbar-nav button:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}
</style>
