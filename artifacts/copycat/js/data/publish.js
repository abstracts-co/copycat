import { FORMAT, serializePose } from './format.js';
import { extension } from '../engine/recorder.js';
import { bridge } from './bridge.js';
import { store, loadFeed } from './store.js';
import { zip } from './zip.js';
import { clipAudio } from '../engine/music.js';

const APP = 'https://abstracts-co.github.io/copycat/artifacts/copycat/';
const MAX_FILE = 5 * 1024 * 1024;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
export const tags = (text) => [...new Set((text.match(/#?[\p{L}\p{N}_]+/gu) ?? []).map((t) => t.replace(/^#/, '').toLowerCase()))].slice(0, 10);

/** The Artifact folder for one dance: the app opened on it, its media, and the files Abstracts reads. */
export const danceFiles = async ({ title, hashtags, choice, privacy, result, trim }) => {
  const ext = extension(result.type), song = { ...choice.song };
  delete song.file;
  const clip = { start: choice.start + trim.start, length: trim.end - trim.start, offset: trim.start };
  const audio = song.source === 'file' && choice.file ? await clipAudio(choice.file, clip.start, clip.length) : null;
  const dance = {
    format: FORMAT, title, hashtags, mode: 'upper', privacy, created: new Date().toISOString(),
    song: audio ? { title: song.title, artist: song.artist, source: 'upload', file: 'song.wav', duration: clip.length } : song.source === 'file' ? { title: song.title, artist: song.artist, source: 'file', duration: song.duration } : song,
    clip: audio ? { ...clip, start: 0 } : clip,
    files: { video: `video.${ext}`, ghost: `ghost.${ext}`, pose: 'pose.json', cover: 'preview.webp' },
  };
  const credit = song.source === 'file' ? `“${song.title}”, uploaded by the dancer` : `“${song.title}”${song.artist ? ` by ${song.artist}` : ''}${song.license ? ` (${song.license})` : ''}`;
  const files = [
    { path: 'index.html', blob: new Blob([`<!doctype html>\n<html lang="en">\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n<meta name="copycat-dance" content="dance.json">\n<title>${esc(title)}</title>\n<link rel="stylesheet" href="${APP}css/app.css">\n<body>\n<div id="app"></div>\n<script type="module" src="${APP}js/app.js"></script>\n</body>\n</html>\n`], { type: 'text/html' }) },
    { path: 'dance.json', blob: new Blob([JSON.stringify(dance)], { type: 'application/json' }) },
    { path: 'pose.json', blob: new Blob([JSON.stringify(serializePose(result.frames))], { type: 'application/json' }) },
    { path: `video.${ext}`, blob: result.video },
    { path: `ghost.${ext}`, blob: result.ghost },
    { path: 'preview.webp', blob: result.cover },
    { path: 'artifact.json', blob: new Blob([JSON.stringify({ title, description: `A Copycat dance to ${credit}`, kind: 'web', entry: 'index.html', poster: 'preview.webp', category: 'dances', permissions: ['camera', 'microphone'] }, null, 2)], { type: 'application/json' }) },
    { path: 'content.md', blob: new Blob([`# ${title}\n\nA Copycat dance to ${credit}.${hashtags.length ? `\n\n${hashtags.map((t) => `#${t}`).join(' ')}` : ''}${song.page ? `\n\nSong: ${song.page}` : ''}\n\nCopy the ghost with your camera on a/copycat.\n`], { type: 'text/markdown' }) },
    ...(audio ? [{ path: 'song.wav', blob: audio }] : []),
  ];
  const big = files.some((f) => f.blob.size > MAX_FILE) || files.reduce((n, f) => n + f.blob.size, 0) > 2 * MAX_FILE;
  if (big) throw new Error('This dance is too long to post. Trim it to under 30 seconds.');
  return files;
};

export const publish = async (draft) => {
  const files = await danceFiles(draft);
  await bridge.hello;
  if (!bridge.available) {
    const blob = zip(await Promise.all(files.map(async (f) => ({ path: f.path, data: new Uint8Array(await f.blob.arrayBuffer()) }))));
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `${draft.title.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'dance'}.zip` });
    document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 3000);
    return { downloaded: true };
  }
  const text = [draft.title, draft.hashtags.map((t) => `#${t}`).join(' ')].filter(Boolean).join('\n\n');
  const r = await bridge.call('post', { text, title: draft.title, category: 'dances', files });
  loadFeed();
  return r;
};

const DB = 'copycat', STORE = 'drafts';
const db = () => new Promise((res, rej) => { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id' }); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const tx = async (mode, fn) => { const d = await db(); return new Promise((res, rej) => { const t = d.transaction(STORE, mode), out = fn(t.objectStore(STORE)); t.oncomplete = () => res(out?.result ?? out); t.onerror = () => rej(t.error); }); };
export const drafts = {
  save: (draft) => tx('readwrite', (s) => s.put({ ...draft, frames: draft.result.frames.map((f) => Array.from(f)), result: { ...draft.result, frames: undefined } })).then(() => store.set({ draftsVersion: Date.now() })),
  list: () => tx('readonly', (s) => s.getAll()).then((list) => (list ?? []).map((d) => ({ ...d, result: { ...d.result, frames: d.frames.map((f) => Float32Array.from(f)) } }))).catch(() => []),
  remove: (id) => tx('readwrite', (s) => s.delete(id)).then(() => store.set({ draftsVersion: Date.now() })),
};
