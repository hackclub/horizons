<script lang="ts">
	import './layout.css';
	import '$lib/themeStore';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href="/favicon.ico" sizes="any" />
	<link rel="icon" href="/favicon.png" type="image/png" />
	<title>Horizons Admin | Hack Club</title>
</svelte:head>

{@render children()}
