---
name: copycat-game
description: Change or improve the Copycat dance app on a/copycat, including scoring, pose tracking, camera, recording, music, the feed, profiles, parties and performance, and post a new version of it. Use whenever a member wants to fix, improve or extend Copycat itself, or build their own version of it.
---

# Change the Copycat app

Copycat is the Copycat iPhone app rebuilt for the web, screen for screen: Home, Play and Profile tabs, the dance page, song page, music picker, recording and review, play with the creator's ghost, results, comments, settings, and 6-person parties. Pose tracking and the person mask are MediaPipe compiled to WebAssembly, in a Web Worker; camera frames never leave the device. Preact and htm load from jsDelivr; there is no build step.

Read the community first (`get_community` with slug `copycat`) and follow the [Abstracts kit](https://abstracts.co/kit/abstracts/SKILL.md) and its [web artifacts guide](https://abstracts.co/kit/abstracts/references/web-artifacts.md). Nothing is posted until the member accepts it.

## How it runs on Abstracts

- The app is the a/copycat About artifact (`artifacts/copycat/`). Its `artifact.json` asks for `camera` and `microphone`, so Abstracts runs it on its camera origin instead of the opaque sandbox.
- Everything that needs the member goes through the **host bridge** (`js/data/bridge.js`): `viewer`, `post` (Publish dance), `reply` (comments), `vote` (likes), `save`, `share`, `open`, `roomToken` (parties). Abstracts shows its own sheet for anything published.
- The member's abstracts account is their Copycat account. The app has no sign-in, sign-up or onboarding screens of its own: it asks the bridge for `viewer` when it needs to know who is playing, and a signed-out member signs in on abstracts.
- Parties use **Abstracts rooms** (`js/party/room.js`): presence, shared state (`host`, `selected`, `vote:<id>`, `ready:<id>`, `media:<id>`, `reaction:<id>`, `round`, `final:<id>`), relayed live scores, server time for the synced start, and WebRTC signaling. Video and voice go peer to peer.
- Reads use public JSON: `https://abstracts.co/a/copycat.json`, artifact and post `.json`, `/u/<name>.json` (`js/data/store.js`).
- Each dance post's `index.html` loads the app from GitHub Pages (https://abstracts-co.github.io/copycat/), which serves this repository's `main` branch, so merged changes reach every dance.

## The files (in `artifacts/copycat/`)

| File | What it is |
| --- | --- |
| `js/app.js` | Tabs, navigation stack, routes, in-place sizing |
| `js/screens/*.js` | One file per iPhone screen: `home`, `playhub`, `profile`, `dance`, `song`, `picker`, `gameplay` (record and play), `review`, `lobby`, `more` (comments, settings, report) |
| `js/engine/pose.js`, `tracker-worker.js` | Camera, MediaPipe in a worker on the whole camera frame, and the 9:16 crop a recording keeps (CPU delegate: the GPU delegate can't read masks back on some WebGL stacks) |
| `js/engine/stage.js` | Picture, ghost shader, trails, progress edge |
| `js/engine/recorder.js` | Records the dance video, ghost track and pose |
| `js/engine/score.js` | The scorer: a port of the iPhone `ScoreFold` (20 Hz ticks, half-second windows, Perfect/Great/Good, combos) |
| `js/engine/music.js` | Song clock, clip previews, Openverse search |
| `js/data/*.js` | Format, feed and profiles, host bridge, publishing and drafts |
| `js/party/room.js` | Parties |

## Run and test

```sh
node tools/serve.mjs                       # http://localhost:8800
node tools/room-server.mjs                 # local rooms for party tests (npm i --no-save ws)
node tools/test-score.mjs                  # scorer on the starter dances: exact copy ≈ 98, wrong dance and standing still stay low
node tools/check.mjs                       # every folder within upload limits, every dance and track valid
```

- http://localhost:8800/tools/host.html?user=alex stands in for abstracts.co: it answers the bridge as member `alex` and points parties at the local room server. Open a second browser with `?user=sam&a_room=<code>` to test a party.
- Chrome can use a video as its webcam: `--use-fake-device-for-media-stream --use-fake-ui-for-media-stream --use-file-for-fake-video-capture=dancer.y4m` (`ffmpeg -i in.webm -vf scale=540:960,fps=30 -pix_fmt yuv420p dancer.y4m`). Use an absolute path.
- Check every screen at 393×852, in the About column, and full screen on a wide window with a 16:9 camera (the camera must show its whole frame, never a zoomed 9:16 strip). Headless Chrome on software GL runs tracking slowly; judge smoothness on a real device.

A scoring change must keep `tools/test-score.mjs` passing. Files must stay under 5 MB each and 100 per folder.

## Post your version

Post the changed `artifacts/copycat/` folder as a new Artifact with a new id and `based_on: "copycat"`, category `game`, so people can try it in place. Moderators merge the ones that should become the app. To change it directly, open a pull request against `main`.

## Ideas to build next

- Save & share a replay video of your run (the iPhone results screen's main button).
- Hand and finger tracking (MediaPipe Hand Landmarker) for dances with hand signs.
- Friends and follows, once Abstracts has them; today Add friend shares a link.
- A full-body mode in Create (the scorer and framing already support `mode: "full"`).
