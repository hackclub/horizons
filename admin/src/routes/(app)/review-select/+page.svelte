<script lang="ts">
	import { base } from '$app/paths';

	const SHOW_MANITEJ_REVIEW = false;
</script>

<div class="flex flex-1 items-center justify-center gap-12 px-10 py-20">
	<div class="flex flex-1 max-w-[500px] flex-col items-center gap-3">
		<a
			href="{base}/review"
			class="flex w-full flex-col items-center gap-2.5 overflow-clip rounded-lg border border-ds-border bg-ds-surface px-2 py-8 shadow-[var(--color-ds-shadow)] active:scale-[0.97] no-underline"
		>
			<img
				src="{base}/content/review1-preview.png"
				alt="Review Platform 1"
				class="h-[235px] w-[360px] rounded object-cover"
				onerror={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
			/>
			<p class="text-2xl font-semibold text-ds-text">Evan's Review Platform</p>
			<p class="text-xs font-semibold text-ds-text-muted/60">Click to Open</p>
		</a>

		{#if !SHOW_MANITEJ_REVIEW}
			<a href="{base}/review2" class="text-xs text-ds-text-placeholder underline hover:text-ds-text">Go to review 2 →</a>
		{/if}
	</div>

	{#if SHOW_MANITEJ_REVIEW}
		<a
			href="{base}/review2"
			class="flex flex-1 max-w-[500px] flex-col items-center gap-2.5 overflow-clip rounded-lg border border-ds-border bg-ds-surface px-2 py-8 shadow-[var(--color-ds-shadow)] active:scale-[0.97] no-underline"
		>
			<img
				src="{base}/content/review2-preview.png"
				alt="Manitej's Review Platform"
				class="h-[235px] w-[360px] rounded object-cover"
				onerror={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
			/>
			<p class="text-2xl font-semibold text-ds-text">Manitej's Review Platform</p>
			<p class="text-xs font-semibold text-ds-text-muted/60">Click to Open</p>
		</a>
	{/if}
</div>
