<script lang="ts">
	import type { components } from '$lib/api';

	type ProjectLapses = components['schemas']['ProjectLapsesResponse'];

	interface Props {
		lapses: ProjectLapses | null;
		loading?: boolean;
	}

	let { lapses, loading = false }: Props = $props();

	// Timelapse id whose video player is open — one at a time keeps several
	// videos from playing over each other.
	let playingId = $state<string | null>(null);

	const timelapses = $derived(lapses?.timelapses ?? []);

	function fmtDuration(seconds: number): string {
		const total = Math.round(seconds);
		const m = Math.floor(total / 60);
		const s = total % 60;
		return m > 0 ? `${m}m ${s}s` : `${s}s`;
	}

	function fmtDate(iso: string): string {
		return new Date(iso).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
		});
	}
</script>

<div class="h-full flex flex-col overflow-y-auto bg-rv-bg p-6 gap-5">
	{#if loading}
		<div class="flex-1 flex items-center justify-center text-sm text-rv-dim">
			Loading timelapses...
		</div>
	{:else if lapses?.error}
		<div class="flex-1 flex items-center justify-center">
			<div class="px-4 py-3 text-sm text-[#e8a732] bg-[rgba(176,114,25,0.1)] rounded text-center">
				{lapses.error}
			</div>
		</div>
	{:else if !lapses?.lapseUser}
		<div class="flex-1 flex items-center justify-center text-sm text-rv-dim">
			No Lapse account linked to this user's Hackatime.
		</div>
	{:else if timelapses.length === 0}
		<div class="flex-1 flex flex-col items-center justify-center gap-1 text-sm text-rv-dim">
			<span>No timelapses for this project's Hackatime projects.</span>
			{#if lapses.otherTimelapseCount > 0}
				<span>
					@{lapses.lapseUser.handle} has {lapses.otherTimelapseCount} timelapse{lapses.otherTimelapseCount === 1 ? '' : 's'} on other projects.
				</span>
			{/if}
		</div>
	{:else}
		<div class="shrink-0 flex items-baseline justify-between gap-3">
			<h2 class="text-2xl font-bold m-0 leading-tight">Timelapses</h2>
			<span class="text-sm text-rv-dim">
				{timelapses.length} for this project · by @{lapses.lapseUser.handle}
			</span>
		</div>

		<div class="grid grid-cols-1 xl:grid-cols-2 gap-5">
			{#each timelapses as t (t.id)}
				<div class="border border-rv-border rounded-lg overflow-hidden bg-rv-surface flex flex-col">
					{#if playingId === t.id && t.playbackUrl}
						<!-- svelte-ignore a11y_media_has_caption -->
						<video
							class="w-full aspect-video bg-black"
							src={t.playbackUrl}
							poster={t.thumbnailUrl ?? undefined}
							controls
							autoplay
						></video>
					{:else}
						<button
							type="button"
							class="relative w-full bg-rv-surface2 cursor-pointer group disabled:cursor-default"
							onclick={() => (playingId = t.id)}
							disabled={!t.playbackUrl}
							title={t.playbackUrl ? 'Play timelapse' : 'Still processing'}
						>
							{#if t.thumbnailUrl}
								<img
									src={t.thumbnailUrl}
									alt={t.name}
									class="w-full aspect-video object-cover block"
									loading="lazy"
								/>
							{:else}
								<div class="w-full aspect-video"></div>
							{/if}
							<span class="absolute inset-0 flex items-center justify-center">
								{#if t.playbackUrl}
									<span class="w-12 h-12 rounded-full bg-black/60 flex items-center justify-center group-hover:bg-black/80 transition-colors duration-150">
										<svg class="w-5 h-5 text-white ml-0.5" viewBox="0 0 24 24" fill="currentColor">
											<polygon points="5 3 19 12 5 21 5 3" />
										</svg>
									</span>
								{:else}
									<span class="text-xs text-rv-dim bg-black/60 px-2.5 py-1 rounded">
										processing…
									</span>
								{/if}
							</span>
						</button>
					{/if}
					<div class="px-4 py-3 flex flex-col gap-1">
						<div class="flex items-center justify-between gap-3">
							<span class="text-sm text-rv-text font-semibold truncate" title={t.name}>
								{t.name}
							</span>
							<span class="text-[12px] text-rv-dim whitespace-nowrap shrink-0">
								{fmtDuration(t.duration)} · {fmtDate(t.createdAt)}
							</span>
						</div>
						{#if t.hackatimeProject}
							<span class="text-[12px] text-rv-dim truncate" title={t.hackatimeProject}>
								↳ {t.hackatimeProject}
							</span>
						{/if}
					</div>
				</div>
			{/each}
		</div>

		{#if lapses.otherTimelapseCount > 0}
			<div class="shrink-0 text-[12px] text-rv-dim">
				+{lapses.otherTimelapseCount} more timelapse{lapses.otherTimelapseCount === 1 ? '' : 's'} on other projects by @{lapses.lapseUser.handle}
			</div>
		{/if}
	{/if}
</div>
