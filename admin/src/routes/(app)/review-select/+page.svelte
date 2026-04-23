<script lang="ts">
	import { base } from '$app/paths';
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
	</div>
</div>
