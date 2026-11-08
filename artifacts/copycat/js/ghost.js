import { BONES, J, JOINTS } from './dance.js';

export const GHOSTS = {
  cat: { name: 'Copycat', color: '#ffd60a', glow: 18, width: 0.34, alpha: 0.55, trail: '#ffd60a', head: 'cat' },
  neon: { name: 'Neon', color: '#7df9ff', glow: 18, width: 0.34, alpha: 0.55, trail: '#7df9ff', head: 'cat' },
  candy: { name: 'Candy', color: '#ff5fd2', glow: 22, width: 0.36, alpha: 0.5, trail: '#ffd25f', head: 'cat' },
  cream: { name: 'Cream', color: '#f3eee3', glow: 12, width: 0.3, alpha: 0.5, trail: '#ffd60a', head: 'round' },
  shadow: { name: 'Shadow', color: '#ffffff', glow: 0, width: 0.4, alpha: 0.32, trail: '#ffffff', head: 'round' },
};
export const PLAYER = { color: '#ffffff', glow: 0, width: 0.07, alpha: 0.9, trail: '#ffffff', head: 'none' };

const hex = /^#[0-9a-f]{6}$/i;
export const cleanGhost = (g) => {
  if (!g || g.format !== 'copycat/ghost@1') return null;
  const n = (v, lo, hi, d) => (typeof v === 'number' && v >= lo && v <= hi ? v : d);
  return {
    name: String(g.name ?? 'Ghost').slice(0, 30), color: hex.test(g.color) ? g.color : '#ffd60a', glow: n(g.glow, 0, 40, 16), width: n(g.width, 0.05, 0.6, 0.34),
    alpha: n(g.alpha, 0.1, 0.9, 0.55), trail: hex.test(g.trail) ? g.trail : hex.test(g.color) ? g.color : '#ffd60a', head: ['cat', 'round', 'none'].includes(g.head) ? g.head : 'round',
  };
};

/** Maps normalized camera coordinates to canvas pixels for a cover-fit, optionally mirrored, video. */
export const viewport = (cw, ch, aspect, mirror = true) => {
  const vw = cw / ch > aspect ? cw : ch * aspect, vh = vw / aspect;
  const ox = (cw - vw) / 2, oy = (ch - vh) / 2;
  return { vw, vh, ox, oy, mirror, x: (x) => ox + (mirror ? 1 - x : x) * vw, y: (y) => oy + y * vh };
};

const torso = (pose, aspect) => {
  if (pose[J.leftShoulder * 3 + 2] < 0.35 || pose[J.rightShoulder * 3 + 2] < 0.35) return null;
  const lx = pose[J.leftShoulder * 3] * aspect, ly = pose[J.leftShoulder * 3 + 1], rx = pose[J.rightShoulder * 3] * aspect, ry = pose[J.rightShoulder * 3 + 1];
  return { cx: (lx + rx) / 2, cy: (ly + ry) / 2, span: Math.hypot(lx - rx, ly - ry) };
};

/** Keeps the ghost standing where the player stands, at the player's size, smoothed so it doesn't shake. */
export class Anchor {
  constructor() { this.cur = null; }
  update(player, aspect) {
    const t = player && torso(player, aspect);
    if (!t || t.span < 0.03) return this.cur;
    const target = { cx: t.cx / aspect, cy: t.cy, span: t.span / aspect };
    if (!this.cur) this.cur = target;
    else for (const k of ['cx', 'cy', 'span']) this.cur[k] += (target[k] - this.cur[k]) * 0.12;
    return this.cur;
  }
}

/** Moves a reference pose (in the dance's own frame) onto the anchor, in the player's normalized camera coordinates. */
export const place = (ref, refAspect, anchor, camAspect, out = new Float32Array(ref.length)) => {
  const t = torso(ref, refAspect);
  for (let j = 0; j < JOINTS.length; j++) {
    let x = ref[j * 3] * refAspect, y = ref[j * 3 + 1];
    if (t && anchor) {
      const k = (anchor.span * camAspect) / t.span;
      x = anchor.cx * camAspect + (x - t.cx) * k; y = anchor.cy + (y - t.cy) * k;
    } else x += (camAspect - refAspect) / 2;
    out[j * 3] = x / camAspect; out[j * 3 + 1] = y; out[j * 3 + 2] = ref[j * 3 + 2];
  }
  return out;
};

const pt = (pose, j, v) => [v.x(pose[j * 3]), v.y(pose[j * 3 + 1])];
const ok = (pose, j) => pose[j * 3 + 2] >= 0.35;

export const drawPose = (ctx, pose, v, style, scale = 1) => {
  if (!ok(pose, J.leftShoulder) || !ok(pose, J.rightShoulder)) return;
  const [lx, ly] = pt(pose, J.leftShoulder, v), [rx, ry] = pt(pose, J.rightShoulder, v);
  const span = Math.max(8, Math.hypot(lx - rx, ly - ry)) * scale;
  const w = Math.max(3, span * style.width);
  ctx.save();
  ctx.globalAlpha = style.alpha;
  ctx.strokeStyle = style.color; ctx.fillStyle = style.color;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (style.glow) { ctx.shadowColor = style.color; ctx.shadowBlur = style.glow; }
  const hips = ok(pose, J.leftHip) && ok(pose, J.rightHip);
  if (style.head !== 'none') {
    ctx.beginPath();
    const [hlx, hly] = hips ? pt(pose, J.leftHip, v) : [lx, ly + span * 1.2], [hrx, hry] = hips ? pt(pose, J.rightHip, v) : [rx, ry + span * 1.2];
    ctx.moveTo(lx, ly); ctx.lineTo(rx, ry); ctx.lineTo(hrx, hry); ctx.lineTo(hlx, hly); ctx.closePath();
    ctx.lineWidth = w; ctx.stroke(); ctx.fill();
  }
  ctx.lineWidth = w;
  ctx.beginPath();
  for (const [a, b] of BONES) {
    if (!ok(pose, a) || !ok(pose, b)) continue;
    if (style.head === 'none' || ![J.leftShoulder, J.rightShoulder, J.leftHip, J.rightHip].includes(a) || ![J.leftShoulder, J.rightShoulder, J.leftHip, J.rightHip].includes(b)) {
      const [ax, ay] = pt(pose, a, v), [bx, by] = pt(pose, b, v);
      ctx.moveTo(ax, ay); ctx.lineTo(bx, by);
    }
  }
  ctx.stroke();
  for (const [wj, ij] of [[J.leftWrist, J.leftIndex], [J.rightWrist, J.rightIndex]]) {
    if (!ok(pose, wj)) continue;
    const [x, y] = pt(pose, wj, v);
    ctx.beginPath(); ctx.arc(x, y, w * 0.75, 0, Math.PI * 2); ctx.fill();
  }
  if (style.head !== 'none') {
    const nx = (lx + rx) / 2, ny = (ly + ry) / 2 - span * 0.62;
    const [hx, hy] = ok(pose, J.nose) ? pt(pose, J.nose, v) : [nx, ny];
    const r = span * 0.34;
    ctx.beginPath(); ctx.arc(hx, hy, r, 0, Math.PI * 2); ctx.fill();
    if (style.head === 'cat') {
      const tilt = Math.atan2(ry - ly, rx - lx) + (v.mirror ? 0 : Math.PI);
      for (const s of [-1, 1]) {
        ctx.save(); ctx.translate(hx, hy); ctx.rotate(tilt);
        ctx.beginPath(); ctx.moveTo(s * r * 0.95, -r * 0.35); ctx.lineTo(s * r * 0.75, -r * 1.45); ctx.lineTo(s * r * 0.12, -r * 0.88); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
    }
  }
  ctx.restore();
};

/** Short hand trails, about a foot of recent movement. */
export class Trails {
  constructor(length = 0.32) { this.length = length; this.points = [[], []]; }
  push(t, pose, v) {
    [J.leftWrist, J.rightWrist].forEach((j, i) => {
      const list = this.points[i];
      if (ok(pose, j)) list.push([t, ...pt(pose, j, v)]);
      while (list.length && list[0][0] < t - this.length) list.shift();
    });
  }
  clear() { this.points = [[], []]; }
  draw(ctx, color, width) {
    ctx.save(); ctx.strokeStyle = color; ctx.lineCap = 'round';
    for (const list of this.points) {
      for (let i = 1; i < list.length; i++) {
        const f = i / list.length;
        ctx.globalAlpha = f * 0.8; ctx.lineWidth = width * (0.3 + f * 0.7);
        ctx.beginPath(); ctx.moveTo(list[i - 1][1], list[i - 1][2]); ctx.lineTo(list[i][1], list[i][2]); ctx.stroke();
      }
    }
    ctx.restore();
  }
}

/** Progress around the screen edge: starts top centre and runs clockwise, showing only what's done. */
export const drawProgress = (ctx, w, h, p, color = '#ffffff') => {
  if (p <= 0) return;
  const inset = 4, r = Math.min(28, w / 10), x0 = inset, y0 = inset, x1 = w - inset, y1 = h - inset;
  const path = new Path2D();
  path.moveTo(w / 2, y0); path.lineTo(x1 - r, y0); path.arcTo(x1, y0, x1, y0 + r, r); path.lineTo(x1, y1 - r); path.arcTo(x1, y1, x1 - r, y1, r);
  path.lineTo(x0 + r, y1); path.arcTo(x0, y1, x0, y1 - r, r); path.lineTo(x0, y0 + r); path.arcTo(x0, y0, x0 + r, y0, r); path.lineTo(w / 2, y0);
  const total = 2 * (x1 - x0 + y1 - y0) - r * (8 - 2 * Math.PI);
  ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = 5; ctx.lineCap = 'round';
  ctx.setLineDash([total * Math.min(1, p), total]); ctx.stroke(path); ctx.restore();
};

const LEGS = new Set([J.leftKnee, J.rightKnee, J.leftAnkle, J.rightAnkle]);
/** One fixed scale and offset that keeps the whole dance inside a stage, so a dancer filmed from far away still fills it. */
export const fitDance = (dance, stageAspect, fill = 0.84) => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < dance.frames.length; i += 3) {
    const f = dance.frames[i];
    for (let j = 0; j < JOINTS.length; j++) {
      if (f[j * 3 + 2] < 0.35 || (dance.mode !== 'full' && LEGS.has(j))) continue;
      const x = f[j * 3] * dance.aspect, y = f[j * 3 + 1];
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
  }
  if (!Number.isFinite(x0)) return { k: 1, dx: (stageAspect - dance.aspect) / 2, dy: 0 };
  y0 -= (y1 - y0) * 0.1;
  const k = Math.min((stageAspect * fill) / Math.max(0.05, x1 - x0), fill / Math.max(0.05, y1 - y0));
  return { k, dx: stageAspect / 2 - ((x0 + x1) / 2) * k, dy: 0.5 - ((y0 + y1) / 2) * k };
};
export const placeFit = (ref, refAspect, fit, stageAspect, out = new Float32Array(ref.length)) => {
  for (let j = 0; j < JOINTS.length; j++) {
    out[j * 3] = (ref[j * 3] * refAspect * fit.k + fit.dx) / stageAspect; out[j * 3 + 1] = ref[j * 3 + 1] * fit.k + fit.dy; out[j * 3 + 2] = ref[j * 3 + 2];
  }
  return out;
};
