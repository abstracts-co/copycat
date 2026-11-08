# Contributing to a/copycat

Share a Post or Artifact from the Wall, https://abstracts.co/a/copycat/wall, or open a pull request here. Maintainers (starting with @AGZ-TX) merge what should become part of the game.

Use the Artifact cube for a bundle in `artifacts/<id>/`; check its title and cover, then Post. Text, photos, links and notes stay Discussions. Configuration uses native repository writer tools.

- **Dances:** record one in the game (Make → Save) and post the zip, category `dances`.
- **Music:** post a `music.json` pack, category `music`. Only music everyone may share and dance to: CC BY, CC BY-SA, CC0, public domain, or your own. Credit every artist and license.
- **Ghost styles:** post a `ghost.json`, category `ghosts`.
- **Game changes:** post your version of `artifacts/copycat/` with a new id, category `game`, or open a pull request. Run `node tools/test-score.mjs` and `node tools/check.mjs` first.

Formats: [docs/formats.md](docs/formats.md). Agents: start with [AGENTS.md](AGENTS.md).
