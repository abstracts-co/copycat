---
name: copycat-dance
description: Make a Copycat dance and post it to a/copycat on Abstracts, by recording it in the game or by writing the choreography in code. Use when a member wants to add a dance, a routine, a challenge or moves for a song to Copycat, even if they only say "make a dance for this song" or "add a dance to a/copycat".
---

# Make a Copycat dance

A dance is a pose track: where 15 joints are, 20 times a second, synced to a song. Players copy it while its ghost dances over their camera. The format is in [docs/formats.md](../../docs/formats.md).

Read the community first (`get_community` with slug `copycat`, or https://abstracts.co/a/copycat.json) and follow the [Abstracts kit](https://abstracts.co/kit/abstracts/SKILL.md). Nothing is posted until the member accepts it.

## Two ways to make one

**Record it (the member dances).** Open https://abstracts-co.github.io/copycat/artifacts/copycat/#make. Pick a song, name the dance, pick Upper body or Full body and a length, press Record and dance. Save downloads a zip with everything the post needs: `index.html`, `dance.json`, `artifact.json`, `content.md` and `preview.png`. The member posts that zip on https://abstracts.co/a/copycat/wall with the Artifact cube. You can't record for them: the moves have to be theirs.

**Write it in code (you can do this).** `tools/choreo.mjs` builds dances from moves placed on the beat: each move is a list of poses, one per beat, and each pose places the hands (and feet) in body units, where the shoulder span is 1, the origin is between the shoulders, `+x` is the dancer's left and `+y` is down. Two-bone IK solves elbows and knees.

1. Pick a song from `artifacts/copycat/library/music.json` or a posted music pack. It needs `bpm` and a `segment`; run `python3 tools/tempo.py song.mp3` to estimate them.
2. Add poses to `POSES` and moves to `MOVES` if the dance needs new ones, and add the dance to `DANCES`. 8 to 16 bars of 4 beats is 20 to 40 seconds.
3. `node tools/choreo.mjs` writes `artifacts/copycat/library/dances/<id>.json`.
4. `node tools/test-score.mjs` checks the scorer still rewards copying and refuses idle play.
5. Watch it: `node tools/serve.mjs` and open http://localhost:8800/artifacts/copycat/#dance=s%3A<id>. Press the play button on the stage. Show the member.

To post a written dance as its own Artifact (it shows in the game at once), make a folder with:

- `dance.json`: the generated file.
- `index.html`: copy it from a recorded zip, or use the one below. It runs the dance in place on the Wall and links to the camera game.
- `artifact.json`: `{"title": "…", "description": "A Copycat dance to …", "kind": "web", "entry": "index.html", "category": "dances"}`
- `content.md`: one paragraph naming the dance, song, artist and license.
- `preview.png`: 1200×750. Recording in the game makes one; for a written dance, render a frame of the ghost.

```html
<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="copycat-dance" content="dance.json">
<title>Dance title</title>
<body style="margin:0;background:#000">
<div id="app"></div>
<script type="module" src="https://abstracts-co.github.io/copycat/artifacts/copycat/js/main.js"></script>
</body>
</html>
```

Post it with `create_post` and `artifact` (the kit's artifact recipe), and give the member the `approve_url`. To add a written dance to the built-in starter list instead, change `DANCES` in a pull request, which moderators merge.

## Good dances

- Moves land on the beat and repeat in 4-beat phrases, so people can learn them in one go.
- Upper body dances must work sitting at a laptop: arms, hands, head. Keep the hands inside the frame.
- Full body dances need room to step back. Say so in the title or description.
- Credit the song: title, artist and license come from the track, and show on the dance's page.
