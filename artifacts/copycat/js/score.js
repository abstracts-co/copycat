import { J, sample } from './dance.js';

const TICK = 0.05;
const DELAY = 0.5;
const SHIFTS = [0, -1, 1, -2, 2, -3, 3, -4, 4, -5, 5, -6, 6, -7, 7, -8, 8, -9, 9, -10, 10];
const WEIGHTS = { pose: 0.4, trajectory: 0.25, timing: 0.25, amplitude: 0.1 };
export const BANDS = { perfect: 0.85, great: 0.7, good: 0.5 };
const ARMS = [[J.leftShoulder, J.leftElbow, J.leftWrist], [J.rightShoulder, J.rightElbow, J.rightWrist]];
const LEGS = [[J.leftHip, J.leftKnee, J.leftAnkle], [J.rightHip, J.rightKnee, J.rightAnkle]];
const MIN_VIS = 0.35;

/** A player's poses in dance time, sampled with interpolation across short gaps. */
export class Reel {
  constructor() { this.t = []; this.p = []; }
  push(t, pose) {
    const n = this.t.length;
    if (n && t <= this.t[n - 1]) return;
    this.t.push(t); this.p.push(Float32Array.from(pose));
  }
  at(t, out = new Float32Array(this.p[0]?.length ?? 45)) {
    const ts = this.t;
    if (!ts.length || t < ts[0] - 0.08 || t > ts[ts.length - 1] + 0.08) return null;
    let lo = 0, hi = ts.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (ts[m] <= t) lo = m; else hi = m; }
    if (t <= ts[lo] || lo === hi) { out.set(this.p[lo]); return out; }
    if (ts[hi] - ts[lo] > 0.3) return null;
    const f = (t - ts[lo]) / (ts[hi] - ts[lo]), a = this.p[lo], b = this.p[hi];
    for (let k = 0; k < out.length; k++) out[k] = a[k] + (b[k] - a[k]) * f;
    return out;
  }
}

const frame = (pose, aspect) => {
  if (pose[J.leftShoulder * 3 + 2] < MIN_VIS || pose[J.rightShoulder * 3 + 2] < MIN_VIS) return null;
  const ax = (j) => pose[j * 3] * aspect, ay = (j) => pose[j * 3 + 1];
  const cx = (ax(J.leftShoulder) + ax(J.rightShoulder)) / 2, cy = (ay(J.leftShoulder) + ay(J.rightShoulder)) / 2;
  let span = Math.hypot(ax(J.leftShoulder) - ax(J.rightShoulder), ay(J.leftShoulder) - ay(J.rightShoulder));
  if (pose[J.leftHip * 3 + 2] >= MIN_VIS && pose[J.rightHip * 3 + 2] >= MIN_VIS) {
    const hx = (ax(J.leftHip) + ax(J.rightHip)) / 2, hy = (ay(J.leftHip) + ay(J.rightHip)) / 2;
    span = Math.max(span, Math.hypot(hx - cx, hy - cy) * 0.55);
  }
  if (span < 0.02) return null;
  return { cx, cy, span, aspect };
};
const point = (pose, f, j) => [(pose[j * 3] * f.aspect - f.cx) / f.span, (pose[j * 3 + 1] - f.cy) / f.span];

const limbsFor = (mode) => (mode === 'full' ? [...ARMS, ...LEGS] : ARMS);

const shapeSimilarity = (live, lf, ref, rf, mode) => {
  let sum = 0, weight = 0, minimum = 1;
  for (const [root, mid, tip] of limbsFor(mode)) {
    let ls = 0, lw = 0;
    for (const [a, b, importance] of [[root, tip, 2], [root, mid, 1], [mid, tip, 1]]) {
      if (Math.min(live[a * 3 + 2], live[b * 3 + 2], ref[a * 3 + 2], ref[b * 3 + 2]) < MIN_VIS) continue;
      const la = point(live, lf, a), lb = point(live, lf, b), ra = point(ref, rf, a), rb = point(ref, rf, b);
      const l = [lb[0] - la[0], lb[1] - la[1]], r = [rb[0] - ra[0], rb[1] - ra[1]];
      const ll = Math.hypot(...l), rl = Math.hypot(...r);
      if (ll < 0.04 || rl < 0.04) continue;
      const angle = Math.acos(Math.max(-1, Math.min(1, (l[0] * r[0] + l[1] * r[1]) / (ll * rl))));
      const direction = Math.max(0, 1 - Math.max(0, angle - 0.45) / 1.3);
      const position = Math.max(0, 1 - Math.max(0, Math.hypot(l[0] - r[0], l[1] - r[1]) - 0.35) / 1.4);
      ls += (direction * 0.7 + position * 0.3) * importance; lw += importance;
    }
    if (!lw) continue;
    const s = ls / lw, w = root === J.leftHip || root === J.rightHip ? 0.7 : 1;
    sum += s * w; weight += w; minimum = Math.min(minimum, s);
  }
  return weight ? { mean: sum / weight, minimum } : null;
};

const MOTION = { upper: [J.leftWrist, J.rightWrist, J.leftElbow, J.rightElbow], full: [J.leftWrist, J.rightWrist, J.leftAnkle, J.rightAnkle, J.leftElbow, J.rightElbow] };
const STEP = 0.5, LONG = 1.2;

const motionSimilarity = (l0, l1, r0, r1, aspect, refAspect, mode) => {
  const lf0 = frame(l0, aspect), lf1 = frame(l1, aspect), rf0 = frame(r0, refAspect), rf1 = frame(r1, refAspect);
  if (!lf0 || !lf1 || !rf0 || !rf1) return null;
  let dir = 0, amp = 0, w = 0, hold = true;
  for (const j of MOTION[mode]) {
    if (Math.min(l0[j * 3 + 2], l1[j * 3 + 2], r0[j * 3 + 2], r1[j * 3 + 2]) < MIN_VIS) continue;
    const a0 = point(l0, lf1, j), a1 = point(l1, lf1, j), b0 = point(r0, rf1, j), b1 = point(r1, rf1, j);
    const vl = [a1[0] - a0[0], a1[1] - a0[1]], vr = [b1[0] - b0[0], b1[1] - b0[1]];
    const ml = Math.hypot(...vl), mr = Math.hypot(...vr);
    let d, a;
    if (mr < 0.15) {
      d = ml < 0.3 ? 1 : Math.max(0, 1 - (ml - 0.3) / 0.7); a = 1;
    } else {
      hold = false;
      const cos = ml < 0.05 ? 0 : (vl[0] * vr[0] + vl[1] * vr[1]) / (ml * mr);
      d = Math.max(0, Math.min(1, (cos + 0.2) / 1.2)); a = Math.min(ml, mr) / Math.max(ml, mr);
    }
    const weight = mr + 0.15;
    dir += d * weight; amp += a * weight; w += weight;
  }
  return w ? { direction: dir / w, amplitude: amp / w, hold } : null;
};

export const movementCredit = (q) => { const t = Math.max(0, Math.min(1, (q - 0.12) / (BANDS.perfect - 0.12))); return t * t * (3 - 2 * t); };
export const gradeFor = (q) => (q >= BANDS.perfect ? 'perfect' : q >= BANDS.great ? 'great' : q >= BANDS.good ? 'good' : null);
export const letter = (score) => (score >= 90 ? 'A+' : score >= 80 ? 'A' : score >= 70 ? 'B' : score >= 55 ? 'C' : 'D');

/** Folds a player's reel against a dance at 20 Hz, half a second behind the clock, the way the iPhone game does. */
export class Scorer {
  constructor(dance, aspect, onWindow = () => {}) {
    this.dance = dance; this.aspect = aspect; this.onWindow = onWindow;
    this.live = new Reel();
    this.through = 0; this.sum = 0; this.combo = 0; this.best = 0; this.score = 0;
    this.budget = 0; this.matchedLive = null; this.matchedRef = null;
    this.window = []; this.slots = 0; this.observed = 0;
    this.counts = { perfect: 0, great: 0, good: 0, miss: 0 };
    this.tmp = Array.from({ length: 7 }, () => new Float32Array(45));
    let total = 0;
    for (let t = TICK; t <= dance.length + 1e-6; t += TICK) { const r = this.refAt(t, 0); if (r && frame(r, dance.aspect)) total += 1; }
    this.total = Math.max(1, total);
  }
  refAt(t, k) { return sample(this.dance.frames, t, this.tmp[k]); }
  advance(now, final = false) {
    const end = Math.min(final ? this.dance.length : now - DELAY, this.dance.length);
    while (this.through + TICK <= end + 1e-6) {
      this.through += TICK;
      this.tick(this.through);
      if (Math.round(this.through / TICK) % 10 === 0) this.closeWindow();
    }
    if (final) this.closeWindow();
    return this;
  }
  tick(at) {
    const { mode, aspect: refAspect } = this.dance;
    const ref0 = this.refAt(at, 0);
    if (!ref0 || !frame(ref0, refAspect)) return;
    this.budget += 1; this.slots += 1;
    const live = this.live.at(at, this.tmp[1]), livePrev = this.live.at(at - STEP, this.tmp[2]);
    const liveLong = this.live.at(at - LONG, this.tmp[5]) ?? livePrev;
    const lf = live && frame(live, this.aspect);
    if (!lf || !livePrev) return;
    let best = null;
    for (const step of SHIFTS) {
      const shift = step * TICK, rt = at + shift;
      if (rt < TICK || rt > this.dance.length) continue;
      if (this.matchedRef !== null) {
        const advance = rt - this.matchedRef;
        if (advance < -1e-6 || advance > (at - this.matchedLive) * 3 + 1e-6) continue;
      }
      const ref = this.refAt(rt, 3), refPrev = this.refAt(Math.max(0, rt - STEP), 4);
      const rf = ref && frame(ref, refAspect);
      if (!rf || !refPrev) continue;
      const shape = shapeSimilarity(live, lf, ref, rf, mode);
      let motion = motionSimilarity(livePrev, live, refPrev, ref, this.aspect, refAspect, mode);
      // A pause between hits is not a hold: compare the longer phrase unless the dancer has really been still.
      if (motion?.hold) motion = motionSimilarity(liveLong, live, this.refAt(Math.max(0, rt - LONG), 4), this.refAt(rt, 3), this.aspect, refAspect, mode) ?? motion;
      if (!shape || !motion) continue;
      const agreement = shape.mean * 0.35 + motion.direction * 0.65;
      const candidate = agreement - Math.abs(shift) * 0.15;
      if (!best || candidate > best.candidate) best = { candidate, shift, rt, shape, motion, agreement };
    }
    if (!best) return;
    this.matchedLive = at; this.matchedRef = best.rt;
    const { shape, motion, shift, agreement } = best;
    const timing = agreement * (1 - Math.max(0, Math.abs(shift) - 0.2) / 0.7);
    const poseSupport = Math.min(1, Math.min(shape.mean, shape.minimum) / 0.75);
    const held = motion.hold ? poseSupport * poseSupport : poseSupport;
    const support = Math.min(1, motion.direction / 0.6) * Math.min(1, motion.amplitude / 0.45) * held;
    const weighted = shape.mean * WEIGHTS.pose + motion.direction * WEIGHTS.trajectory + timing * WEIGHTS.timing + motion.amplitude * WEIGHTS.amplitude;
    this.window.push(Math.max(0, Math.min(1, weighted * support)));
    this.observed += 1;
  }
  closeWindow() {
    const values = this.window, slots = this.slots;
    this.window = []; this.slots = 0; this.observed = 0;
    if (!slots) return;
    if (values.length < slots * 0.6) {
      this.sum += values.reduce((a, b) => a + b, 0);
      this.update();
      if (!values.length) this.onWindow({ grade: null, lost: true });
      return;
    }
    const sorted = [...values].sort((a, b) => a - b);
    const lo = Math.floor(sorted.length * 0.2), hi = Math.max(lo + 1, Math.ceil(sorted.length * 0.8));
    const kept = sorted.slice(lo, hi), quality = kept.reduce((a, b) => a + b, 0) / kept.length;
    this.sum += movementCredit(quality) * values.length;
    const grade = values.length >= 6 ? gradeFor(quality) : null;
    if (grade === 'perfect' || grade === 'great') this.combo += 1;
    else if (!grade && values.length >= 6) this.combo = Math.floor(this.combo / 2);
    this.best = Math.max(this.best, this.combo);
    if (values.length >= 6) this.counts[grade ?? 'miss'] += 1;
    this.update();
    this.onWindow({ grade, quality, combo: this.combo });
  }
  update() {
    this.score = Math.round((this.sum / this.total) * 100);
  }
  get final() { return Math.max(0, Math.min(100, this.score)); }
}

