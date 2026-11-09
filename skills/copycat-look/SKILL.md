---
name: copycat-look
description: Change how Copycat looks and moves, from the purple ghost, hand trails, the rainbow progress edge and feedback words to the Liquid Glass buttons, screens and transitions. Use when a member wants new effects, animations, a theme or a visual fix in Copycat, even if they only say "make the ghost look cooler".
---

# Change Copycat's look

Copycat copies the iPhone app's design: black, canary yellow (`#F4D63A`), iOS type sizes and Liquid Glass controls. Keep that language unless the member asks to change it. Read the community first (`get_community` with slug `copycat`) and follow the [Abstracts kit](https://abstracts.co/kit/abstracts/SKILL.md). Nothing is posted until the member accepts it.

| What people see | Where |
| --- | --- |
| The purple ghost (the creator's masked video) | `FS` shader and `GhostLayer` in `artifacts/copycat/js/engine/stage.js` (a port of the iPhone `ghost_fragment`) |
| The ghost lining up with the player | `GhostAlign` in `stage.js` |
| Cyan (player) and purple (ghost) hand trails and sparks | `Trails` in `stage.js` |
| The rainbow progress around the screen edge | `drawPerimeter` in `stage.js` |
| Privacy silhouette and background photo | `Stage.drawPicture` in `stage.js` |
| Score card, combo, Perfect/Great/Good, countdown, framing bubble, results | `screens/gameplay.js`, styles in `css/app.css` (`.scorecard`, `.feedback`, `.countdown`, `.framing`, `.results`) |
| Glass buttons, sheets, dialogs, menus, tab bar | `.glass`, `.glassProminent`, `.sheet`, `.tabbar` in `css/app.css`; components in `js/ui.js` |
| Icons (SF Symbols look-alikes) | `js/icons.js` |

Rules for motion here: keep the ghost readable over any camera picture; keep one canvas per layer and no per-frame DOM; honor `prefers-reduced-motion`; never draw the ghost at a different time than the scorer reads it. Check at 393×852 (iPhone) and in the About column (580 px wide) with `node tools/serve.mjs` and `tools/host.html`. Then follow `skills/copycat-game` to test and post the new version.
