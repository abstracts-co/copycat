import { JOINTS, STAGE } from '../engine/pose.js';

export const FORMAT = 'copycat/dance@2';
export const RATE = 20;

const num = (v, lo, hi) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
const https = (v) => { try { const u = new URL(v); return u.protocol === 'https:' ? u.href : ''; } catch { return ''; } };

/** A song: where it plays from, who made it and the license that lets people dance to it. */
export const cleanSong = (t) => {
  if (!t || typeof t !== 'object') return null;
  const out = {
    id: str(t.id, 120) || songKey(t.title, t.artist), title: str(t.title, 120) || 'Untitled', artist: str(t.artist, 120),
    url: https(t.url), artwork: https(t.artwork), page: https(t.page), license: str(t.license, 40), licenseUrl: https(t.licenseUrl),
    source: str(t.source, 40), duration: num(t.duration, 1, 3600) ? t.duration : 0,
  };
  if (safe(t.file)) out.file = t.file;
  if (num(t.bpm, 40, 240)) out.bpm = t.bpm;
  if (Array.isArray(t.segment) && num(t.segment[0], 0, 3600) && num(t.segment[1], 0, 3600)) out.segment = [t.segment[0], t.segment[1]];
  if (!out.url && !out.file && out.source !== 'file') return null;
  return out;
};

/** CopycatSoundIdentity.key: one recording is one sound, whatever version tag or feature credit it carries. */
export const songKey = (title = '', artist = '') => `${normalize(title)}|${normalize((artist.split(/[,&;/]/)[0] ?? '').replace(/\s+(feat|ft|x|and|with)\.?\s.*$/i, ''))}`;
const normalize = (text) => String(text).toLowerCase().replace(/\s*[([].*?[)\]]/g, '').replace(/\s*-\s*(feat|ft|with)\.?\s.*$/, '').replace(/\s*(feat|ft)\.?\s.*$/, '')
  .normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');

/**
 * dance.json: everything but the media. Files next to it: the creator's video, the ghost video
 * (brightness on the left half, the person mask on the right) and pose.json (20 Hz, stage coordinates).
 */
export const parseDance = (raw) => {
  const d = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (!d || d.format !== FORMAT) throw new Error('This isn’t a Copycat dance.');
  const song = cleanSong(d.song);
  if (!song) throw new Error('This dance has no song.');
  const clip = { start: num(d.clip?.start, 0, 3600) ? d.clip.start : 0, length: num(d.clip?.length, 1, 300) ? d.clip.length : 30, offset: num(d.clip?.offset, 0, 300) ? d.clip.offset : 0 };
  return {
    format: FORMAT, title: str(d.title, 80) || 'Untitled dance', hashtags: Array.isArray(d.hashtags) ? d.hashtags.map((x) => str(x, 40)).filter(Boolean).slice(0, 10) : [],
    mode: d.mode === 'full' ? 'full' : 'upper', song, clip,
    files: { video: safe(d.files?.video) || 'video.mp4', ghost: safe(d.files?.ghost) || 'ghost.webm', pose: safe(d.files?.pose) || 'pose.json', cover: safe(d.files?.cover) || 'preview.webp' },
    privacy: d.privacy === true, created: str(d.created, 40),
    credit: d.credit && typeof d.credit === 'object' ? { name: str(d.credit.name, 80), url: https(d.credit.url), license: str(d.credit.license, 40) } : null,
  };
};
const safe = (p) => (typeof p === 'string' && /^[a-z0-9][a-z0-9._-]{0,60}$/i.test(p) ? p : '');

export const parsePose = (raw, length, offset = 0) => {
  const d = typeof raw === 'string' ? JSON.parse(raw) : raw;
  const joints = Array.isArray(d?.joints) ? d.joints : JOINTS, map = JOINTS.map((n) => joints.indexOf(n)), width = joints.length * 3;
  if (!Array.isArray(d?.frames) || d.frames.length < RATE) throw new Error('This dance has no moves.');
  const frames = d.frames.slice(Math.round(offset * RATE), Math.round(offset * RATE) + RATE * 300).map((f) => {
    const out = new Float32Array(JOINTS.length * 3);
    if (!Array.isArray(f) || f.length !== width) return out;
    map.forEach((src, i) => { if (src >= 0) { const x = f[src * 3], y = f[src * 3 + 1], v = f[src * 3 + 2]; if (num(x, -1, 2) && num(y, -1, 2) && num(v, 0, 1)) { out[i * 3] = x; out[i * 3 + 1] = y; out[i * 3 + 2] = v; } } });
    return out;
  });
  return { frames, length: Math.min(length ?? Infinity, frames.length / RATE), aspect: STAGE.aspect };
};

export const serializePose = (frames) => ({ rate: RATE, space: 'stage-9x16-mirrored', joints: JOINTS, frames: frames.map((f) => Array.from(f, (v, i) => (i % 3 === 2 ? Math.round(v * 100) / 100 : Math.round(v * 1000) / 1000))) });

export const sample = (frames, t, out = new Float32Array(JOINTS.length * 3)) => {
  const p = t * RATE;
  if (!(p >= 0) || p > frames.length - 1) return null;
  const i = Math.floor(p), f = p - i, a = frames[i], b = frames[Math.min(i + 1, frames.length - 1)];
  for (let k = 0; k < out.length; k++) out[k] = a[k] + (b[k] - a[k]) * f;
  return out;
};
