<script lang="ts">
	import { onDestroy, onMount, untrack } from 'svelte';
	import { get } from 'svelte/store';
	import { fly } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { music, musicPrefs, playerOpen, tracks } from '$lib/store/musicCache';
	import { ultraPerf } from '$lib/store/settingsCache';

	let audioEl = $state<HTMLAudioElement>();
	let index = $state(0);
	// Playback intent. Kept separate from the element's `paused` so switching
	// tracks (which reloads `src`) resumes automatically via the effect below.
	// Autoplays on load — muted by default, so it's silent until the user
	// unmutes (muted autoplay is permitted by browsers). Ultra Performance Mode
	// skips autoplay: muted playback still downloads and decodes audio forever.
	let playing = $state(!get(ultraPerf));
	// Mute/volume initialize from persisted prefs so they carry across pages
	// (player remounts on focused flows) and full reloads. Muted by default;
	// once unmuted, that state sticks.
	const initialPrefs = get(musicPrefs);
	let muted = $state(initialPrefs.muted);
	let volume = $state(initialPrefs.volume);
	// Playback position, for the scrubber.
	let currentTime = $state(0);
	let duration = $state(0);

	// Persist prefs whenever they change.
	$effect(() => {
		musicPrefs.set({ muted, volume });
	});

	const hasTracks = tracks.length > 0;
	// Play order into `tracks`. Starts as the identity so SSR and the initial
	// client render agree on the first <audio src> (no hydration mismatch), then
	// gets shuffled on mount so a random track leads off each load.
	let order = $state<number[]>(tracks.map((_, i) => i));
	const track = $derived(tracks[order[index]] ?? null);

	// The panel behaves like a "now playing" toast: it slides in when a track
	// starts (or the next one begins) and slides back out after 2s of no
	// interaction. Hovering/focusing it keeps it open and reveals the close X.
	let interacting = $state(false);
	let hideTimer: ReturnType<typeof setTimeout> | null = null;
	let wasOpen = false;

	// How long the toast stays out: a longer "announce" hold when a track starts
	// (first / next), a shorter hold after the user stops interacting.
	const ANNOUNCE_MS = 8000;
	const IDLE_MS = 4000;

	function clearHide() {
		if (hideTimer) {
			clearTimeout(hideTimer);
			hideTimer = null;
		}
	}
	function scheduleHide(ms = IDLE_MS) {
		clearHide();
		hideTimer = setTimeout(() => playerOpen.set(false), ms);
	}
	onDestroy(clearHide);

	// Slide the toast out once on mount so it announces the first track even if
	// muted autoplay is blocked (in which case the `play` event never fires).
	onMount(() => {
		if (hasTracks) {
			// Fisher–Yates shuffle so playback starts on a random track and
			// traverses a fresh random order each load.
			const shuffled = tracks.map((_, i) => i);
			for (let i = shuffled.length - 1; i > 0; i--) {
				const j = Math.floor(Math.random() * (i + 1));
				[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
			}
			order = shuffled;
			index = 0;
			playerOpen.set(true);
			scheduleHide(ANNOUNCE_MS);
		}
	});

	// Auto-hide when the panel opens some other way (e.g. the nav toggle), but
	// don't clobber a longer hold that was already scheduled (track announce).
	$effect(() => {
		const open = $playerOpen;
		if (open && !wasOpen && !interacting && !hideTimer) scheduleHide();
		else if (!open) clearHide();
		wasOpen = open;
	});

	function onEnter() {
		interacting = true;
		clearHide();
	}
	function onLeave() {
		interacting = false;
		scheduleHide();
	}
	function onPlay() {
		// Slide the toast out (and hold) when playback begins / the next starts.
		playerOpen.set(true);
		if (!interacting) scheduleHide(ANNOUNCE_MS);
	}

	// Fade the element's actual volume in/out around play/pause so audio eases
	// rather than cutting. This drives `audioEl.volume` directly (no bind:volume)
	// so it never disturbs the persisted `volume` pref / slider position.
	const FADE_MS = 450;
	// Ultra Performance Mode sets volume directly instead of running the rAF fade.
	const fadeMs = () => (get(ultraPerf) ? 0 : FADE_MS);
	let fadeRAF: number | null = null;

	function cancelFade() {
		if (fadeRAF !== null) {
			cancelAnimationFrame(fadeRAF);
			fadeRAF = null;
		}
	}

	function fadeVolume(to: number, ms: number, onDone?: () => void) {
		const el = audioEl;
		if (!el) return;
		cancelFade();
		const from = el.volume;
		if (ms <= 0 || Math.abs(from - to) < 0.001) {
			el.volume = to;
			onDone?.();
			return;
		}
		let startTs: number | null = null;
		const step = (ts: number) => {
			if (startTs === null) startTs = ts;
			const t = Math.min(1, (ts - startTs) / ms);
			el.volume = from + (to - from) * t;
			if (t < 1) {
				fadeRAF = requestAnimationFrame(step);
			} else {
				fadeRAF = null;
				onDone?.();
			}
		};
		fadeRAF = requestAnimationFrame(step);
	}
	onDestroy(cancelFade);

	// Drive play/pause from intent + current track. Re-runs when the track url
	// changes (next/prev) so a new src keeps playing without a manual play call.
	// Reads `volume` untracked so slider drags don't retrigger a play/fade cycle.
	$effect(() => {
		const el = audioEl;
		const url = track?.url;
		const wantPlay = playing;
		if (!el || !url) return;
		if (wantPlay) {
			el.play()
				.then(() => fadeVolume(untrack(() => volume), fadeMs()))
				.catch(() => {
					playing = false;
				});
		} else {
			fadeVolume(0, fadeMs(), () => el.pause());
		}
	});

	// Follow live slider changes while playing (unless a fade owns the volume).
	$effect(() => {
		const el = audioEl;
		const v = volume;
		if (!el) return;
		untrack(() => {
			if (playing && fadeRAF === null) el.volume = v;
		});
	});

	function togglePlay() {
		if (!hasTracks) return;
		playing = !playing;
	}

	function next() {
		if (!hasTracks) return;
		index = (index + 1) % order.length;
	}

	function prev() {
		if (!hasTracks) return;
		// Restart the current track if we're more than a few seconds in,
		// otherwise step back to the previous one.
		if (audioEl && audioEl.currentTime > 3) {
			audioEl.currentTime = 0;
			return;
		}
		index = (index - 1 + order.length) % order.length;
	}

	function onEnded() {
		if (hasTracks) index = (index + 1) % order.length;
	}

	function toggleMute() {
		muted = !muted;
	}

	function onVolumeInput() {
		// Adjusting the slider unmutes (dragging to 0 mutes).
		muted = volume === 0;
	}

	const volPct = $derived(Math.round(volume * 100));
	const progressPct = $derived(duration > 0 ? Math.round((currentTime / duration) * 100) : 0);

	// Keep player interactions from bubbling into the page's WASD/arrow nav.
	function stopKeys(e: KeyboardEvent) {
		e.stopPropagation();
	}
</script>

<!-- Always mounted so audio keeps playing while the panel is hidden. -->
<audio
	bind:this={audioEl}
	src={track?.url}
	bind:muted
	bind:currentTime
	bind:duration
	onended={onEnded}
	onplay={onPlay}
	preload="metadata"
></audio>

{#if $playerOpen}
	<div
		class="absolute bottom-14 right-2 z-[60] hidden w-[300px] rounded-lg bg-[#1a140c] p-3 text-center sm:block"
		role="region"
		aria-label="Music player"
		transition:fly={{ x: 340, opacity: 1, duration: 320, easing: cubicOut }}
		onmouseenter={onEnter}
		onmouseleave={onLeave}
		onfocusin={onEnter}
		onfocusout={onLeave}
	>
		<!-- Close (revealed while interacting) -->
		<button
			type="button"
			class="absolute right-2 top-2 flex items-center text-white/50 transition-[color,opacity] duration-200 hover:text-white cursor-pointer outline-none"
			style="opacity: {interacting ? 1 : 0}; pointer-events: {interacting ? 'auto' : 'none'};"
			aria-label="Close music player"
			onclick={() => music.close()}
		>
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="16" height="16" aria-hidden="true">
				<path d="M18 6 6 18" />
				<path d="m6 6 12 12" />
			</svg>
		</button>

		<span class="block text-left font-cook text-[12px] leading-none tracking-wide text-white">NOW PLAYING</span>

		<!-- Track info -->
		<div class="mt-2">
			<p class="truncate font-bricolage text-[16px] font-normal text-white m-0">
				{track ? track.title : 'No tracks'}
			</p>
			<p class="truncate font-bricolage text-[12px] text-[#c1af96] m-0">
				{track?.artist ?? (track ? '' : 'Add files to /assets/music')}
			</p>
		</div>

		<!-- Scrubber -->
		<input
			class="vol mt-2 w-full"
			type="range"
			min="0"
			max={duration || 0}
			step="0.1"
			bind:value={currentTime}
			onkeydown={stopKeys}
			disabled={!hasTracks || !duration}
			aria-label="Seek"
			style="background: linear-gradient(to right, #ffa936 {progressPct}%, rgba(255,255,255,0.15) {progressPct}%);"
		/>

		<!-- Transport controls -->
		<div class="mt-2 flex items-center justify-center gap-[6px]">
			<button type="button" class="ctrl" aria-label="Previous track" onclick={prev} disabled={!hasTracks}>
				<svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16" aria-hidden="true">
					<polygon points="11 19 2 12 11 5 11 19" />
					<polygon points="22 19 13 12 22 5 22 19" />
				</svg>
			</button>
			<button type="button" class="ctrl" aria-label={playing ? 'Pause' : 'Play'} onclick={togglePlay} disabled={!hasTracks}>
				{#if playing}
					<svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16" aria-hidden="true">
						<rect x="6" y="4" width="4" height="16" rx="1" />
						<rect x="14" y="4" width="4" height="16" rx="1" />
					</svg>
				{:else}
					<svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16" aria-hidden="true">
						<polygon points="6 3 20 12 6 21 6 3" />
					</svg>
				{/if}
			</button>
			<button type="button" class="ctrl" aria-label="Next track" onclick={next} disabled={!hasTracks}>
				<svg viewBox="0 0 24 24" fill="currentColor" width="18" height="16" aria-hidden="true">
					<polygon points="13 19 22 12 13 5 13 19" />
					<polygon points="2 19 11 12 2 5 2 19" />
				</svg>
			</button>
		</div>

		<!-- Mute + volume (subtle), underneath the transport controls -->
		<div class="mt-2 flex items-center justify-center gap-2">
			<button
				type="button"
				class="ctrl subtle shrink-0"
				aria-label={muted ? 'Unmute' : 'Mute'}
				aria-pressed={muted}
				onclick={toggleMute}
			>
				{#if muted}
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="15" height="15" aria-hidden="true">
						<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" stroke="none" />
						<line x1="22" x2="16" y1="9" y2="15" />
						<line x1="16" x2="22" y1="9" y2="15" />
					</svg>
				{:else}
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="15" height="15" aria-hidden="true">
						<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" stroke="none" />
						<path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
						<path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
					</svg>
				{/if}
			</button>
			<input
				class="vol subtle w-12 shrink-0"
				type="range"
				min="0"
				max="1"
				step="0.01"
				bind:value={volume}
				oninput={onVolumeInput}
				onkeydown={stopKeys}
				aria-label="Volume"
				style="background: linear-gradient(to right, {muted ? '#6b5d4a' : '#c1af96'} {volPct}%, rgba(255,255,255,0.12) {volPct}%);"
			/>
		</div>
	</div>
{/if}

<style>
	.ctrl {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		color: white;
		background: none;
		border: none;
		padding: 2px;
		cursor: pointer;
		transition: opacity 0.15s ease, transform 0.15s ease;
	}
	@media (hover: hover) {
		.ctrl:not(:disabled):hover {
			transform: scale(1.12);
		}
	}
	.ctrl:disabled {
		opacity: 0.35;
		cursor: default;
	}

	/* De-emphasize the mute + volume controls (smaller + neutral color); they
	   lift to full strength on hover. Kept clearly visible, not ghosted. */
	.subtle {
		opacity: 0.75;
		transition: opacity 0.15s ease;
	}
	@media (hover: hover) {
		.subtle:hover {
			opacity: 1;
		}
	}
	.subtle.vol::-webkit-slider-thumb {
		width: 9px;
		height: 9px;
	}
	.subtle.vol::-moz-range-thumb {
		width: 9px;
		height: 9px;
	}

	.vol {
		-webkit-appearance: none;
		appearance: none;
		height: 4px;
		border-radius: 999px;
		outline: none;
		cursor: pointer;
	}
	.vol::-webkit-slider-thumb {
		-webkit-appearance: none;
		appearance: none;
		width: 12px;
		height: 12px;
		border-radius: 50%;
		background: #f3e8d8;
		cursor: pointer;
	}
	.vol::-moz-range-thumb {
		width: 12px;
		height: 12px;
		border: none;
		border-radius: 50%;
		background: #f3e8d8;
		cursor: pointer;
	}
</style>
