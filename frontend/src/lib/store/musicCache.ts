import { writable } from 'svelte/store';

// Tracks are auto-loaded from src/lib/assets/music/. Drop audio files in that
// folder and they show up in the player — no code changes needed. See that
// folder's README for details.
//
// Metadata (title / artist / cover art) can optionally be declared in
// `src/lib/assets/music/tracks.json`. Any file not listed there falls back to
// deriving its title/artist from the filename ("Artist - Title.ext").
const audioModules = import.meta.glob('../assets/music/*.{mp3,ogg,wav,m4a,aac,flac,opus}', {
	eager: true,
	query: '?url',
	import: 'default',
}) as Record<string, string>;

const coverModules = import.meta.glob('../assets/music/*.{png,jpg,jpeg,webp,gif,avif}', {
	eager: true,
	query: '?url',
	import: 'default',
}) as Record<string, string>;

const manifestModules = import.meta.glob('../assets/music/tracks.json', {
	eager: true,
	import: 'default',
}) as Record<string, ManifestEntry[]>;

/** Shape of an entry in the optional tracks.json manifest. */
export interface ManifestEntry {
	/** Audio filename in this folder, e.g. "song.mp3". Required. */
	file: string;
	title?: string;
	artist?: string;
	/** Cover image filename in this folder, e.g. "cover.png". */
	cover?: string;
}

export interface Track {
	title: string;
	artist: string | null;
	cover: string | null;
	url: string;
}

function basename(path: string): string {
	return decodeURIComponent(path.split('/').pop() ?? path);
}

/** Derive title/artist from a filename: "Artist - Title.ext" or "Title.ext". */
function parseName(file: string): { title: string; artist: string | null } {
	const base = file.replace(/\.[^.]+$/, '');
	const dash = base.indexOf(' - ');
	if (dash > 0) {
		return { artist: base.slice(0, dash).trim(), title: base.slice(dash + 3).trim() };
	}
	return { artist: null, title: base.replace(/_+/g, ' ').trim() };
}

const audioByName = new Map(Object.entries(audioModules).map(([p, url]) => [basename(p), url]));
const coverByName = new Map(Object.entries(coverModules).map(([p, url]) => [basename(p), url]));
const manifest: ManifestEntry[] = Object.values(manifestModules)[0] ?? [];

// Manifest-listed tracks first (in manifest order), then any remaining audio
// files alphabetically with filename-derived metadata.
const used = new Set<string>();
const listed: Track[] = [];
for (const entry of manifest) {
	const url = audioByName.get(entry.file);
	if (!url) {
		console.warn(`[music] tracks.json references a file that isn't in the folder: ${entry.file}`);
		continue;
	}
	used.add(entry.file);
	const fallback = parseName(entry.file);
	listed.push({
		title: entry.title?.trim() || fallback.title,
		artist: entry.artist?.trim() || fallback.artist,
		cover: entry.cover ? (coverByName.get(entry.cover) ?? null) : null,
		url,
	});
}

const rest: Track[] = [...audioByName.entries()]
	.filter(([name]) => !used.has(name))
	.sort(([a], [b]) => a.localeCompare(b))
	.map(([name, url]) => ({ ...parseName(name), cover: null, url }));

export const tracks: Track[] = [...listed, ...rest];

// Whether the player panel is visible. The <audio> element itself lives in the
// persistent MusicPlayer component and keeps playing when the panel is hidden;
// this only toggles the card's visibility (music icon in the nav / close X).
export const playerOpen = writable(false);

export const music = {
	open: () => playerOpen.set(true),
	close: () => playerOpen.set(false),
	toggle: () => playerOpen.update((v) => !v),
};

// Persisted playback prefs (mute / volume). Kept at module scope so they
// survive the player unmounting + remounting during focused flows, and mirrored
// to localStorage so they also survive a full reload. Muted by default; once a
// user unmutes, that sticks across pages and sessions.
export interface MusicPrefs {
	muted: boolean;
	volume: number;
}

const PREFS_KEY = 'music:prefs';

function loadPrefs(): MusicPrefs {
	if (typeof localStorage === 'undefined') return { muted: true, volume: 0.5 };
	try {
		const p = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}');
		return {
			muted: p.muted !== false, // default true
			volume: typeof p.volume === 'number' ? Math.min(1, Math.max(0, p.volume)) : 0.5,
		};
	} catch {
		return { muted: true, volume: 0.5 };
	}
}

export const musicPrefs = writable<MusicPrefs>(loadPrefs());

if (typeof window !== 'undefined') {
	musicPrefs.subscribe((p) => {
		try {
			localStorage.setItem(PREFS_KEY, JSON.stringify(p));
		} catch {
			/* localStorage unavailable — prefs just won't persist across reloads */
		}
	});
}
