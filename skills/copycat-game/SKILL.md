---
name: copycat-game
description: Change or improve the Copycat dance game on a/copycat, including scoring, pose tracking, camera, music playback, the dance library, screens, multiplayer ideas and performance, and post a new version of it. Use whenever a member wants to fix, improve or extend Copycat itself, or build their own version of it.
---

# Change the Copycat game

Copycat is a browser port of the Copycat iPhone app. Pose tracking is MediaPipe Pose Landmarker compiled to WebAssembly, loaded from jsDelivr; camera frames never leave the device. It's plain ES modules with no build step.

Read the community first (`get_community` with slug `copycat`) and follow the [Abstracts kit](https://abstracts.co/kit/abstracts/SKILL.md) and its [web artifacts guide](https://abstracts.co/kit/abstracts/references/web-artifacts.md). Nothing is posted until the member accepts it.

## Where it runs

- **In place on Abstracts** (the About page and every dance post): a sandboxed frame with an opaque origin. Browsers refuse camera access there, so this mode browses dances, plays the ghost to the music (Watch) and searches music. Play and Make open the camera game in a new tab.
- **The camera game**: https://abstracts-co.github.io/copycat/artifacts/copycat/, served by GitHub Pages from this repository's `main` branch. A change goes live there only when moderators merge it.

`sandboxed` in `js/library.js` tells them apart. Test both.

## The files

All in `artifacts/copycat/`:

| File | What it is |
| --- | --- |
| `js/main.js` | Screens and routing (`#dances`, `#dance=`, `#play=`, `#music`, `#make`), `Watch`, the camera `Session` (play and record), results, posting zips |
| `js/score.js` | `Scorer`: 20 Hz ticks, half-second move windows, Perfect/Great/Good, combos; a port of the iPhone `ScoreFold` |
| `js/dance.js` | The dance format: joints, parse, serialize, sample |
| `js/pose.js` | MediaPipe loader (`loadTracker`) and `openCamera` |
| `js/music.js` | `SongClock` (song time for audio and the beat), Openverse search, music packs |
| `js/library.js` | Starter, community and saved dances; reads `https://abstracts.co/a/copycat.json` |
| `js/ghost.js` | Drawing: see `skills/copycat-look` |
| `js/zip.js` | The zip a recorded dance downloads as |
| `library/` | Starter dances (built by `tools/choreo.mjs`) and the Starter music pack |

## Run and test

```sh
node tools/serve.mjs                 # http://localhost:8800, with CORS like Abstracts
node tools/test-score.mjs            # scorer: exact copy ≈ 99, late ≈ 98, wrong dance and idle stay low
node tools/check.mjs                 # every library file parses; upload limits hold
```

- http://localhost:8800/artifacts/copycat/ is the camera game (localhost counts as secure, so the camera works).
- http://localhost:8800/tools/preview.html is the sandboxed About column, the way Abstracts shows it. Check it at 580px and 390px wide.
- For camera tests without a person, Chrome takes a video as its webcam: `--use-fake-device-for-media-stream --use-fake-ui-for-media-stream --use-file-for-fake-video-capture=dancer.y4m` (make the `.y4m` with `ffmpeg -i in.webm -t 20 -vf scale=640:-2 -pix_fmt yuv420p dancer.y4m`; Wikimedia Commons has CC videos of people dancing and exercising).

A scoring change must keep `tools/test-score.mjs` passing. Uploads are limited to 5 MB a file and 100 files, 10 MB in all.

## Post your version

Post the changed `artifacts/copycat/` folder as a new Artifact with a new id and `based_on: "copycat"`, in the `game` category, so people can try it in place right away. Its camera mode still opens the merged game, so say in the post what to try. Moderators merge the ones that should become the game. To change the game directly, open a pull request against `main`.

## Ideas to build next

- Party mode: several players on the same dance, with scores shared through a Wall post or a small relay.
- Saving a clip of your run (canvas plus camera; the music can't be captured from Jamendo because it sends no CORS headers).
- Hand and finger tracking (MediaPipe Hand Landmarker) for dances that use gestures.
- More music sources with open APIs and per-track licenses.
