import { J, STAGE, fitSize, drawMirrored, danceCrop } from './pose.js';
import { reduceMotion } from '../lib.js';

const VS = `#version 300 es
in vec2 p; uniform vec3 xf; uniform vec2 k; out vec2 uv;
void main(){ uv = p; vec2 q = vec2((p.x * k.x * xf.x + xf.y) / k.y, p.y * xf.x + xf.z); gl_Position = vec4(q.x * 2.0 - 1.0, 1.0 - q.y * 2.0, 0.0, 1.0); }`;
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
    this.u = { xf: gl.getUniformLocation(prog, 'xf'), k: gl.getUniformLocation(prog, 'k'), opacity: gl.getUniformLocation(prog, 'opacity') };
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  }
  draw(source, transform, opacity, viewAspect) {
    const gl = this.gl; if (!gl) return;
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    if (!source || (source.readyState !== undefined && source.readyState < 2)) return;
    gl.useProgram(this.prog);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    try { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source); } catch { return; }
    gl.uniform3f(this.u.xf, transform[0], transform[1], transform[2]);
    gl.uniform2f(this.u.k, STAGE.aspect, viewAspect);
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
 * The camera stage: the whole camera picture (or the privacy silhouette or background swap) at the camera's own aspect,
 * fitted inside the view and never cropped or stretched, over a blurred copy that fills the rest. The creator's 9:16
 * ghost is placed over the picture, and an effects layer for trails and progress covers the whole view.
 */
export class Stage {
  constructor(host) {
    this.host = host;
    const canvas = (className) => Object.assign(document.createElement('canvas'), { width: 960, height: 540, className });
    this.backdrop = canvas('blurfill'); this.picture = canvas('placed'); this.ghostCanvas = canvas('placed');
    this.fx = document.createElement('canvas');
    host.append(this.backdrop, this.picture, this.ghostCanvas, this.fx);
    this.ctx = this.picture.getContext('2d');
    this.backdropCtx = this.backdrop.getContext('2d');
    this.ghost = new GhostLayer(this.ghostCanvas);
    this.fxCtx = this.fx.getContext('2d');
    this.person = canvas('');
    this.personCtx = this.person.getContext('2d');
    this.live = new Trails(LIVE_TINT); this.reference = new Trails(REFERENCE_TINT);
    this.aspect = 16 / 9;
  }
  fit(video) {
    const aspect = video.videoWidth / video.videoHeight;
    if (!aspect || (this.sized && Math.abs(aspect - this.aspect) < 0.01)) return;
    const size = (c, long) => { const f = fitSize(aspect, long); c.width = f.w; c.height = f.h; };
    const long = Math.min(1280, Math.max(video.videoWidth, video.videoHeight));
    size(this.picture, long); size(this.person, long); size(this.ghostCanvas, 960); size(this.backdrop, 48);
    this.aspect = aspect; this.sized = true; this.placedAt = null;
  }
  resize() {
    const r = this.host.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
    const w = Math.round(r.width * dpr), h = Math.round(r.height * dpr), pw = this.picture.width, ph = this.picture.height;
    if (this.fx.width !== w || this.fx.height !== h) { this.fx.width = w; this.fx.height = h; }
    const s = Math.min(w / pw, h / ph);
    this.view = { s, ox: (w - pw * s) / 2, oy: (h - ph * s) / 2, w, h, dpr };
    const key = `${w}x${h}:${pw}x${ph}`;
    if (this.placedAt !== key) {
      this.placedAt = key;
      const css = { left: `${this.view.ox / dpr}px`, top: `${this.view.oy / dpr}px`, width: `${(pw * s) / dpr}px`, height: `${(ph * s) / dpr}px` };
      for (const c of [this.picture, this.ghostCanvas]) Object.assign(c.style, css);
    }
    return this.view;
  }
  map = (x, y) => [this.view.ox + x * this.picture.width * this.view.s, this.view.oy + y * this.picture.height * this.view.s];
  drawPicture(video, tracker, { privacy = false, background = null } = {}) {
    this.fit(video);
    const ctx = this.ctx, W = this.picture.width, H = this.picture.height;
    if (!privacy && !background) { drawMirrored(ctx, video, W, H); this.drawBackdrop(); return; }
    const pc = this.personCtx;
    pc.globalCompositeOperation = 'source-over'; pc.clearRect(0, 0, W, H);
    if (privacy) { pc.fillStyle = '#262626'; pc.fillRect(0, 0, W, H); } else drawMirrored(pc, video, W, H);
    if (tracker?.hasMask) { pc.globalCompositeOperation = 'destination-in'; pc.drawImage(tracker.mask, 0, 0, W, H); }
    else if (privacy) pc.clearRect(0, 0, W, H);
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    if (background && !privacy) drawBackground(ctx, background.image, background.placement, W, H);
    ctx.drawImage(this.person, 0, 0);
    this.drawBackdrop();
  }
  drawBackdrop() { this.backdropCtx.drawImage(this.picture, 0, 0, this.backdrop.width, this.backdrop.height); }
  drawGhost(source, transform, opacity) { this.ghost.draw(source, transform, opacity, this.aspect); }
  clearGhost() { this.ghost.clear(); }
  beginFx() { const c = this.resize(); this.fxCtx.clearRect(0, 0, c.w, c.h); return c; }
  /** Dims what a recording leaves out, so the dancer sees the 9:16 frame that will be kept. */
  drawCropGuide() {
    const crop = danceCrop(this.aspect);
    if (crop.w > 0.98 && crop.h > 0.98) return;
    const ctx = this.fxCtx, c = this.view, [x0, y0] = this.map(crop.x, crop.y), [x1, y1] = this.map(crop.x + crop.w, crop.y + crop.h);
    ctx.save(); ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, x0, c.h); ctx.fillRect(x1, 0, c.w - x1, c.h); ctx.fillRect(x0, 0, x1 - x0, y0); ctx.fillRect(x0, y1, x1 - x0, c.h - y1);
    ctx.restore();
  }
  dispose() { for (const c of [this.backdrop, this.picture, this.ghostCanvas, this.fx]) c.remove(); }
}

export const drawBackground = (ctx, image, placement = { scale: 1, x: 0, y: 0 }, W, H) => {
  const s = Math.max(W / image.width, H / image.height) * placement.scale;
  const w = image.width * s, h = image.height * s;
  ctx.drawImage(image, (W - w) / 2 + placement.x * W, (H - h) / 2 + placement.y * H, w, h);
};

/**
 * Lines the creator's 9:16 ghost up with the player in a view of another aspect: one uniform scale and offset, in units of
 * view height, from shoulder centre and width, smoothed. Without the player in view the ghost stands centred, full height.
 */
export class GhostAlign {
  constructor() { this.cur = null; }
  update(reference, live, viewAspect) {
    const r = torso(reference, STAGE.aspect), l = torso(live, viewAspect);
    if (!r || !l) return this.cur ?? [1, (viewAspect - STAGE.aspect) / 2, 0];
    const s = Math.min(2.2, Math.max(0.45, l.span / r.span));
    const target = [s, l.cx - r.cx * s, l.cy - r.cy * s];
    if (!this.cur) this.cur = target; else this.cur = this.cur.map((v, i) => v + (target[i] - v) * 0.12);
    return this.cur;
  }
  reset() { this.cur = null; }
}
const torso = (p, aspect) => {
  if (!p || p[J.leftShoulder * 3 + 2] < 0.35 || p[J.rightShoulder * 3 + 2] < 0.35) return null;
  const lx = p[J.leftShoulder * 3] * aspect, ly = p[J.leftShoulder * 3 + 1], rx = p[J.rightShoulder * 3] * aspect, ry = p[J.rightShoulder * 3 + 1];
  const span = Math.hypot(lx - rx, ly - ry);
  return span > 0.02 ? { cx: (lx + rx) / 2, cy: (ly + ry) / 2, span } : null;
};
/** A dance-space pose moved into the view by a GhostAlign transform. */
export const applyTransform = (pose, [s, tx, ty], viewAspect) => {
  if (!pose) return null;
  const out = new Float32Array(pose.length);
  for (let i = 0; i < pose.length; i += 3) { out[i] = (pose[i] * STAGE.aspect * s + tx) / viewAspect; out[i + 1] = pose[i + 1] * s + ty; out[i + 2] = pose[i + 2]; }
  return out;
};
