<script lang="ts">
	import { getLocale, setLocale, locales } from '$lib/paraglide/runtime';

	const labels: Record<string, string> = {
		en: 'EN',
		es: 'ES'
	};

	const current = $derived(getLocale());

	function pick(locale: string) {
		if (locale === current) return;
		setLocale(locale as (typeof locales)[number]);
	}
</script>

<div class="locale-switcher" role="group" aria-label="Language">
	{#each locales as locale, i (locale)}
		{#if i > 0}<span class="sep" aria-hidden="true">/</span>{/if}
		<button
			type="button"
			class="locale-btn"
			class:active={locale === current}
			aria-pressed={locale === current}
			onclick={() => pick(locale)}
		>
			{labels[locale] ?? locale.toUpperCase()}
		</button>
	{/each}
</div>

<style>
	.locale-switcher {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		font-family: 'Bricolage Grotesque', sans-serif;
		font-size: 13px;
		letter-spacing: 0.05em;
	}
	.locale-btn {
		background: transparent;
		border: none;
		color: rgba(255, 255, 255, 0.55);
		cursor: pointer;
		padding: 2px 4px;
		font: inherit;
		transition: color 120ms ease;
	}
	.locale-btn:hover {
		color: rgba(255, 255, 255, 0.85);
	}
	.locale-btn.active {
		color: white;
		font-weight: 600;
	}
	.sep {
		color: rgba(255, 255, 255, 0.3);
	}
</style>
