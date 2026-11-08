---
name: copycat-look
description: Change how Copycat looks and moves, from a new ghost style (colors, glow, thickness, head) to new animations, trails, effects, feedback words or screens. Use when a member wants a new ghost, skin, theme, effect or animation in Copycat, even if they only say "make the ghost look cooler".
---

# Change Copycat's look

Read the community first (`get_community` with slug `copycat`) and follow the [Abstracts kit](https://abstracts.co/kit/abstracts/SKILL.md). Nothing is posted until the member accepts it.

## A ghost style: no code

A `ghost.json` posted as an Artifact in the `ghosts` category shows in every dance's **Ghost** picker at once. Fields are in [docs/formats.md](../../docs/formats.md): `color`, `trail`, `glow`, `width`, `alpha` and `head` (`cat`, `round`, `none`).

1. Try it: add the style to `GHOSTS` in `artifacts/copycat/js/ghost.js`, run `node tools/serve.mjs`, open http://localhost:8800/artifacts/copycat/#dance=s%3Afunk-party, pick it and press play on the stage. Check it on a dark stage and over a bright camera image.
2. Post a folder with `ghost.json`, `content.md` (one line describing it), `artifact.json` (`{"title": "…", "kind": "document", "entry": "content.md", "category": "ghosts"}`) and a `preview.png` of the ghost.

## Animations and effects: code

Drawing lives in `artifacts/copycat/js/ghost.js`:

| What people see | Where |
| --- | --- |
| The ghost and the player's skeleton | `drawPose` |
| Hand trails | `Trails` |
| Progress around the screen edge | `drawProgress` |
| The ghost following the player's position and size | `Anchor`, `place` |
| Fitting a dance to a stage (Watch, cards, covers) | `fitDance`, `placeFit` |
| Built-in styles | `GHOSTS` |

Perfect/Great/Good words, score, combo and results are in `Session` in `artifacts/copycat/js/main.js` and styled in `artifacts/copycat/styles.css` (`.stage-word`, `.stage-score`, `.results`).

Rules for motion here: keep the ghost readable over any camera image, keep the frame rate (one canvas, no per-frame DOM), honor `prefers-reduced-motion`, and keep the ghost and the scoring in sync (never draw the ghost at a different time than the scorer reads it). Then follow `skills/copycat-game` to test and post the new version.
