export const JOINTS = ['nose', 'leftShoulder', 'rightShoulder', 'leftElbow', 'rightElbow', 'leftWrist', 'rightWrist', 'leftIndex', 'rightIndex', 'leftHip', 'rightHip', 'leftKnee', 'rightKnee', 'leftAnkle', 'rightAnkle'];
export const MEDIAPIPE_INDEX = [0, 11, 12, 13, 14, 15, 16, 19, 20, 23, 24, 25, 26, 27, 28];
export const J = Object.fromEntries(JOINTS.map((n, i) => [n, i]));
export const STAGE = { w: 540, h: 960, aspect: 9 / 16 };
export const WORK = { w: 288, h: 512 };

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
 * Each frame draws the camera's 9:16 centre crop, mirrored like a selfie, into a small work canvas and, when the
 * worker is free, sends it for tracking. Results carry the moment their frame was captured, and `sent` keeps that
 * exact frame so the ghost track pairs brightness and mask from the same instant.
 */
export class Tracker {
  constructor(worker) {
    this.worker = worker;
    const canvas = () => Object.assign(document.createElement('canvas'), { width: WORK.w, height: WORK.h });
    this.work = canvas(); this.workCtx = this.work.getContext('2d');
    this.sent = canvas(); this.sentCtx = this.sent.getContext('2d');
    this.frameAt = canvas(); this.frameAtCtx = this.frameAt.getContext('2d');
    this.mask = canvas(); this.maskCtx = this.mask.getContext('2d');
    this.maskData = this.maskCtx.createImageData(WORK.w, WORK.h);
    this.people = 0; this.hasMask = false; this.busy = false; this.seq = 0; this.result = null; this.pending = new Map();
    worker.onmessage = ({ data }) => {
      if (data.type !== 'result') return;
      const at = this.pending.get(data.id); this.pending.delete(data.id); this.busy = false;
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
  frame(video) {
    if (video.readyState < 2 || !video.videoWidth) return null;
    drawCrop(this.workCtx, video, WORK.w, WORK.h, true);
    if (!this.busy) {
      this.busy = true;
      const id = ++this.seq, at = performance.now();
      this.pending.set(id, at); this.sentCtx.drawImage(this.work, 0, 0);
      createImageBitmap(this.work).then((bitmap) => this.worker.postMessage({ type: 'frame', id, ts: Math.round(at), bitmap }, [bitmap])).catch(() => { this.busy = false; });
    }
    const r = this.result; this.result = null;
    if (!r) return null;
    this.capturedAt = r.at;
    return r.pose ?? null;
  }
}

/** Aspect-fills a 9:16 portrait crop of the camera into ctx, mirrored when asked. */
export const drawCrop = (ctx, video, w, h, mirror) => {
  const vw = video.videoWidth, vh = video.videoHeight, target = w / h;
  let sw = vw, sh = vh, sx = 0, sy = 0;
  if (vw / vh > target) { sw = vh * target; sx = (vw - sw) / 2; } else { sh = vw / target; sy = (vh - sh) / 2; }
  ctx.save();
  if (mirror) { ctx.translate(w, 0); ctx.scale(-1, 1); }
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, w, h);
  ctx.restore();
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
