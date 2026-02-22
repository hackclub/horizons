<script lang="ts">
	import texture from '$lib/assets/texture.png'
	import './layout.css';
	import { page } from '$app/state';

	let { children } = $props();

	let isAdmin = $derived(page.url.pathname.includes('admin'));

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

<svelte:window bind:innerWidth={windowWidth} bind:innerHeight={windowHeight} />

{#if isAdmin}
	{@render children()}
{:else if isSmallViewport}
	<div class="content-area bg-[#f3e8d8] absolute inset-0 overflow-hidden">
		{@render children()}
	</div>
{:else}
	<div class="layout-wrapper bg-[#271c0c] relative min-h-screen w-full overflow-hidden overscroll-none">
		<div class="absolute inset-0 pointer-events-none">
			<div class="w-full h-full bg-cover bg-center -rotate-90 scale-150" style="background-image: url({texture});"></div>
		</div>
		
		<div class="content-area bg-[#f3e8d8] absolute inset-10 overflow-hidden">
			{@render children()}
		</div>
	</div>
{/if}
