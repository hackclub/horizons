<script lang="ts">
	import texture from '$lib/assets/texture.png'
	import './layout.css';

	let { children } = $props();

	let windowWidth = $state(0);
	let windowHeight = $state(0);
	let isSmallViewport = $derived(windowWidth < 1024 || windowHeight < 700);
</script>

<style>
	:global(:root) {
		--juice-easing: cubic-bezier(0.34, 1.56, 0.64, 1);
		--juice-duration: 0.35s;

		--juice-scale: 1.04;

		--selected-color: #ffa936;
		--selected-duration: 0.25s;

		--enter-duration: 750ms;
		--enter-easing: cubic-bezier(0, 0.55, 0.45, 1);

		--exit-duration: 750ms;
		--exit-easing: cubic-bezier(0.55, -0.2, 1, 0.45);

}
</style>

<svelte:head>
	<link rel="icon" href="/favicon.ico" sizes="any" />
	<link rel="icon" href="/favicon.png" type="image/png" />
	<title>Horizons | Hack Club</title>
	<meta name="description" content="High school flagship hackathons across the world, brought to you by Hack Club." />

	<meta property="og:type" content="website" />
	<meta property="og:url" content="https://horizons.hackclub.com/" />
	<meta property="og:title" content="Horizons | Hack Club" />
	<meta property="og:description" content="High school flagship hackathons across the world, brought to you by Hack Club." />
	<meta property="og:image" content="https://cdn.hackclub.com/019cc6d0-c592-7ddd-afb1-5685cc0e8aa0/splash.jpg" />

	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:url" content="https://horizons.hackclub.com/" />
	<meta name="twitter:title" content="Horizons | Hack Club" />
	<meta name="twitter:description" content="High school flagship hackathons across the world, brought to you by Hack Club." />
	<meta name="twitter:image" content="https://cdn.hackclub.com/019cc6d0-c592-7ddd-afb1-5685cc0e8aa0/splash.jpg" />
</svelte:head>

<svelte:window bind:innerWidth={windowWidth} bind:innerHeight={windowHeight} />

{#if isSmallViewport}
	<div class="content-area absolute inset-0 overflow-hidden" style="background-color: var(--layout-bg, #f3e8d8)">
		{@render children()}
	</div>
{:else}
	<div class="layout-wrapper relative min-h-screen w-full overflow-hidden overscroll-none" style="background-color: var(--layout-dark, #271c0c)">
		<div class="absolute inset-0 pointer-events-none">
			<div class="w-full h-full bg-cover bg-center -rotate-90 scale-150" style="background-image: url({texture});"></div>
		</div>

		<div class="content-area absolute inset-10 overflow-hidden" style="background-color: var(--layout-bg, #f3e8d8)">
			{@render children()}
		</div>
	</div>
{/if}
