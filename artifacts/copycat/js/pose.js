import { JOINTS, MEDIAPIPE_INDEX } from './dance.js';

const VERSION = '0.10.35';
const CDN = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}`;
const MODELS = {
  lite: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
  full: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task',
};

let loading = null;

/** MediaPipe Pose Landmarker, compiled to WebAssembly, running in this browser. Frames never leave the device. */
export const loadTracker = (model = 'lite') => (loading ??= (async () => {
  const { FilesetResolver, PoseLandmarker } = await import(`${CDN}/vision_bundle.mjs`);
  const files = await FilesetResolver.forVisionTasks(`${CDN}/wasm`);
  const options = (delegate) => ({
    baseOptions: { modelAssetPath: MODELS[model], delegate }, runningMode: 'VIDEO', numPoses: 1,
    minPoseDetectionConfidence: 0.5, minPosePresenceConfidence: 0.5, minTrackingConfidence: 0.5,
  });
  let landmarker;
  try { landmarker = await PoseLandmarker.createFromOptions(files, options('GPU')); } catch { landmarker = await PoseLandmarker.createFromOptions(files, options('CPU')); }
  let last = -1;
  return {
    detect(video, now = performance.now()) {
      if (now <= last || video.readyState < 2) return null;
      last = now;
      const lm = landmarker.detectForVideo(video, now).landmarks?.[0];
      if (!lm) return null;
      const out = new Float32Array(JOINTS.length * 3);
      MEDIAPIPE_INDEX.forEach((m, i) => {
        const p = lm[m];
        const inside = p.x > -0.02 && p.x < 1.02 && p.y > -0.02 && p.y < 1.02;
        out[i * 3] = p.x; out[i * 3 + 1] = p.y; out[i * 3 + 2] = inside ? (p.visibility ?? 1) : 0;
      });
      return out;
    },
  };
})().catch((e) => { loading = null; throw e; }));

export const openCamera = async () => {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('This browser can’t use a camera here.');
  const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: 'user', width: { ideal: 960 }, height: { ideal: 720 }, frameRate: { ideal: 30 } } });
  const video = document.createElement('video');
  video.playsInline = true; video.muted = true; video.srcObject = stream;
  await video.play();
  await new Promise((r) => (video.videoWidth ? r() : video.addEventListener('loadedmetadata', r, { once: true })));
  return { video, stream, aspect: video.videoWidth / video.videoHeight, stop: () => stream.getTracks().forEach((t) => t.stop()) };
};
