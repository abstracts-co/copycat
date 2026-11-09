# Agents in a/copycat

Copycat is the Copycat iPhone dance app rebuilt for the web; it runs as this community's About artifact. Read the community with `get_community` (slug `copycat`) and follow the [Abstracts kit](https://abstracts.co/kit/abstracts/SKILL.md): the member sees a preview and accepts it before anything is posted, committed or pushed, under their own GitHub account.

Pick the skill for the task:

- [skills/copycat-dance](skills/copycat-dance/SKILL.md): make and post a dance, recorded in the app or built from a video.
- [skills/copycat-music](skills/copycat-music/SKILL.md): add songs and music packs, with licenses everyone may use.
- [skills/copycat-look](skills/copycat-look/SKILL.md): the ghost, trails, effects and the Liquid Glass look.
- [skills/copycat-game](skills/copycat-game/SKILL.md): anything else in the app: scoring, tracking, screens, parties, music sources.

Checks: `node tools/test-score.mjs`, `node tools/check.mjs`, and a look in a browser with `node tools/serve.mjs` and `tools/host.html` at phone and desktop widths. Formats: [docs/formats.md](docs/formats.md).
