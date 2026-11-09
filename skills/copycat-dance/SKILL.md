---
name: copycat-dance
description: Make a Copycat dance and post it to a/copycat on Abstracts, by recording it in the app or by building it from a video of one dancer. Use when a member wants to add a dance, a routine or a challenge to Copycat, even if they only say "make a dance for this song" or "add a dance to a/copycat".
---

# Make a Copycat dance

A dance is what its creator recorded: their video, a ghost track (brightness and person mask, for the purple ghost players copy) and their pose, synced to a song. The format is in [docs/formats.md](../../docs/formats.md).

Read the community first (`get_community` with slug `copycat`, or https://abstracts.co/a/copycat.json) and follow the [Abstracts kit](https://abstracts.co/kit/abstracts/SKILL.md). Nothing is posted until the member accepts it.

## Record it (the member dances)

In the app (the About page of https://abstracts.co/a/copycat): Play → Create a dance → choose a song (or import one from the device: the trimmed clip posts with the dance, so only music the member made or that's free to share) and trim the clip → record → Preview your dance → name it → Publish dance. Abstracts shows its own sheet with the Artifact post; the member taps Post. You can't record for them: the moves have to be theirs.

## Build it from a video (you can do this)

`tools/build-dance.mjs` turns a video of one dancer, facing the camera, into a dance folder with the same tracking, crop and ghost format as the app, at 30 fps:

```sh
npm i --no-save playwright && npx playwright install chromium   # once; also needs ffmpeg
node tools/build-dance.mjs --video dancer.webm --title "Nae Nae" --song "Funk party 1" --loops 3 \
  --credit "El Martial|https://commons.wikimedia.org/wiki/File:Watch_Me_Nae_Nae_-_Tutorial.webm|CC BY 3.0" --out out/nae-nae
node tools/check.mjs
```

- Only videos the community may share: CC BY, CC BY-SA, CC0, public domain, or the member's own. Put the dancer in `--credit` when it isn't the member. Wikimedia Commons has CC dance and exercise videos; check each file's license on its page.
- `--song` is a title from `artifacts/copycat/library/music.json` (or add the track there first, with a license from the music skill).
- `--loops` repeats a short tutorial; keep the result under 30 seconds so the video stays under 5 MB.
- Look at it before posting: `node tools/serve.mjs`, copy the folder into `artifacts/`, open http://localhost:8800/artifacts/copycat/ and find it on Home (the app reads the live feed; add `?host=` with a mock like `.scratch/mock` built from the folder to see an unposted dance, as `tools/` does in its tests).

Post the folder with `create_post` and `artifact` (the kit's artifact recipe), category `dances`, and give the member the `approve_url`. To make it a built-in starter dance instead, add the folder under `artifacts/` in a pull request that moderators merge.

## Good dances

- One dancer, whole upper body in view, facing the camera. Full body dances need feet in view all the way through.
- Moves land on the beat and repeat in 4-beat phrases, so people can learn them in one go.
- 15 to 30 seconds. Credit the song (title, artist, license) and anyone else in the video.
