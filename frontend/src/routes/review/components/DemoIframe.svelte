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

<div class="flex items-center gap-2 px-4 py-2 bg-rv-surface border-b border-rv-border shrink-0">
	<div class="flex-1 bg-rv-surface2 border border-rv-border rounded-md py-1.5 px-3 text-rv-blue text-[12px] font-[Space_Mono,monospace] overflow-hidden text-ellipsis whitespace-nowrap">
		{demoUrl ?? 'No demo URL'}
	</div>
	<button
		class="bg-rv-surface2 border border-rv-border text-rv-dim py-1.5 px-2.5 rounded-md cursor-pointer text-[12px] transition-all duration-150 whitespace-nowrap hover:not-disabled:border-rv-accent hover:not-disabled:text-rv-accent disabled:opacity-40 disabled:cursor-not-allowed"
		onclick={loadDemo}
		disabled={!demoUrl}
	>↗ Open</button>
	<button
		class="bg-rv-surface2 border border-rv-border text-rv-dim py-1.5 px-2.5 rounded-md cursor-pointer text-[12px] transition-all duration-150 whitespace-nowrap hover:not-disabled:border-rv-accent hover:not-disabled:text-rv-accent disabled:opacity-40 disabled:cursor-not-allowed"
		onclick={reloadDemo}
		disabled={!iframeLoaded}
	>⟳ Reload</button>
</div>

<div class="flex-1 bg-[#0d1117] flex items-center justify-center">
	{#if iframeLoaded && demoUrl}
		<iframe
			class="w-full h-full border-none"
			bind:this={iframeElement}
			src={demoUrl}
			title="Demo preview"
			sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
		></iframe>
	{:else}
		<div class="text-center text-rv-dim">
			<svg class="w-16 h-16 opacity-30 mb-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
				<rect x="2" y="3" width="20" height="14" rx="2" />
				<line x1="8" y1="21" x2="16" y2="21" />
				<line x1="12" y1="17" x2="12" y2="21" />
			</svg>
			<p class="text-[14px]">Click <strong>Open</strong> to load demo in frame</p>
			{#if demoUrl}
				<p class="text-[12px] opacity-50 mt-1">{demoUrl}</p>
			{/if}
		</div>
	{/if}
</div>
