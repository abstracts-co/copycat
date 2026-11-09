const CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35';
const MODEL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
const INDEX = [0, 11, 12, 13, 14, 15, 16, 19, 20, 23, 24, 25, 26, 27, 28];

let landmarker = null;
const ready = (async () => {
  const { FilesetResolver, PoseLandmarker } = await import(`${CDN}/vision_bundle.mjs`);
  const files = await FilesetResolver.forVisionTasks(`${CDN}/wasm`);
  // Module workers have no importScripts, which MediaPipe uses for its WebAssembly loader: run the loader here first.
  (0, eval)(await (await fetch(files.wasmLoaderPath)).text());
  self.importScripts = () => {};
  landmarker = await PoseLandmarker.createFromOptions(files, { baseOptions: { modelAssetPath: MODEL, delegate: 'CPU' }, runningMode: 'VIDEO', numPoses: 2, outputSegmentationMasks: true, minPoseDetectionConfidence: 0.5, minPosePresenceConfidence: 0.5, minTrackingConfidence: 0.5 });
  postMessage({ type: 'ready' });
})().catch((e) => postMessage({ type: 'error', message: String(e?.message ?? e) }));

let last = 0;
onmessage = async ({ data }) => {
  await ready;
  if (!landmarker || data.type !== 'frame') { data.bitmap?.close?.(); return; }
  const ts = Math.max(last + 1, data.ts); last = ts;
  let pose = null, mask = null, people = 0;
  landmarker.detectForVideo(data.bitmap, ts, (r) => {
    people = r.landmarks?.length ?? 0;
    const lm = r.landmarks?.[0];
    if (lm) {
      pose = new Float32Array(INDEX.length * 3);
      INDEX.forEach((m, i) => { const p = lm[m], inside = p.x > -0.02 && p.x < 1.02 && p.y > -0.02 && p.y < 1.02; pose[i * 3] = p.x; pose[i * 3 + 1] = p.y; pose[i * 3 + 2] = inside ? (p.visibility ?? 1) : 0; });
    }
    const m = r.segmentationMasks?.[0];
    if (m) mask = new Uint8Array(m.getAsUint8Array());
  });
  data.bitmap.close();
  postMessage({ type: 'result', id: data.id, pose, mask, people }, [pose?.buffer, mask?.buffer].filter(Boolean));
};
