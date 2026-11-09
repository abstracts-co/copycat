import { JOINTS, STAGE, danceCrop, toDance } from './pose.js';
import { RATE } from '../data/format.js';

const pick = (types) => types.find((t) => window.MediaRecorder?.isTypeSupported?.(t)) ?? '';
export const VIDEO_TYPE = () => pick(['video/mp4;codecs=avc1.42E01E', 'video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']);
export const extension = (type) => (type.startsWith('video/mp4') ? 'mp4' : 'webm');
const GHOST = { w: 180, h: 320 };
const LIMIT = 4.4 * 1024 * 1024;

/**
 * Records a new dance from the centre 9:16 of the stage: the picture as the dance video, the ghost track (brightness |
 * mask) and the pose reel, all in dance coordinates.
 */
export class DanceRecorder {
  constructor(stage, tracker, { privacy }) {
    this.stage = stage; this.tracker = tracker; this.privacy = privacy;
    this.crop = danceCrop(stage.aspect);
    this.canvas = Object.assign(document.createElement('canvas'), { width: STAGE.w, height: STAGE.h });
    this.c = this.canvas.getContext('2d');
    this.ghost = Object.assign(document.createElement('canvas'), { width: GHOST.w * 2, height: GHOST.h });
    this.g = this.ghost.getContext('2d');
    this.samples = [];
    this.coverAt = null;
  }
  start(length) {
    const type = VIDEO_TYPE();
    if (!type) throw new Error('This browser can’t record video.');
    this.type = type;
    const bits = Math.min(1_600_000, Math.floor((LIMIT * 8) / Math.max(5, length + 1)));
    const make = (canvas, bitrate, chunks) => {
      const r = new MediaRecorder(canvas.captureStream(30), { mimeType: type, videoBitsPerSecond: bitrate });
      r.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      return r;
    };
    this.videoChunks = []; this.ghostChunks = [];
    this.drawVideo();
    this.video = make(this.canvas, bits, this.videoChunks);
    this.ghostRec = make(this.ghost, 280_000, this.ghostChunks);
    this.video.start(250); this.ghostRec.start(250);
    this.t0 = performance.now();
    this.length = length;
  }
  get elapsed() { return this.t0 ? (performance.now() - this.t0) / 1000 : 0; }
  part(canvas) { const k = this.crop; return [k.x * canvas.width, k.y * canvas.height, k.w * canvas.width, k.h * canvas.height]; }
  drawVideo() { this.c.drawImage(this.stage.picture, ...this.part(this.stage.picture), 0, 0, STAGE.w, STAGE.h); }
  frame(pose, capturedAt) {
    const t = this.elapsed, g = this.g, at = capturedAt ? (capturedAt - this.t0) / 1000 : t, tr = this.tracker;
    this.drawVideo();
    g.fillStyle = '#000'; g.fillRect(0, 0, GHOST.w * 2, GHOST.h);
    if (this.privacy) { g.fillStyle = '#5a5a5a'; g.fillRect(0, 0, GHOST.w, GHOST.h); }
    else if (tr.frameAt) { g.filter = 'grayscale(1)'; g.drawImage(tr.frameAt, ...this.part(tr.frameAt), 0, 0, GHOST.w, GHOST.h); g.filter = 'none'; }
    if (tr.hasMask) g.drawImage(tr.mask, ...this.part(tr.mask), GHOST.w, 0, GHOST.w, GHOST.h);
    if (pose && at >= 0) this.samples.push([at, toDance(pose, this.crop)]);
    if (this.coverAt === null && t > Math.min(2, this.length / 3) && pose) this.coverAt = t;
    if (this.coverAt !== null && !this.cover) this.cover = snapshot(this.canvas);
  }
  async stop() {
    const done = (r) => new Promise((res) => { r.onstop = res; r.stop(); });
    await Promise.all([done(this.video), done(this.ghostRec)]);
    const duration = Math.min(this.elapsed, this.length);
    return {
      video: new Blob(this.videoChunks, { type: this.type }), ghost: new Blob(this.ghostChunks, { type: this.type }), type: this.type,
      frames: resample(this.samples, duration), duration, cover: await (this.cover ?? snapshot(this.canvas)),
    };
  }
  cancel() { for (const r of [this.video, this.ghostRec]) if (r && r.state !== 'inactive') r.stop(); }
}

const snapshot = (canvas) => new Promise((resolve) => {
  const c = Object.assign(document.createElement('canvas'), { width: STAGE.w, height: STAGE.h });
  c.getContext('2d').drawImage(canvas, 0, 0);
  c.toBlob((b) => (b ? resolve(b) : c.toBlob(resolve, 'image/jpeg', 0.86)), 'image/webp', 0.86);
});

export const resample = (samples, duration) => {
  const out = [], n = Math.max(1, Math.round(duration * RATE));
  let k = 0;
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    while (k < samples.length - 2 && samples[k + 1][0] <= t) k++;
    const a = samples[k], b = samples[k + 1];
    const f = new Float32Array(JOINTS.length * 3);
    if (a && b && b[0] > a[0] && t >= a[0] - 0.1 && t <= b[0] + 0.1 && b[0] - a[0] < 0.4) {
      const w = Math.min(1, Math.max(0, (t - a[0]) / (b[0] - a[0])));
      for (let j = 0; j < f.length; j++) f[j] = a[1][j] + (b[1][j] - a[1][j]) * w;
    } else if (a && Math.abs(a[0] - t) < 0.15) f.set(a[1]);
    out.push(f);
  }
  return out;
};
