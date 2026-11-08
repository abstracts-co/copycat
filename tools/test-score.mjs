// node tools/test-score.mjs: the scorer must reward a faithful copy and refuse idle or wrong dancing.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { parseDance, sample, RATE } from '../artifacts/copycat/js/dance.js';
import { Scorer } from '../artifacts/copycat/js/score.js';

const load = (id) => parseDance(readFileSync(new URL(`../artifacts/copycat/library/dances/${id}.json`, import.meta.url), 'utf8'));
const play = (dance, poseAt, fps = 30) => {
  const s = new Scorer(dance, dance.aspect);
  for (let t = 0; t <= dance.length; t += 1 / fps) { const p = poseAt(t); if (p) s.live.push(t, p); s.advance(t); }
  return s.advance(dance.length, true);
};
const noise = (p, amount) => p.map((v, i) => (i % 3 === 2 ? v : v + (Math.random() - 0.5) * amount));
const results = {};
for (const id of ['first-steps', 'funk-party', 'robot-rush', 'jack-attack']) {
  const d = load(id), other = load(id === 'funk-party' ? 'robot-rush' : 'funk-party');
  const r = {
    exact: play(d, (t) => sample(d.frames, t)).final,
    jitter: play(d, (t) => { const p = sample(d.frames, t); return p && noise(p, 0.012); }).final,
    late: play(d, (t) => sample(d.frames, Math.max(0, t - 0.3))).final,
    wrong: play(d, (t) => sample(other.frames, t % other.length)).final,
    still: play(d, () => d.frames[0]).final,
    small: play(d, (t) => { const p = sample(d.frames, t), b = d.frames[0]; return p && p.map((v, i) => (i % 3 === 2 ? v : b[i] + (v - b[i]) * 0.5)); }).final,
  };
  results[id] = r;
  assert.ok(r.exact >= 90, `${id} exact ${r.exact}`);
  assert.ok(r.jitter >= 75, `${id} jitter ${r.jitter}`);
  assert.ok(r.late >= 60, `${id} late ${r.late}`);
  assert.ok(r.wrong <= 35, `${id} wrong ${r.wrong}`);
  assert.ok(r.still <= 30, `${id} still ${r.still}`);
}
console.table(results);
