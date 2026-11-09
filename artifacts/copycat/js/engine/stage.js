import { J, STAGE, WORK, drawCrop } from './pose.js';
import { reduceMotion } from '../lib.js';

const VS = `#version 300 es
in vec2 p; uniform vec3 xf; out vec2 uv;
void main(){ uv = p; vec2 q = p * xf.x + xf.yz; gl_Position = vec4(q.x * 2.0 - 1.0, 1.0 - q.y * 2.0, 0.0, 1.0); }`;
// The iPhone app's ghost_fragment: the creator's masked silhouette, tinted purple by brightness, at the chosen opacity.
const FS = `#version 300 es
precision mediump float; in vec2 uv; uniform sampler2D video; uniform float opacity; out vec4 o;
void main(){
  float alpha = smoothstep(0.15, 0.85, texture(video, vec2(0.5 + uv.x * 0.5, uv.y)).r);
  float luminance = dot(texture(video, vec2(uv.x * 0.5, uv.y)).rgb, vec3(0.2126, 0.7152, 0.0722));
  vec3 purple = vec3(0.74, 0.42, 1.0) * (0.25 + 0.75 * luminance);
  o = vec4(purple * alpha * opacity, alpha * opacity);
}`;

export const LIVE_TINT = [26, 199, 255];
export const REFERENCE_TINT = [158, 61, 255];

class GhostLayer {
  constructor(canvas) {
    const gl = canvas.getContext('webgl2', { premultipliedAlpha: true, alpha: true, preserveDrawingBuffer: true });
    this.gl = gl;
    if (!gl) return;
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
    const prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(prog);
    this.prog = prog;
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 0, 1, 1, 0, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    this.tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, this.tex);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
    this.u = { xf: gl.getUniformLocation(prog, 'xf'), opacity: gl.getUniformLocation(prog, 'opacity') };
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  }
  draw(source, transform, opacity) {
    const gl = this.gl; if (!gl) return;
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    if (!source || (source.readyState !== undefined && source.readyState < 2)) return;
    gl.useProgram(this.prog);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    try { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source); } catch { return; }
    gl.uniform3f(this.u.xf, transform[0], transform[1], transform[2]);
    gl.uniform1f(this.u.opacity, opacity);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }
  clear() { const gl = this.gl; if (gl) { gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); } }
}

/** Hand trails: short glowing ribbons of recent wrist travel, with sparks thrown off fast moves. */
export class Trails {
  constructor(tint) { this.tint = tint; this.hands = [[], []]; this.sparks = []; }
  push(t, pose) {
    [J.leftWrist, J.rightWrist].forEach((j, i) => {
      const list = this.hands[i];
      if (pose && pose[j * 3 + 2] >= 0.35) {
        const p = { t, x: pose[j * 3], y: pose[j * 3 + 1] }, last = list[list.length - 1];
        if (last && t - last.t < 0.2 && !reduceMotion()) {
          const speed = Math.hypot(p.x - last.x, p.y - last.y) / Math.max(0.001, t - last.t);
          if (speed > 0.9 && Math.random() < 0.7) for (let k = 0; k < 2; k++) this.sparks.push({ t, x: p.x, y: p.y, vx: (p.x - last.x) * 0.3 + (Math.random() - 0.5) * 0.08, vy: (p.y - last.y) * 0.3 + (Math.random() - 0.5) * 0.08, life: 0.28 + Math.random() * 0.26, r: 1.4 + Math.random() * 1.6 });
        }
        list.push(p);
      }
      while (list.length && t - list[0].t > 0.45) list.shift();
    });
    this.sparks = this.sparks.filter((s) => t - s.t < s.life);
    this.now = t;
  }
  clear() { this.hands = [[], []]; this.sparks = []; }
  draw(ctx, map, scale) {
    const [r, g, b] = this.tint, now = this.now ?? 0;
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const list of this.hands) {
      for (let pass = 0; pass < 2; pass++) {
        for (let i = 1; i < list.length; i++) {
          const a = list[i - 1], c = list[i], age = now - c.t, f = Math.max(0, 1 - age / 0.45);
          const [ax, ay] = map(a.x, a.y), [cx, cy] = map(c.x, c.y);
          if (Math.hypot(cx - ax, cy - ay) > 260 * scale) continue;
          ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(cx, cy);
          if (pass === 0) { ctx.strokeStyle = `rgba(${r},${g},${b},${0.32 * f})`; ctx.lineWidth = (10 + 14 * f) * scale; ctx.shadowColor = `rgb(${r},${g},${b})`; ctx.shadowBlur = 18 * scale; }
          else { ctx.strokeStyle = `rgba(${(r + 255 * 4) / 5},${(g + 255 * 4) / 5},${(b + 255 * 4) / 5},${0.85 * f})`; ctx.lineWidth = (2 + 3 * f) * scale; ctx.shadowBlur = 0; }
          ctx.stroke();
        }
      }
      const tip = list[list.length - 1];
      if (tip && now - tip.t < 0.16) {
        const [x, y] = map(tip.x, tip.y), grad = ctx.createRadialGradient(x, y, 0, x, y, 14 * scale);
        grad.addColorStop(0, `rgba(255,255,255,0.55)`); grad.addColorStop(0.4, `rgba(${r},${g},${b},0.35)`); grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(x, y, 14 * scale, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.shadowBlur = 0;
    for (const s of this.sparks) {
      const age = now - s.t, life = age / s.life, [x, y] = map(s.x + s.vx * age * 3, s.y + s.vy * age * 3 + 0.02 * age * age);
      ctx.fillStyle = `rgba(${(r + 255) / 2},${(g + 255) / 2},${(b + 255) / 2},${0.56 * (1 - life) ** 2})`;
      ctx.beginPath(); ctx.arc(x, y, s.r * scale * 2 * (1 - life * 0.65), 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
}

const RAINBOW = ['#00ffff', '#0a84ff', '#bf5af2', '#ff375f', '#ff9f0a', '#ffd60a', '#ff375f', '#bf5af2', '#00ffff'];
/** CopycatCameraProgress: completed progress around the display edge, from top centre clockwise, in a turning rainbow. */
export const drawPerimeter = (ctx, w, h, progress, time, scale) => {
  if (!(progress > 0)) return;
  const inset = 5 * scale, x0 = inset, y0 = inset, x1 = w - inset, y1 = h - inset, r = Math.min(48 * scale, (x1 - x0) / 2, (y1 - y0) / 2);
  const p = new Path2D();
  p.moveTo(w / 2, y0); p.lineTo(x1 - r, y0); p.arcTo(x1, y0, x1, y0 + r, r); p.lineTo(x1, y1 - r); p.arcTo(x1, y1, x1 - r, y1, r);
  p.lineTo(x0 + r, y1); p.arcTo(x0, y1, x0, y1 - r, r); p.lineTo(x0, y0 + r); p.arcTo(x0, y0, x0 + r, y0, r); p.lineTo(w / 2, y0);
  const total = 2 * (x1 - x0 + y1 - y0) - r * (8 - 2 * Math.PI);
  const rotation = reduceMotion() ? 0 : ((time % 6) / 6) * Math.PI * 2;
  const g = ctx.createConicGradient(rotation - Math.PI / 2, w / 2, h / 2);
  RAINBOW.forEach((c, i) => g.addColorStop(i / (RAINBOW.length - 1), c));
  ctx.save(); ctx.strokeStyle = g; ctx.lineCap = 'round'; ctx.setLineDash([total * Math.min(1, progress), total * 2]);
  ctx.globalAlpha = 0.65; ctx.lineWidth = 11 * scale; ctx.filter = `blur(${7 * scale}px)`; ctx.stroke(p);
  ctx.globalAlpha = 1; ctx.filter = 'none'; ctx.lineWidth = 4 * scale; ctx.stroke(p);
  ctx.restore();
};

/**
 * The camera stage: a 9:16 picture (camera, privacy silhouette or background swap), the creator's ghost over it,
 * and an effects layer for trails and progress. The picture and ghost are 540×960 canvases shown with
 * object-fit: cover; the effects layer is drawn at screen resolution through the same cover mapping.
 */
export class Stage {
  constructor(host) {
    this.host = host;
    this.picture = Object.assign(document.createElement('canvas'), { width: STAGE.w, height: STAGE.h, className: 'cover' });
    this.ghostCanvas = Object.assign(document.createElement('canvas'), { width: STAGE.w, height: STAGE.h, className: 'cover' });
    this.fx = document.createElement('canvas');
    host.append(this.picture, this.ghostCanvas, this.fx);
    this.ctx = this.picture.getContext('2d');
    this.ghost = new GhostLayer(this.ghostCanvas);
    this.fxCtx = this.fx.getContext('2d');
    this.person = Object.assign(document.createElement('canvas'), { width: STAGE.w, height: STAGE.h });
    this.personCtx = this.person.getContext('2d');
    this.live = new Trails(LIVE_TINT); this.reference = new Trails(REFERENCE_TINT);
  }
  resize() {
    const r = this.host.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
    const w = Math.round(r.width * dpr), h = Math.round(r.height * dpr);
    if (this.fx.width !== w || this.fx.height !== h) { this.fx.width = w; this.fx.height = h; }
    const s = Math.max(w / STAGE.w, h / STAGE.h);
    this.cover = { s, ox: (w - STAGE.w * s) / 2, oy: (h - STAGE.h * s) / 2, w, h, dpr };
    return this.cover;
  }
  map = (x, y) => [this.cover.ox + x * STAGE.w * this.cover.s, this.cover.oy + y * STAGE.h * this.cover.s];
  drawPicture(video, tracker, { privacy = false, background = null } = {}) {
    const ctx = this.ctx;
    if (!privacy && !background) { drawCrop(ctx, video, STAGE.w, STAGE.h, true); return; }
    const pc = this.personCtx;
    pc.globalCompositeOperation = 'source-over'; pc.clearRect(0, 0, STAGE.w, STAGE.h);
    if (privacy) { pc.fillStyle = '#262626'; pc.fillRect(0, 0, STAGE.w, STAGE.h); } else drawCrop(pc, video, STAGE.w, STAGE.h, true);
    if (tracker?.hasMask) { pc.globalCompositeOperation = 'destination-in'; pc.drawImage(tracker.mask, 0, 0, WORK.w, WORK.h, 0, 0, STAGE.w, STAGE.h); }
    else if (privacy) pc.clearRect(0, 0, STAGE.w, STAGE.h);
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, STAGE.w, STAGE.h);
    if (background && !privacy) drawBackground(ctx, background.image, background.placement);
    ctx.drawImage(this.person, 0, 0);
  }
  drawGhost(source, transform, opacity) { this.ghost.draw(source, transform, opacity); }
  clearGhost() { this.ghost.clear(); }
  beginFx() { const c = this.resize(); this.fxCtx.clearRect(0, 0, c.w, c.h); return c; }
  dispose() { this.picture.remove(); this.ghostCanvas.remove(); this.fx.remove(); }
}

export const drawBackground = (ctx, image, placement = { scale: 1, x: 0, y: 0 }) => {
  const s = Math.max(STAGE.w / image.width, STAGE.h / image.height) * placement.scale;
  const w = image.width * s, h = image.height * s;
  ctx.drawImage(image, (STAGE.w - w) / 2 + placement.x * STAGE.w, (STAGE.h - h) / 2 + placement.y * STAGE.h, w, h);
};

/** Lines the creator's ghost up with the player: one uniform scale and offset from shoulder centre and width, smoothed. */
export class GhostAlign {
  constructor() { this.cur = null; }
  update(reference, live) {
    const r = torso(reference), l = torso(live);
    if (!r || !l) return this.cur ?? [1, 0, 0];
    const s = Math.min(2.2, Math.max(0.45, l.span / r.span));
    const target = [s, l.cx - r.cx * s, l.cy - r.cy * s];
    if (!this.cur) this.cur = target; else this.cur = this.cur.map((v, i) => v + (target[i] - v) * 0.12);
    return this.cur;
  }
  reset() { this.cur = null; }
}
const torso = (p) => {
  if (!p || p[J.leftShoulder * 3 + 2] < 0.35 || p[J.rightShoulder * 3 + 2] < 0.35) return null;
  const a = STAGE.aspect, lx = p[J.leftShoulder * 3], ly = p[J.leftShoulder * 3 + 1], rx = p[J.rightShoulder * 3], ry = p[J.rightShoulder * 3 + 1];
  const span = Math.hypot((lx - rx) * a, ly - ry);
  return span > 0.03 ? { cx: (lx + rx) / 2, cy: (ly + ry) / 2, span } : null;
};
export const applyTransform = (pose, [s, tx, ty]) => {
  if (!pose) return null;
  const out = new Float32Array(pose.length);
  for (let i = 0; i < pose.length; i += 3) { out[i] = pose[i] * s + tx; out[i + 1] = pose[i + 1] * s + ty; out[i + 2] = pose[i + 2]; }
  return out;
};
