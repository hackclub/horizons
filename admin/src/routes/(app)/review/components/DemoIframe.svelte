<script lang="ts">
	interface Props {
		demoUrl: string | null;
	}

	let { demoUrl }: Props = $props();

	let iframeLoaded = $state(false);
	let iframeElement: HTMLIFrameElement | undefined = $state();

	function getYouTubeId(url: string): string | null {
		try {
			const u = new URL(url);
			// youtu.be/<id>
			if (u.hostname === 'youtu.be') {
				const id = u.pathname.slice(1).split('/')[0];
				return id || null;
			}
			// youtube.com/watch?v=<id>  or  youtube.com/shorts/<id>  or  youtube.com/embed/<id>
			if (u.hostname === 'www.youtube.com' || u.hostname === 'youtube.com' || u.hostname === 'm.youtube.com') {
				if (u.searchParams.has('v')) return u.searchParams.get('v');
				const parts = u.pathname.split('/').filter(Boolean);
				if (parts[0] === 'shorts' || parts[0] === 'embed') return parts[1] ?? null;
			}
		} catch {
			// not a valid URL
		}
		return null;
	}

	const youtubeId = $derived(demoUrl ? getYouTubeId(demoUrl) : null);
	const youtubeEmbedUrl = $derived(youtubeId ? `https://www.youtube.com/embed/${youtubeId}?autoplay=0` : null);

	function loadOrReload() {
		if (!demoUrl || youtubeId) return; // YT embeds auto-load
		if (!iframeLoaded) {
			iframeLoaded = true;
		} else if (iframeElement) {
			iframeElement.src = iframeElement.src;
		}
	}

	function openExternal() {
		if (!demoUrl) return;
		window.open(demoUrl, '_blank');
	}

	const btnClass = "bg-rv-surface2 border border-rv-border text-rv-dim p-1.5 rounded-md cursor-pointer transition-all duration-150 hover:not-disabled:border-rv-accent hover:not-disabled:text-rv-accent disabled:opacity-30 disabled:cursor-not-allowed";

	// Reset iframe when demoUrl changes (navigating to new project)
	$effect(() => {
		demoUrl; // track dependency
		iframeLoaded = false;
	});
</script>

<div class="flex items-center gap-1.5 px-3 py-2 bg-rv-surface border-b border-rv-border shrink-0">
	<!-- Reload / Load - hidden for YouTube embeds since they load automatically -->
	{#if !youtubeId}
		<button class={btnClass} onclick={loadOrReload} disabled={!demoUrl} title={iframeLoaded ? 'Reload' : 'Load demo'}>
			<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<polyline points="23 4 23 10 17 10" />
				<path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
			</svg>
		</button>
	{/if}

	<!-- URL bar -->
	<div class="flex-1 bg-rv-surface2 border border-rv-border rounded-md py-1.5 px-3 text-gray-400 text-[12px] overflow-hidden text-ellipsis whitespace-nowrap">
		{demoUrl ?? 'No demo URL'}
	</div>

	<!-- Open external -->
	<button class={btnClass} onclick={openExternal} disabled={!demoUrl} title="Open in new tab">
		<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
			<path d="M15 3h6v6" />
			<path d="M10 14L21 3" />
			<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
		</svg>
	</button>
</div>

<div class="flex-1 bg-[#0d1117] flex items-center justify-center">
	{#if youtubeEmbedUrl}
		<!-- YouTube embed - renders immediately, no load button needed -->
		<iframe
			class="w-full h-full border-none"
			src={youtubeEmbedUrl}
			title="YouTube video player"
			allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
			allowfullscreen
		></iframe>
	{:else if iframeLoaded && demoUrl}
		<iframe
			class="w-full h-full border-none"
			bind:this={iframeElement}
			src={demoUrl}
			title="Demo preview"
			sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
		></iframe>
	{:else}
		<div class="text-center text-rv-dim flex flex-col items-center">
			<svg class="w-16 h-16 opacity-30 mb-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
				<rect x="2" y="3" width="20" height="14" rx="2" />
				<line x1="8" y1="21" x2="16" y2="21" />
				<line x1="12" y1="17" x2="12" y2="21" />
			</svg>
			<p class="text-[14px]">Click reload to load the demo</p>
			{#if demoUrl}
				<p class="text-[12px] opacity-50 mt-1">{demoUrl}</p>
			{/if}
		</div>
	{/if}
</div>
