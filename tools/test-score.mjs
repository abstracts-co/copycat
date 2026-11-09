// node tools/test-score.mjs: the scorer must reward a faithful copy of a real dance and refuse idle or wrong dancing.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { parsePose, sample } from '../artifacts/copycat/js/data/format.js';
import { Scorer } from '../artifacts/copycat/js/engine/score.js';
import { STAGE } from '../artifacts/copycat/js/engine/pose.js';

const load = (id) => ({ ...parsePose(JSON.parse(readFileSync(new URL(`../artifacts/${id}/pose.json`, import.meta.url), 'utf8'))), mode: 'upper' });
const play = (dance, poseAt, fps = 20) => {
  const s = new Scorer(dance, STAGE.aspect);
  for (let t = 0; t <= dance.length; t += 1 / fps) { const p = poseAt(t); if (p) s.live.push(t, p); s.advance(t); }
  return s.advance(dance.length, true).final;
};
const noise = (p, amount) => p.map((v, i) => (i % 3 === 2 ? v : v + (Math.random() - 0.5) * amount));
const ids = ['nae-nae', 'the-whip'], results = {};
for (const id of ids) {
  const d = load(id), other = load(ids.find((x) => x !== id));
  const r = {
    exact: play(d, (t) => sample(d.frames, t)),
    jitter: play(d, (t) => { const p = sample(d.frames, t); return p && noise(p, 0.012); }),
    late: play(d, (t) => sample(d.frames, Math.max(0, t - 0.3))),
    wrong: play(d, (t) => sample(other.frames, t % other.length)),
    still: play(d, () => d.frames[Math.floor(d.frames.length / 2)]),
  };
  results[id] = r;
  assert.ok(r.exact >= 85, `${id} exact ${r.exact}`);
  assert.ok(r.jitter >= 75, `${id} jitter ${r.jitter}`);
  assert.ok(r.late >= 60, `${id} late ${r.late}`);
  assert.ok(r.wrong <= 30, `${id} wrong ${r.wrong}`);
  assert.ok(r.still <= 40, `${id} still ${r.still}`);
}
console.table(results);
