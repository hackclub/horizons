# Music

Drop audio files in this folder and they appear in the in-app music player
automatically. No code changes needed.

Supported audio: `.mp3`, `.ogg`, `.wav`, `.m4a`, `.aac`, `.flac`, `.opus`

## Metadata (optional): `tracks.json`

By default, title/artist come from the filename:

- `Artist - Title.mp3` → title "Title", artist "Artist"
- `Title.mp3` → title "Title", no artist line

To set metadata explicitly (and add cover art), create a `tracks.json` in this
folder:

```json
[
  {
    "file": "some-song.mp3",
    "title": "Some Song",
    "artist": "Did You License Me",
    "cover": "some-song.png"
  },
  { "file": "another.mp3", "title": "Another Track" }
]
```

- `file` (required) — the audio filename in this folder.
- `title`, `artist` — optional; fall back to the filename if omitted.
- `cover` — optional image filename in this folder (`.png`, `.jpg`, `.jpeg`,
  `.webp`, `.gif`, `.avif`) shown as the album art.

Tracks listed in `tracks.json` play first, in the order listed. Any audio files
not listed are appended alphabetically with filename-derived metadata.

Everything here is bundled by Vite (`import.meta.glob` in
`src/lib/store/musicCache.ts`), so keep files reasonably sized.
