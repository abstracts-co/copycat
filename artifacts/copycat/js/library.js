import { parseDance, serializeDance } from './dance.js';
import { parsePack } from './music.js';
import { cleanGhost } from './ghost.js';

export const HOME = 'https://abstracts.co/a/copycat';
export const PAGES = 'https://abstracts-co.github.io/copycat/artifacts/copycat/';
const COMMUNITY = 'https://abstracts.co/a/copycat.json';
const BASE = new URL('../', import.meta.url);
const TRUSTED = ['abstracts.co', 'abstracts-co.github.io', 'localhost', '127.0.0.1'];

export const sandboxed = (() => { try { return self.origin === 'null'; } catch { return true; } })();

const getJSON = async (url) => {
  const r = await fetch(url, { credentials: 'omit' });
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json();
};
const trusted = (url) => { try { const u = new URL(url); return (u.protocol === 'https:' || u.hostname === 'localhost' || u.hostname === '127.0.0.1') && TRUSTED.includes(u.hostname); } catch { return false; } };

const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } },
};
export const prefs = { get: (k, d) => store.get(`copycat:${k}`, d), set: (k, v) => store.set(`copycat:${k}`, v) };

export const starterIndex = () => getJSON(new URL('library/dances/index.json', BASE)).then((x) => x.dances.map((d) => ({ ...d, ref: `s:${d.id}`, by: 'Copycat', source: 'starter' })));
export const starterMusic = () => getJSON(new URL('library/music.json', BASE)).then((x) => parsePack(x, 'Copycat'));

const cache = new Map();
export const loadDance = async (ref) => {
  if (cache.has(ref)) return cache.get(ref);
  let raw;
  if (ref.startsWith('s:')) raw = await getJSON(new URL(`library/dances/${ref.slice(2).replace(/[^a-z0-9-]/g, '')}.json`, BASE));
  else if (ref.startsWith('u:')) {
    const url = ref.slice(2);
    if (!trusted(url)) throw new Error('Copycat only opens dances posted on a/copycat.');
    raw = await getJSON(url);
  } else if (ref.startsWith('m:')) raw = mine().find((d) => d.id === ref.slice(2));
  if (!raw) throw new Error('That dance is gone.');
  const d = parseDance(raw);
  cache.set(ref, d);
  return d;
};
export const remember = (ref, dance) => cache.set(ref, dance);

export const mine = () => store.get('copycat:mine', []);
export const saveMine = (dance) => {
  const list = mine().filter((d) => d.id !== dance.id);
  list.unshift(serializeDance(dance));
  while (list.length && !store.set('copycat:mine', list)) list.pop();
  cache.delete(`m:${dance.id}`);
  return list.some((d) => d.id === dance.id);
};
export const forgetMine = (id) => { store.set('copycat:mine', mine().filter((d) => d.id !== id)); cache.delete(`m:${id}`); };

/** Everything members posted to a/copycat: dances, music packs and ghost styles, read from Abstracts' public JSON. */
export const community = async () => {
  const out = { dances: [], packs: [], ghosts: [] };
  let items = [];
  try { items = (await getJSON(COMMUNITY)).artifacts?.items ?? []; } catch { return out; }
  const wanted = items.filter((a) => a.id !== 'copycat' && a.json && trusted(a.json)).slice(0, 60);
  await Promise.all(wanted.map(async (a) => {
    try {
      const meta = await getJSON(a.json);
      const files = meta.files?.items ?? [];
      const file = (name) => files.find((f) => f.path === name)?.url;
      const by = meta.maker?.username ?? meta.maker?.login ?? '';
      const dance = file('dance.json'), music = file('music.json'), ghost = file('ghost.json');
      if (dance && trusted(dance)) {
        const d = parseDance(await getJSON(dance));
        const ref = `u:${dance}`;
        remember(ref, d);
        out.dances.push({ ref, id: d.id, title: a.title || d.title, mode: d.mode, song: d.song.title, artist: d.song.artist, length: Math.round(d.length), by: d.by || by, page: a.url, source: 'community', pinned: a.pinned });
      }
      if (music && trusted(music)) { const p = parsePack(await getJSON(music), by); if (p) out.packs.push({ ...p, page: a.url }); }
      if (ghost && trusted(ghost)) { const g = cleanGhost(await getJSON(ghost)); if (g) out.ghosts.push({ ...g, id: `c:${a.id}`, page: a.url }); }
    } catch {}
  }));
  out.dances.sort((x, y) => (y.pinned ? 1 : 0) - (x.pinned ? 1 : 0));
  return out;
};

export const playUrl = (ref, mode = 'play') => `${PAGES}#${mode}=${encodeURIComponent(ref)}`;
