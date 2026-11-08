# Copycat file formats

Copycat reads three kinds of files that members post as Artifacts on [a/copycat](https://abstracts.co/a/copycat). The game finds them through Abstracts' public JSON (`https://abstracts.co/a/copycat.json`, then each artifact's `.json`), so a posted artifact shows up in the game as soon as it's posted. Nothing needs merging.

| File in the artifact folder | Category | What the game does with it |
| --- | --- | --- |
| `dance.json` | `dances` | Lists it under **From a/copycat** on Dances |
| `music.json` | `music` | Adds the pack to **Music** |
| `ghost.json` | `ghosts` | Adds the style to the **Ghost** picker |

The game checks every field and ignores anything it doesn't understand. Only `https` links work, and the game only opens dance files from `abstracts.co` and `abstracts-co.github.io`.

## dance.json: `copycat/dance@1`

```json
{
  "format": "copycat/dance@1",
  "id": "funk-party",
  "title": "Funk Party",
  "by": "Copycat",
  "mode": "upper",
  "aspect": 1.333,
  "start": 24.021,
  "bpm": 120.6,
  "song": { "title": "Funk party 1", "artist": "CJ Rattle", "url": "https://…", "page": "https://www.jamendo.com/track/900207", "license": "CC BY-SA 3.0", "licenseUrl": "https://creativecommons.org/licenses/by-sa/3.0/", "source": "jamendo", "duration": 177.85 },
  "rate": 20,
  "joints": ["nose", "leftShoulder", "rightShoulder", "leftElbow", "rightElbow", "leftWrist", "rightWrist", "leftIndex", "rightIndex", "leftHip", "rightHip", "leftKnee", "rightKnee", "leftAnkle", "rightAnkle"],
  "frames": [[0.5, 0.21, 0.99, "… 3 numbers per joint …"]]
}
```

- `mode`: `upper` scores arms only (sitting at a laptop works); `full` scores arms and legs.
- `start`: seconds into the song where the dance begins. `frames[0]` is at `start`.
- `rate`: always 20 frames a second. A dance is 3 seconds to 10 minutes.
- `frames`: one array per frame, 3 numbers per joint in `joints` order: `x`, `y` (0 to 1 across the camera image, not mirrored, `y` down) and visibility (0 to 1; below 0.35 means not seen). `aspect` is the camera's width over height.
- `song`: a track (below), or `null` for a plain beat at `bpm`. `source: "file"` means the dancer used a song from their own device; players pick their own copy.
- The **left** joints are the dancer's left, which shows on the right of a mirrored screen.

## music.json: `copycat/music@1`

```json
{
  "format": "copycat/music@1",
  "title": "Starter pack",
  "by": "Copycat",
  "tracks": [
    { "title": "Dance with me", "artist": "Manhat10", "url": "https://prod-1.storage.jamendo.com/?trackid=1215805&format=mp32", "page": "https://www.jamendo.com/track/1215805", "license": "CC BY 3.0", "licenseUrl": "https://creativecommons.org/licenses/by/3.0/", "source": "jamendo", "duration": 204.1, "bpm": 115.9, "firstBeat": 0.02, "segment": [74.567, 99.416] }
  ]
}
```

- `url` must play in a browser `<audio>` element over `https`.
- `license` must allow sharing and changes: CC BY, CC BY-SA, CC0 or public domain. No NC or ND licenses, nothing ripped from a streaming service.
- `bpm`, `firstBeat` (seconds to the first beat) and `segment` (a good 25 to 40 seconds to dance to) are optional. `tools/tempo.py` estimates them.
- Up to 200 tracks a pack.

## ghost.json: `copycat/ghost@1`

```json
{ "format": "copycat/ghost@1", "name": "Lava", "color": "#ff6a00", "glow": 24, "width": 0.36, "alpha": 0.55, "trail": "#ffd60a", "head": "cat" }
```

- `color` and `trail`: `#rrggbb`. `glow`: 0 to 40. `width`: limb thickness, 0.05 to 0.6 of the shoulder width. `alpha`: 0.1 to 0.9. `head`: `cat`, `round` or `none`.
- A look that needs new drawing code is a change to the game itself (see `skills/copycat-game`).
