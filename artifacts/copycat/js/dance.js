export const FORMAT = 'copycat/dance@1';
export const RATE = 20;
export const JOINTS = ['nose', 'leftShoulder', 'rightShoulder', 'leftElbow', 'rightElbow', 'leftWrist', 'rightWrist', 'leftIndex', 'rightIndex', 'leftHip', 'rightHip', 'leftKnee', 'rightKnee', 'leftAnkle', 'rightAnkle'];
export const MEDIAPIPE_INDEX = [0, 11, 12, 13, 14, 15, 16, 19, 20, 23, 24, 25, 26, 27, 28];
export const J = Object.fromEntries(JOINTS.map((n, i) => [n, i]));

export const BONES = [
  ['leftShoulder', 'rightShoulder'], ['leftShoulder', 'leftElbow'], ['leftElbow', 'leftWrist'], ['rightShoulder', 'rightElbow'], ['rightElbow', 'rightWrist'],
  ['leftShoulder', 'leftHip'], ['rightShoulder', 'rightHip'], ['leftHip', 'rightHip'], ['leftHip', 'leftKnee'], ['leftKnee', 'leftAnkle'], ['rightHip', 'rightKnee'], ['rightKnee', 'rightAnkle'],
].map(([a, b]) => [J[a], J[b]]);

const num = (v, lo, hi) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
const https = (v) => { try { const u = new URL(v); return u.protocol === 'https:' ? u.href : ''; } catch { return ''; } };

export const cleanTrack = (t) => {
  if (!t || typeof t !== 'object') return null;
  const out = {
    title: str(t.title, 120) || 'Untitled', artist: str(t.artist, 120), url: https(t.url), page: https(t.page),
    license: str(t.license, 40), licenseUrl: https(t.licenseUrl), source: str(t.source, 40),
    duration: num(t.duration, 1, 3600) ? t.duration : 0,
  };
  if (num(t.bpm, 40, 240)) out.bpm = t.bpm;
  if (num(t.firstBeat, 0, 60)) out.firstBeat = t.firstBeat;
  if (Array.isArray(t.segment) && num(t.segment[0], 0, 3600) && num(t.segment[1], 0, 3600) && t.segment[1] > t.segment[0]) out.segment = [t.segment[0], t.segment[1]];
  if (!out.url && out.source !== 'file' && out.source !== 'beat') return null;
  return out;
};

export const parseDance = (raw) => {
  const d = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (!d || d.format !== FORMAT) throw new Error('Not a Copycat dance');
  const joints = Array.isArray(d.joints) ? d.joints : JOINTS;
  const map = JOINTS.map((n) => joints.indexOf(n));
  if (!Array.isArray(d.frames) || d.frames.length < RATE * 3 || d.frames.length > RATE * 600) throw new Error('This dance has no moves');
  const width = joints.length * 3;
  const frames = d.frames.map((f) => {
    const out = new Float32Array(JOINTS.length * 3);
    if (!Array.isArray(f) || f.length !== width) return out;
    map.forEach((src, i) => {
      if (src < 0) return;
      const x = f[src * 3], y = f[src * 3 + 1], v = f[src * 3 + 2];
      if (num(x, -1, 2) && num(y, -1, 2) && num(v, 0, 1)) { out[i * 3] = x; out[i * 3 + 1] = y; out[i * 3 + 2] = v; }
    });
    return out;
  });
  const song = d.song === null ? { title: 'Beat', source: 'beat', bpm: num(d.bpm, 40, 240) ? d.bpm : 110, duration: 0 } : cleanTrack(d.song);
  if (!song) throw new Error('This dance has no song');
  return {
    format: FORMAT, id: str(d.id, 64).replace(/[^a-z0-9-]/g, '') || 'dance', title: str(d.title, 80) || 'Untitled dance', by: str(d.by, 60),
    mode: d.mode === 'full' ? 'full' : 'upper', aspect: num(d.aspect, 0.3, 3) ? d.aspect : 4 / 3, start: num(d.start, 0, 3600) ? d.start : 0,
    bpm: num(d.bpm, 40, 240) ? d.bpm : song.bpm ?? 0, song, frames, length: frames.length / RATE, ghost: str(d.ghost, 40),
  };
};

export const serializeDance = (d) => ({
  format: FORMAT, id: d.id, title: d.title, by: d.by || '', mode: d.mode, aspect: Math.round(d.aspect * 1000) / 1000, start: Math.round(d.start * 1000) / 1000,
  bpm: d.bpm || undefined, song: d.song.source === 'beat' ? null : d.song, rate: RATE, joints: JOINTS,
  frames: d.frames.map((f) => Array.from(f, (v, i) => (i % 3 === 2 ? Math.round(v * 100) / 100 : Math.round(v * 1000) / 1000))),
});

/** Pose at dance time t (seconds from the dance's start), linearly interpolated; null outside the dance. */
export const sample = (frames, t, out = new Float32Array(JOINTS.length * 3)) => {
  const p = t * RATE;
  if (!(p >= 0) || p > frames.length - 1) return null;
  const i = Math.floor(p), f = p - i, a = frames[i], b = frames[Math.min(i + 1, frames.length - 1)];
  for (let k = 0; k < out.length; k++) out[k] = a[k] + (b[k] - a[k]) * f;
  return out;
};

export const visible = (pose, j, min = 0.4) => pose[j * 3 + 2] >= min;
