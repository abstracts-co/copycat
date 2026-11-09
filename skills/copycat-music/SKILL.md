---
name: copycat-music
description: Add music to Copycat on a/copycat as a music pack that anyone can dance to, from Creative Commons sources like Jamendo, ccMixter, Wikimedia or Internet Archive, or the member's own songs. Use when a member wants more songs, a genre, a playlist, their own music or a different music source in Copycat.
---

# Add music to Copycat

Copycat plays songs with an `<audio>` element, straight from their source or from an audio file in the pack's own post. A music pack is a `music.json` that lists tracks; posted as an Artifact in the `music` category, it shows in the app's music picker at once. The format is in [docs/formats.md](../../docs/formats.md).

Read the community first (`get_community` with slug `copycat`) and follow the [Abstracts kit](https://abstracts.co/kit/abstracts/SKILL.md). Nothing is posted until the member accepts it.

## The rule that matters

Every track must be one the whole community may dance to and share: **CC BY, CC BY-SA, CC0 or public domain**, or music the member made and owns. Never NC (non-commercial) or ND (no derivatives) licenses, and never audio from Spotify, Apple Music, YouTube or another streaming service. Check the license on the track's own page, not only in search results. Put the license and its link in every track.

## Find tracks

- **Apple Music previews**: the app's music picker searches Apple's catalog as you type (`https://itunes.apple.com/search?media=music&entity=song&term=`) and plays each song's 30-second preview, linked to the song on Apple Music. Packs can't list them: a pack is for music Copycat may share in full. The song plays in YouTube's own player, so the video stays on YouTube and nothing is copied. Packs can't list YouTube songs: a pack is for music Copycat may share.
- **Openverse** (`https://api.openverse.org/v1/audio/?q=funk&license_type=commercial,modification&category=music`) searches Jamendo, ccMixter, Wikimedia and others. Its `url` field plays directly.
- **Jamendo** tracks play from `https://prod-1.storage.jamendo.com/?trackid=<id>&format=mp32`.
- **Internet Archive** netlabel releases (`https://archive.org/advancedsearch.php?q=collection:netlabels`) often carry CC licenses; use the direct `https://archive.org/download/<item>/<file>.mp3` link.
- **The member's own music**: put the MP3s in the pack's folder and give each track `"file": "tracks/<name>.mp3"` instead of `url` (up to 5 MB each, 10 MB per post), or link a file they host over `https`. Name them as artist.

Check each `url` actually plays (`curl -sI` shows `Content-Type: audio/…`) and lasts at least a minute.

## Tempo and the best part

Dances sync to the beat, so give tracks `bpm`, `firstBeat` and `segment` (25 to 40 seconds that are good to dance to):

```sh
curl -sL -o song.mp3 "<url>"
python3 tools/tempo.py song.mp3      # prints bpm, firstBeat, duration and segment
```

It needs `ffmpeg` and `numpy`. Listen to the segment if you can, and halve or double `bpm` when it's clearly off.

## Post the pack

Make a folder with `music.json`, `artifact.json` (`{"title": "…", "description": "…", "kind": "document", "entry": "content.md", "category": "music"}`) and `content.md` listing every track with artist, license and link. Show the member the list, then post it with `create_post` and give them the `approve_url`. To add tracks to the built-in Starter pack instead, change `artifacts/copycat/library/music.json` in a pull request.

## A new music source in the app

A source with an open API that returns playable `https` audio and a license per track can become a search in the game. That's an app change: see `skills/copycat-game`, and keep the license filter.
