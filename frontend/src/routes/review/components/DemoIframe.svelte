<script lang="ts">
	interface Props {
		demoUrl: string | null;
	}

	let { demoUrl }: Props = $props();

	let iframeLoaded = $state(false);
	let iframeElement: HTMLIFrameElement | undefined = $state();

	function loadDemo() {
		if (!demoUrl) return;
		iframeLoaded = true;
	}

	function reloadDemo() {
		if (iframeElement) {
			iframeElement.src = iframeElement.src;
		}
	}

	// Reset iframe when demoUrl changes (navigating to new project)
	$effect(() => {
		demoUrl; // track dependency
		iframeLoaded = false;
	});
</script>

<div class="iframe-bar">
	<div class="iframe-url">{demoUrl ?? 'No demo URL'}</div>
	<button onclick={loadDemo} disabled={!demoUrl}>↗ Open</button>
	<button onclick={reloadDemo} disabled={!iframeLoaded}>⟳ Reload</button>
</div>

<div class="iframe-container">
	{#if iframeLoaded && demoUrl}
		<iframe
			bind:this={iframeElement}
			src={demoUrl}
			title="Demo preview"
			sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
		></iframe>
	{:else}
		<div class="iframe-placeholder">
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
				<rect x="2" y="3" width="20" height="14" rx="2" />
				<line x1="8" y1="21" x2="16" y2="21" />
				<line x1="12" y1="17" x2="12" y2="21" />
			</svg>
			<p>Click <strong>Open</strong> to load demo in frame</p>
			{#if demoUrl}
				<p class="url-hint">{demoUrl}</p>
			{/if}
		</div>
	{/if}
</div>

<style>
	.iframe-bar {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 16px;
		background: var(--surface);
		border-bottom: 1px solid var(--border);
		flex-shrink: 0;
	}

	.iframe-url {
		flex: 1;
		background: var(--surface2);
		border: 1px solid var(--border);
		border-radius: 6px;
		padding: 6px 12px;
		color: var(--blue);
		font-size: 12px;
		font-family: 'Space Mono', monospace;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.iframe-bar button {
		background: var(--surface2);
		border: 1px solid var(--border);
		color: var(--text-dim);
		padding: 6px 10px;
		border-radius: 6px;
		cursor: pointer;
		font-size: 12px;
		transition: all 0.15s;
		white-space: nowrap;
	}

	.iframe-bar button:hover:not(:disabled) {
		border-color: var(--accent);
		color: var(--accent);
	}

	.iframe-bar button:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.iframe-container {
		flex: 1;
		background: #0d1117;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.iframe-container iframe {
		width: 100%;
		height: 100%;
		border: none;
	}

	.iframe-placeholder {
		text-align: center;
		color: var(--text-dim);
	}

	.iframe-placeholder svg {
		width: 64px;
		height: 64px;
		opacity: 0.3;
		margin-bottom: 12px;
	}

	.iframe-placeholder p {
		font-size: 14px;
	}

	.url-hint {
		font-size: 12px;
		opacity: 0.5;
		margin-top: 4px;
	}
</style>
