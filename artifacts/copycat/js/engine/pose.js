export const JOINTS = ['nose', 'leftShoulder', 'rightShoulder', 'leftElbow', 'rightElbow', 'leftWrist', 'rightWrist', 'leftIndex', 'rightIndex', 'leftHip', 'rightHip', 'leftKnee', 'rightKnee', 'leftAnkle', 'rightAnkle'];
export const MEDIAPIPE_INDEX = [0, 11, 12, 13, 14, 15, 16, 19, 20, 23, 24, 25, 26, 27, 28];
export const J = Object.fromEntries(JOINTS.map((n, i) => [n, i]));
export const STAGE = { w: 540, h: 960, aspect: 9 / 16 };
const WORK_LONG = 512;

/** Width and height for a canvas of the given aspect whose long side is `long`. */
export const fitSize = (aspect, long) => (aspect >= 1 ? { w: long, h: Math.round(long / aspect) } : { w: Math.round(long * aspect), h: long });

let loading = null;
/**
 * MediaPipe Pose Landmarker with its person mask, compiled to WebAssembly, in a Web Worker so drawing and
 * recording keep full frame rate. It runs on the CPU delegate: the GPU delegate can't read masks back on some
 * WebGL stacks (glReadPixels format errors) and drops under 1 fps on software GL.
 */
export const loadTracker = () => (loading ??= new Promise((resolve, reject) => {
  const url = new URL('./tracker-worker.js', import.meta.url).href;
  const worker = new Worker(URL.createObjectURL(new Blob([`import ${JSON.stringify(url)};`], { type: 'text/javascript' })), { type: 'module' });
  const timer = setTimeout(() => reject(new Error('Tracking didn’t start. Check your connection and try again.')), 45000);
  worker.onmessage = ({ data }) => {
    if (data.type === 'ready') { clearTimeout(timer); worker.onmessage = null; resolve(worker); }
    if (data.type === 'error') { clearTimeout(timer); reject(new Error(data.message)); }
  };
  worker.onerror = (e) => { clearTimeout(timer); reject(new Error(e.message || 'Tracking didn’t start.')); };
}).catch((e) => { loading = null; throw e; }));

/**
 * Each frame draws the whole camera picture, mirrored like a selfie, into a small work canvas and, when the worker is
 * free, sends it for tracking. Poses and the mask are in that full-frame view (0…1 across the camera picture, at the
 * camera's own aspect). Results carry the moment their frame was captured, and `frameAt` keeps that exact frame so the
 * ghost track pairs brightness and mask from the same instant.
 */
export class Tracker {
  constructor(worker) {
    this.worker = worker;
    this.people = 0; this.hasMask = false; this.busy = false; this.seq = 0; this.result = null; this.pending = new Map(); this.aspect = 0;
    worker.onmessage = ({ data }) => {
      if (data.type !== 'result') return;
      const at = this.pending.get(data.id); this.pending.delete(data.id); this.busy = false;
      if (data.w !== this.size.w || data.h !== this.size.h) return;
      this.people = data.people;
      if (data.mask) {
        const d = this.maskData.data, f = data.mask;
        for (let i = 0, j = 3; i < f.length; i++, j += 4) { d[j - 3] = d[j - 2] = d[j - 1] = 255; d[j] = f[i]; }
        this.maskCtx.putImageData(this.maskData, 0, 0); this.hasMask = true;
      } else this.hasMask = false;
      this.frameAtCtx.drawImage(this.sent, 0, 0);
      this.result = { pose: data.pose, at };
    };
  }
  setup(aspect) {
    this.aspect = aspect; this.size = fitSize(aspect, WORK_LONG);
    const canvas = () => Object.assign(document.createElement('canvas'), { width: this.size.w, height: this.size.h });
    this.work = canvas(); this.workCtx = this.work.getContext('2d');
    this.sent = canvas(); this.sentCtx = this.sent.getContext('2d');
    this.frameAt = canvas(); this.frameAtCtx = this.frameAt.getContext('2d');
    this.mask = canvas(); this.maskCtx = this.mask.getContext('2d');
    this.maskData = this.maskCtx.createImageData(this.size.w, this.size.h);
    this.hasMask = false;
  }
  frame(video) {
    if (video.readyState < 2 || !video.videoWidth) return null;
    const aspect = video.videoWidth / video.videoHeight;
    if (Math.abs(aspect - this.aspect) > 0.01) this.setup(aspect);
    drawMirrored(this.workCtx, video, this.size.w, this.size.h);
    if (!this.busy) {
      this.busy = true;
      const id = ++this.seq, at = performance.now(), { w, h } = this.size;
      this.pending.set(id, at); this.sentCtx.drawImage(this.work, 0, 0);
      createImageBitmap(this.work).then((bitmap) => this.worker.postMessage({ type: 'frame', id, ts: Math.round(at), bitmap, w, h }, [bitmap])).catch(() => { this.busy = false; });
    }
    const r = this.result; this.result = null;
    if (!r) return null;
    this.capturedAt = r.at;
    return r.pose ?? null;
  }
}

/** Draws the whole camera picture into ctx, mirrored like a selfie. */
export const drawMirrored = (ctx, video, w, h) => {
  ctx.save(); ctx.translate(w, 0); ctx.scale(-1, 1);
  ctx.drawImage(video, 0, 0, w, h);
  ctx.restore();
};

/** The centre 9:16 part of a view of the given aspect, in view coordinates: what a recorded dance keeps. */
export const danceCrop = (aspect) => {
  const w = Math.min(1, STAGE.aspect / aspect), h = Math.min(1, aspect / STAGE.aspect);
  return { x: (1 - w) / 2, y: (1 - h) / 2, w, h };
};
export const toDance = (pose, crop) => {
  if (!pose) return null;
  const out = new Float32Array(pose.length);
  for (let i = 0; i < pose.length; i += 3) {
    const x = (pose[i] - crop.x) / crop.w, y = (pose[i + 1] - crop.y) / crop.h;
    out[i] = x; out[i + 1] = y; out[i + 2] = x > -0.02 && x < 1.02 && y > -0.02 && y < 1.02 ? pose[i + 2] : 0;
  }
  return out;
};

export const openCamera = async ({ audio = false } = {}) => {
  if (!navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error('This browser can’t open a camera here.'), { name: 'Unavailable' });
  const stream = await navigator.mediaDevices.getUserMedia({ audio, video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } } });
  const video = document.createElement('video');
  video.playsInline = true; video.muted = true; video.srcObject = stream;
  await video.play();
  if (!video.videoWidth) await new Promise((r) => video.addEventListener('loadedmetadata', r, { once: true }));
  return { video, stream, stop: () => stream.getTracks().forEach((t) => t.stop()) };
};
