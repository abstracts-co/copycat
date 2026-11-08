// Builds dances from code: each move places the hands (and feet) on the beat, and two-bone IK solves elbows and knees.
// Body units: the shoulder span is 1, the origin is between the shoulders, +x is the dancer's left (image right), +y is down.
// Run: node tools/choreo.mjs  → writes artifacts/copycat/library/dances/*.json and index.json
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { JOINTS, J, RATE, serializeDance } from '../artifacts/copycat/js/dance.js';

const ROOT = new URL('../artifacts/copycat/library/', import.meta.url);
const tracks = JSON.parse(readFileSync(new URL('music.json', ROOT))).tracks;
const track = (title) => { const t = tracks.find((x) => x.title === title); if (!t) throw new Error(title); return t; };

const UPPER = 0.65, FORE = 0.6, THIGH = 0.82, SHIN = 0.8, HIP_Y = 1.3, HIP_X = 0.3;

const ik = (sx, sy, tx, ty, a, b, side) => {
  let dx = tx - sx, dy = ty - sy, d = Math.hypot(dx, dy);
  const max = (a + b) * 0.999;
  if (d > max) { tx = sx + (dx / d) * max; ty = sy + (dy / d) * max; dx = tx - sx; dy = ty - sy; d = max; }
  d = Math.max(d, Math.abs(a - b) + 0.01);
  const base = Math.atan2(dy, dx), alpha = Math.acos(Math.max(-1, Math.min(1, (a * a + d * d - b * b) / (2 * a * d))));
  const e1 = [sx + a * Math.cos(base + alpha), sy + a * Math.sin(base + alpha)], e2 = [sx + a * Math.cos(base - alpha), sy + a * Math.sin(base - alpha)];
  const mid = [e1, e2].sort((p, q) => side * (q[0] - p[0]))[0];
  return { mid, tip: [tx, ty] };
};

const P = (o) => ({ L: [0.75, 1.15], R: [-0.75, 1.15], lf: [0.38, 2.85], rf: [-0.38, 2.85], dx: 0, dy: 0, lean: 0, head: 0, ...o });
const sym = (x, y, o = {}) => P({ L: [x, y], R: [-x, y], ...o });

const POSES = {
  down: sym(0.72, 1.15), hips: sym(0.45, 1.1), clap: sym(0.03, 0.45), clapHigh: sym(0.04, -1.05), roof: sym(0.45, -1.15),
  y: sym(1.05, -0.95), t: sym(1.72, 0.02), low: sym(1.35, 0.75), chest: sym(0.28, 0.32), cross: P({ L: [-0.38, 0.62], R: [0.38, 0.62] }),
  open: sym(1.0, 0.55), face: sym(0.22, -0.42), pumpUp: sym(0.62, -1.12), pumpDown: sym(0.62, -0.15),
  pointL: P({ L: [1.3, -0.98], R: [-0.45, 1.1] }), pointR: P({ R: [-1.3, -0.98], L: [0.45, 1.1] }),
  pointDownL: P({ L: [-0.55, 1.2], R: [-0.45, 1.1] }), pointDownR: P({ R: [0.55, 1.2], L: [0.45, 1.1] }),
  robotA: P({ L: [1.0, -0.2], R: [-1.0, 1.0] }), robotB: P({ L: [1.0, 1.0], R: [-1.0, -0.2] }),
  swimL: P({ L: [0.25, -1.15], R: [-0.95, 0.95] }), swimR: P({ R: [-0.25, -1.15], L: [0.95, 0.95] }),
  waveL: P({ L: [1.15, -0.85], R: [-0.6, 1.1] }), waveL2: P({ L: [0.75, -1.05], R: [-0.6, 1.1] }),
  waveR: P({ R: [-1.15, -0.85], L: [0.6, 1.1] }), waveR2: P({ R: [-0.75, -1.05], L: [0.6, 1.1] }),
  elbowL: P({ L: [0.15, 0.2], R: [-1.1, 0.6], lean: 6 }), elbowR: P({ R: [-0.15, 0.2], L: [1.1, 0.6], lean: -6 }),
  jackOpen: sym(1.15, -0.9, { lf: [0.95, 2.75], rf: [-0.95, 2.75], dy: -0.12 }), jackClose: sym(0.62, 1.12, { lf: [0.3, 2.85], rf: [-0.3, 2.85] }),
  squat: sym(1.2, 0.5, { dy: 0.5, lf: [0.62, 2.85], rf: [-0.62, 2.85] }), stand: sym(0.7, 1.12, { lf: [0.45, 2.85], rf: [-0.45, 2.85] }),
  kneeL: P({ L: [0.2, 1.0], R: [-0.95, 0.4], lf: [0.25, 1.95], lean: 4 }), kneeR: P({ R: [-0.2, 1.0], L: [0.95, 0.4], rf: [-0.25, 1.95], lean: -4 }),
  stepL: sym(0.95, 0.65, { dx: 0.35, lf: [0.9, 2.85], rf: [-0.05, 2.85] }), stepR: sym(0.95, 0.65, { dx: -0.35, lf: [0.05, 2.85], rf: [-0.9, 2.85] }),
};

const shift = (p, o) => ({ ...p, ...o });

// A move is a list of poses, one per beat (or per half beat with `half`).
const MOVES = {
  groove: { beats: ['down', 'hips', 'down', 'hips'] },
  clap: { beats: ['open', 'clap', 'open', 'clap'] },
  clapUp: { beats: ['chest', 'clapHigh', 'chest', 'clapHigh'] },
  roof: { beats: ['chest', 'roof', 'chest', 'roof'] },
  point: { beats: ['pointL', 'pointDownL', 'pointL', 'pointDownL', 'pointR', 'pointDownR', 'pointR', 'pointDownR'] },
  disco: { beats: ['pointL', 'hips', 'pointR', 'hips'] },
  robot: { beats: ['robotA', 'robotB', 'robotA', 'robotB'] },
  swim: { beats: ['swimL', 'swimR', 'swimL', 'swimR'] },
  wave: { beats: ['waveL', 'waveL2', 'waveL', 'waveL2', 'waveR', 'waveR2', 'waveR', 'waveR2'], half: true },
  ty: { beats: ['t', 'y', 't', 'y'] },
  cross: { beats: ['cross', 'open', 'cross', 'open'] },
  pump: { beats: ['pumpDown', 'pumpUp', 'pumpDown', 'pumpUp'], half: true },
  elbow: { beats: ['elbowL', 'elbowR', 'elbowL', 'elbowR'] },
  peek: { beats: ['face', 'open', 'face', 't'] },
  jack: { beats: ['jackClose', 'jackOpen', 'jackClose', 'jackOpen'] },
  squat: { beats: ['stand', 'squat', 'stand', 'squat'] },
  knee: { beats: ['kneeL', 'stand', 'kneeR', 'stand'] },
  step: { beats: ['stepL', 'stepR', 'stepL', 'stepR'] },
};

const mix = (a, b, t) => a + (b - a) * t;
const mixPose = (a, b, t) => {
  const o = {};
  for (const k of Object.keys(a)) o[k] = Array.isArray(a[k]) ? [mix(a[k][0], b[k][0], t), mix(a[k][1], b[k][1], t)] : mix(a[k], b[k], t);
  return o;
};
// Snap into each pose and hold it, like a dancer hitting the beat.
const hit = (t) => (t < 0.55 ? 1 - Math.pow(1 - t / 0.55, 3) : 1);

const solve = (p, mode, groove) => {
  const out = new Float32Array(JOINTS.length * 3);
  const lean = (p.lean * Math.PI) / 180, dy = p.dy + groove;
  const rot = ([x, y]) => [x * Math.cos(lean) - (y - HIP_Y) * Math.sin(lean), x * Math.sin(lean) + (y - HIP_Y) * Math.cos(lean) + HIP_Y];
  const set = (j, [x, y], v = 0.99) => { out[j * 3] = x + p.dx; out[j * 3 + 1] = y + dy; out[j * 3 + 2] = v; };
  const ls = rot([0.5, 0]), rs = rot([-0.5, 0]);
  set(J.leftShoulder, ls); set(J.rightShoulder, rs); set(J.nose, rot([0, -0.62]));
  for (const [side, s, hand, e, w, idx] of [[1, ls, p.L, J.leftElbow, J.leftWrist, J.leftIndex], [-1, rs, p.R, J.rightElbow, J.rightWrist, J.rightIndex]]) {
    const target = rot(hand);
    const { mid, tip } = ik(s[0], s[1], target[0], target[1], UPPER, FORE, side);
    set(e, mid); set(w, tip);
    const len = Math.hypot(tip[0] - mid[0], tip[1] - mid[1]) || 1;
    set(idx, [tip[0] + ((tip[0] - mid[0]) / len) * 0.14, tip[1] + ((tip[1] - mid[1]) / len) * 0.14]);
  }
  const lh = [HIP_X, HIP_Y], rh = [-HIP_X, HIP_Y];
  set(J.leftHip, lh); set(J.rightHip, rh);
  const legs = mode === 'full' ? 0.99 : 0;
  for (const [side, h, foot, k, a] of [[1, lh, p.lf, J.leftKnee, J.leftAnkle], [-1, rh, p.rf, J.rightKnee, J.rightAnkle]]) {
    const f = [foot[0] - p.dx, foot[1] - dy];
    const { mid, tip } = ik(h[0], h[1], f[0], f[1], THIGH, SHIN, side);
    set(k, mid, legs); set(a, tip, legs);
  }
  return out;
};

const toImage = (pose, mode, aspect) => {
  const span = mode === 'full' ? 0.215 : 0.29, top = mode === 'full' ? 0.25 : 0.4;
  const out = new Float32Array(pose.length);
  for (let j = 0; j < JOINTS.length; j++) {
    out[j * 3] = (aspect / 2 + pose[j * 3] * span) / aspect;
    out[j * 3 + 1] = top + pose[j * 3 + 1] * span;
    out[j * 3 + 2] = pose[j * 3 + 2];
  }
  return out;
};

const build = ({ id, title, song, mode, moves, start, bars }) => {
  const aspect = 4 / 3, beat = 60 / song.bpm;
  const keys = [];
  let b = 0;
  const plan = [];
  while (plan.length < bars) plan.push(...moves);
  for (const name of plan.slice(0, bars)) {
    const m = MOVES[name], step = m.half ? 0.5 : 1;
    const count = m.half ? 8 : 4;
    for (let i = 0; i < count; i++) keys.push({ at: b + i * step, pose: POSES[m.beats[i % m.beats.length]] });
    b += 4;
  }
  keys.unshift({ at: -1, pose: POSES.down });
  keys.push({ at: b, pose: POSES.down });
  const length = b * beat + 0.5, frames = [];
  for (let i = 0; i < Math.round(length * RATE); i++) {
    const beats = (i / RATE) / beat;
    let k = 0;
    while (k < keys.length - 2 && keys[k + 1].at <= beats) k++;
    const a = keys[k], c = keys[k + 1];
    const t = Math.max(0, Math.min(1, (beats - a.at) / Math.max(0.01, c.at - a.at)));
    const pose = mixPose(a.pose, c.pose, hit(t));
    const groove = 0.05 * Math.abs(Math.sin(Math.PI * beats));
    frames.push(toImage(solve(pose, mode, groove), mode, aspect));
  }
  return serializeDance({ id, title, by: 'Copycat', mode, aspect, start, bpm: song.bpm, song, frames });
};

const DANCES = [
  { id: 'first-steps', title: 'First Steps', song: 'Dance with me', mode: 'upper', bars: 12, moves: ['groove', 'clap', 'groove', 'roof', 'clap', 'wave'] },
  { id: 'funk-party', title: 'Funk Party', song: 'Funk party 1', mode: 'upper', bars: 14, moves: ['clap', 'point', 'roof', 'elbow', 'cross', 'pump'] },
  { id: 'disco-point', title: 'Disco Point', song: 'Disco Theme', mode: 'upper', bars: 14, moves: ['disco', 'disco', 'swim', 'ty', 'clapUp', 'point'] },
  { id: 'robot-rush', title: 'Robot Rush', song: 'Electro funk', mode: 'upper', bars: 16, moves: ['robot', 'robot', 'cross', 'pump', 'ty', 'peek'] },
  { id: 'big-ball-bounce', title: 'Big Ball Bounce', song: 'Big Disco Ball', mode: 'full', bars: 10, moves: ['step', 'clap', 'knee', 'roof', 'squat'] },
  { id: 'jack-attack', title: 'Jack Attack', song: 'Solar Ones (hip hop beat)', mode: 'full', bars: 10, moves: ['jack', 'squat', 'knee', 'step', 'jack'] },
];

mkdirSync(new URL('dances/', ROOT), { recursive: true });
const index = [];
for (const d of DANCES) {
  const song = track(d.song);
  const start = song.segment ? song.segment[0] : (song.firstBeat ?? 0);
  const out = build({ ...d, song, start });
  writeFileSync(new URL(`dances/${d.id}.json`, ROOT), JSON.stringify(out));
  index.push({ id: d.id, title: d.title, mode: d.mode, song: song.title, artist: song.artist, length: Math.round(out.frames.length / RATE) });
  console.log(d.id, out.frames.length / RATE, 's');
}
writeFileSync(new URL('dances/index.json', ROOT), JSON.stringify({ dances: index }, null, 1) + '\n');
