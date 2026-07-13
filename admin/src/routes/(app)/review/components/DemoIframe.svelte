<script lang="ts">
	import { api } from '$lib/api';

	interface Props {
		demoUrl: string | null;
	}

	let { demoUrl }: Props = $props();

	let iframeLoaded = $state(false);
	let iframeElement: HTMLIFrameElement | undefined = $state();

	// null = not yet known / undeterminable → fall back to attempting the iframe.
	// false = the site blocks framing (X-Frame-Options / CSP frame-ancestors) → offer new tab.
	let embeddable = $state<boolean | null>(null);
	let checkingEmbed = $state(false);

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

	// Reset state on navigation and probe whether the demo allows framing.
	// The probe reuses the isolated URL-check worker (the only SSRF-safe place
	// that fetches student-supplied URLs); it reports `embeddable` from the
	// target's X-Frame-Options / CSP frame-ancestors headers. Until the worker
	// populates that field it stays null and we fall back to attempting the iframe.
	$effect(() => {
		const url = demoUrl;
		iframeLoaded = false;
		embeddable = null;

		if (!url || youtubeId) return;

		let cancelled = false;
		checkingEmbed = true;
		api
			.GET('/api/utils/check-url', { params: { query: { url } } })
			.then(({ data }) => {
				if (cancelled) return;
				embeddable = typeof data?.embeddable === 'boolean' ? data.embeddable : null;
			})
			.catch(() => {
				if (!cancelled) embeddable = null;
			})
			.finally(() => {
				if (!cancelled) checkingEmbed = false;
			});

		return () => {
			cancelled = true;
		};
	});
</script>

<div class="flex items-center gap-1.5 px-3 py-2 bg-rv-surface border-b border-rv-border shrink-0">
	<!-- Reload / Load - hidden for YouTube embeds (auto-load) and framing-blocked demos (can't embed) -->
	{#if !youtubeId && embeddable !== false}
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
	{:else if embeddable === false && demoUrl}
		<!-- Site refuses to be framed (X-Frame-Options / CSP) — reviewing in-frame is impossible, so send them to a new tab -->
		<div class="text-center text-rv-dim flex flex-col items-center px-6 max-w-sm">
			<svg class="w-16 h-16 opacity-30 mb-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
				<rect x="3" y="11" width="18" height="10" rx="2" />
				<path d="M7 11V7a5 5 0 0 1 10 0v4" />
			</svg>
			<p class="text-[14px] text-gray-300">This demo can't be embedded</p>
			<p class="text-[12px] opacity-60 mt-1 mb-4">The site blocks being shown in a frame. Open it in a new tab to review.</p>
			<button
				onclick={openExternal}
				class="flex items-center gap-2 bg-rv-accent/15 border border-rv-accent text-rv-accent px-3.5 py-2 rounded-md text-[13px] cursor-pointer transition-all duration-150 hover:bg-rv-accent/25"
			>
				<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<path d="M15 3h6v6" />
					<path d="M10 14L21 3" />
					<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
				</svg>
				Open in new tab
			</button>
			<p class="text-[11px] opacity-40 mt-3 break-all">{demoUrl}</p>
		</div>
	{:else if iframeLoaded && demoUrl}
		<iframe
			class="w-full h-full border-none"
			bind:this={iframeElement}
			src={demoUrl}
			title="Demo preview"
			sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
		></iframe>
	{:else}
		<button
			type="button"
			class="w-full h-full text-center text-rv-dim flex flex-col items-center justify-center cursor-pointer disabled:cursor-default"
			onclick={loadOrReload}
			disabled={!demoUrl}
		>
			<svg class="w-16 h-16 opacity-30 mb-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
				<rect x="2" y="3" width="20" height="14" rx="2" />
				<line x1="8" y1="21" x2="16" y2="21" />
				<line x1="12" y1="17" x2="12" y2="21" />
			</svg>
			<p class="text-[14px]">{checkingEmbed ? 'Checking demo…' : 'Click anywhere to load the demo'}</p>
			{#if demoUrl}
				<p class="text-[12px] opacity-50 mt-1">{demoUrl}</p>
			{/if}
		</button>
	{/if}
</div>
