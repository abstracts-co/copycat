# Copycat file formats

Copycat reads two kinds of Artifacts that members post on [a/copycat](https://abstracts.co/a/copycat). The app finds them through Abstracts' public JSON (`https://abstracts.co/a/copycat.json`, then each artifact's `.json`), so a posted artifact shows up in the app as soon as it's posted. Nothing needs merging.

| Category | Files | What the app does with it |
| --- | --- | --- |
| `dances` | `dance.json`, the dance video, the ghost video, `pose.json`, `preview.webp`, `index.html` | Home feed, Popular dances, Trending sounds, profiles, Play, parties |
| `music` | `music.json` | Adds the tracks to the music picker |

The app checks every field and ignores what it doesn't understand. Only `https` links play.

## A dance folder

A dance is what the creator recorded, the way the iPhone app stores it: their video, a ghost track for the purple overlay, and their pose.

| File | What it is |
| --- | --- |
| `video.mp4` (or `.webm`) | The creator's dance, 540×960 (9:16), as shown on the dance page. No sound: the song plays from its own source. |
| `ghost.mp4` (or `.webm`) | 360×320, two halves side by side: the creator's brightness (left, 180×320) and their person mask (right, white is the dancer). The app tints it purple and draws it over the player's camera, like the iPhone app's `ghost_fragment` shader. |
| `pose.json` | 15 joints, 20 times a second, in the same 9:16 frame as the videos. |
| `dance.json` | Title, song, clip and file names (below). |
| `preview.webp` | The card image, a frame of the video. |
| `index.html` | Opens the app on this dance (copy it from any dance folder). |
| `artifact.json` | `{"title", "description", "kind": "web", "entry": "index.html", "poster": "preview.webp", "category": "dances", "permissions": ["camera", "microphone"]}` |
| `content.md` | The dance, song, artist and license in words. |

Each file must be under 5 MB and the folder under 10 MB, so keep dances to about 30 seconds.

### dance.json: `copycat/dance@2`

```json
{
  "format": "copycat/dance@2",
  "title": "Nae Nae",
  "hashtags": ["starter"],
  "mode": "upper",
  "privacy": false,
  "song": { "title": "Funk party 1", "artist": "CJ Rattle", "url": "https://…", "page": "https://www.jamendo.com/track/900207", "license": "CC BY-SA 3.0", "licenseUrl": "https://creativecommons.org/licenses/by-sa/3.0/", "source": "jamendo", "duration": 177.85 },
  "clip": { "start": 24.021, "length": 22.1, "offset": 0 },
  "files": { "video": "video.mp4", "ghost": "ghost.mp4", "pose": "pose.json", "cover": "preview.webp" },
  "credit": { "name": "El Martial", "url": "https://commons.wikimedia.org/wiki/File:Watch_Me_Nae_Nae_-_Tutorial.webm", "license": "CC BY 3.0" }
}
```

- `clip.start`: where in the song the dance begins. `clip.offset`: where in the videos and pose it begins (non-zero after trimming). `clip.length`: seconds.
- `mode`: `upper` scores arms (works sitting at a laptop); `full` also needs feet in view.
- `privacy`: the creator recorded as a silhouette.
- `song.source: "file"` means the creator used a song from their own device; players pick their own copy.
- `credit`: who is in the video when it isn't the poster (a Creative Commons video, for example).

### pose.json

```json
{ "rate": 20, "space": "stage-9x16", "joints": ["nose", "leftShoulder", "rightShoulder", "leftElbow", "rightElbow", "leftWrist", "rightWrist", "leftIndex", "rightIndex", "leftHip", "rightHip", "leftKnee", "rightKnee", "leftAnkle", "rightAnkle"], "frames": [[0.5, 0.21, 0.99, "…3 numbers per joint…"]] }
```

`x` and `y` run 0 to 1 across the 9:16 frame, as the video shows it (`y` down). The third number is visibility; under 0.35 means not seen.

## music.json: `copycat/music@1`

```json
{ "format": "copycat/music@1", "title": "Starter pack", "by": "Copycat", "tracks": [
  { "title": "Dance with me", "artist": "Manhat10", "url": "https://prod-1.storage.jamendo.com/?trackid=1215805&format=mp32", "page": "https://www.jamendo.com/track/1215805", "license": "CC BY 3.0", "licenseUrl": "https://creativecommons.org/licenses/by/3.0/", "source": "jamendo", "duration": 204.1, "bpm": 115.9, "segment": [74.567, 99.416] }
] }
```

- `license` must allow sharing and changes: CC BY, CC BY-SA, CC0 or public domain. No NC or ND licenses, nothing from a streaming service.
- `bpm` and `segment` (a good 25 to 40 seconds to dance to) are optional; `tools/tempo.py` estimates them. The picker starts a clip at `segment[0]`.
