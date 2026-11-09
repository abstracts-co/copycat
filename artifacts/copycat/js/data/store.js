import { createStore, storage } from '../lib.js';
import { parseDance, songKey, cleanSong } from './format.js';
import { bridge } from './bridge.js';

export const HOST = (() => { try { const h = new URLSearchParams(location.search).get('host'); if (h && /^(localhost|127\.0\.0\.1)$/.test(location.hostname)) return h; } catch {} return 'https://abstracts.co'; })();
export const store = createStore({
  community: 'copycat',
  tab: 'home',
  stack: [],
  viewer: null,
  feed: { loading: true, error: null, dances: [] },
  packs: [],
  profiles: {},
  liked: new Set(storage.get('liked', [])),
  likeBusy: new Set(),
  comments: {},
  ghostOpacity: storage.get('ghostOpacity', 0.2),
  countdown: storage.get('countdown', 3),
});

let navSeq = 0;
export const nav = {
  push(name, params = {}) { store.set((s) => ({ stack: [...s.stack, { name, params, id: ++navSeq }] })); },
  pop() { store.set((s) => ({ stack: s.stack.slice(0, -1) })); },
  replace(name, params = {}) { store.set((s) => ({ stack: [...s.stack.slice(0, -1), { name, params, id: ++navSeq }] })); },
  home() { store.set({ stack: [], tab: 'home' }); },
  tab(tab) { store.set({ tab }); },
};

const getJSON = async (url) => { const r = await fetch(url, { credentials: 'omit' }); if (!r.ok) throw new Error(`${r.status}`); return r.json(); };
const limit = async (items, n, fn) => { const out = []; let i = 0; await Promise.all([...Array(Math.min(n, items.length))].map(async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]).catch(() => null); } })); return out; };

const profileCache = new Map();
export const loadUser = (handle) => {
  if (!handle) return Promise.resolve(null);
  if (!profileCache.has(handle)) profileCache.set(handle, getJSON(`${HOST}/u/${encodeURIComponent(handle)}.json`).then((d) => toUser(d.profile)).catch(() => ({ handle, name: handle, avatar: null })));
  return profileCache.get(handle);
};
const toUser = (p) => p && ({ handle: p.handle, name: p.name || p.handle, avatar: p.avatar ? new URL(p.avatar, HOST).href : null, bio: p.bio || '', number: p.number, profile: p.url, rep: p.communities?.find((c) => c.slug === store.get().community)?.reputation?.score ?? 0 });

/** Dances are a/copycat Artifact posts carrying dance.json, video, ghost and pose files. Likes and comments are the post's. */
export const loadFeed = async () => {
  const slug = store.get().community;
  store.set((s) => ({ feed: { ...s.feed, loading: true, error: null } }));
  try {
    const community = await getJSON(`${HOST}/a/${slug}.json`);
    const replies = new Map((community.posts?.items ?? []).map((p) => [p.number, p.replies ?? 0]));
    const counts = community.social_counts ?? {};
    const all = community.artifacts?.items ?? [];
    limit(all.filter((a) => a.category === 'music'), 4, async (a) => {
      const meta = await getJSON(a.json), url = (meta.files?.items ?? []).find((f) => f.path === 'music.json')?.url;
      const pack = url && await getJSON(url);
      return pack?.format === 'copycat/music@1' ? { title: String(pack.title ?? a.title).slice(0, 60), tracks: (pack.tracks ?? []).slice(0, 200).map(cleanSong).filter((t) => t?.url) } : null;
    }).then((packs) => store.set({ packs: packs.filter(Boolean) }));
    const items = all.filter((a) => a.category === 'dances' || (a.id !== 'copycat' && a.category !== 'music' && a.category !== 'game'));
    const dances = (await limit(items, 6, async (a) => {
      const meta = await getJSON(a.json);
      const files = Object.fromEntries((meta.files?.items ?? []).map((f) => [f.path, f.url]));
      if (!files['dance.json']) return null;
      const d = parseDance(await getJSON(files['dance.json']));
      const handle = meta.maker?.username ?? meta.maker?.handle ?? meta.maker?.login ?? null;
      const postNumber = meta.post?.number ?? (typeof meta.post === 'number' ? meta.post : null);
      const keys = Object.keys(meta.social_counts ?? {}), postKey = keys.find((k) => k.includes(':post/')) ?? null, artifactKey = keys.find((k) => k.includes(':artifact/')) ?? null;
      const itemKey = postKey ?? artifactKey;
      const social = { ...(counts[itemKey] ?? {}), ...(meta.social_counts?.[itemKey] ?? {}) };
      return {
        id: meta.id, title: d.title, hashtags: d.hashtags, mode: d.mode, song: d.song, clip: d.clip, privacy: d.privacy,
        creator: { handle, name: handle ?? d.credit?.name ?? 'Dancer', avatar: null }, credit: d.credit, thumbnail: files[d.files.cover] ?? files['preview.webp'] ?? files['preview.png'] ?? null,
        video: files[d.files.video], ghost: files[d.files.ghost], pose: files[d.files.pose],
        likes: social.up ?? 0, comments: replies.get(postNumber) ?? meta.post?.replies ?? 0, itemKey,
        post: postNumber ? { number: postNumber, url: `${HOST}/a/${slug}/p/${postNumber}`, json: `${HOST}/a/${slug}/p/${postNumber}.json` } : null,
        url: meta.url, created: d.created || meta.source_revision || '', pinned: !!a.pinned,
      };
    })).filter((d) => d && d.video && d.pose);
    store.set({ feed: { loading: false, error: null, dances } });
    await Promise.all(dances.map(async (d) => { if (!d.creator.handle) return; const u = await loadUser(d.creator.handle); if (u) d.creator = u; }));
    store.set((s) => ({ feed: { ...s.feed, dances: [...s.feed.dances] } }));
  } catch (e) {
    store.set((s) => ({ feed: { ...s.feed, loading: false, error: 'Check your connection and try again.' } }));
  }
};

export const homeModel = (dances) => {
  const popular = [...dances].sort((a, b) => b.likes - a.likes || String(b.created).localeCompare(String(a.created)));
  const uses = new Map();
  for (const d of dances) { const k = songKey(d.song.title, d.song.artist); uses.set(k, [...(uses.get(k) ?? []), d]); }
  const sounds = [...uses.values()].sort((a, b) => b.length - a.length).map((list) => ({ ...list[0], uses: list.length }));
  return { featured: popular[0] ?? null, trendingSounds: sounds, popularDances: popular };
};

export const dancesFor = (song) => store.get().feed.dances.filter((d) => songKey(d.song.title, d.song.artist) === songKey(song.title, song.artist));

export const profileModel = (handle) => {
  const s = store.get(), dances = s.feed.dances.filter((d) => d.creator.handle === handle);
  const user = s.profiles[handle] ?? dances[0]?.creator ?? { handle, name: handle };
  return { user, dances, likes: dances.reduce((n, d) => n + d.likes, 0), isOwner: !!s.viewer && s.viewer.username === handle };
};
export const loadProfile = async (handle) => {
  const u = await loadUser(handle);
  if (u) store.set((s) => ({ profiles: { ...s.profiles, [handle]: u } }));
};

/** Who's playing, asked through abstracts.co the first time it matters. */
export const ensureViewer = async ({ quiet = false } = {}) => {
  if (store.get().viewer) return store.get().viewer;
  await bridge.hello;
  if (!bridge.available) { if (!quiet) throw Object.assign(new Error('Open Copycat on abstracts.co to sign in.'), { code: 'unsupported' }); return null; }
  try {
    const v = await bridge.call('viewer');
    const viewer = { ...v, avatar: v.avatar ? new URL(v.avatar, HOST).href : null };
    store.set({ viewer });
    return viewer;
  } catch (e) { if (quiet) return null; throw e; }
};

export const toggleLike = async (dance) => {
  const s = store.get();
  if (!dance.itemKey || s.likeBusy.has(dance.id)) return;
  await ensureViewer();
  const liked = s.liked.has(dance.id), busy = new Set(s.likeBusy); busy.add(dance.id);
  store.set({ likeBusy: busy });
  try {
    const r = await bridge.call('vote', { item: dance.itemKey, value: liked ? 0 : 1 });
    const set = new Set(store.get().liked);
    if (liked) set.delete(dance.id); else set.add(dance.id);
    storage.set('liked', [...set]);
    dance.likes = r?.counts?.up ?? Math.max(0, dance.likes + (liked ? -1 : 1));
    store.set((st) => ({ liked: set, feed: { ...st.feed, dances: [...st.feed.dances] } }));
  } finally {
    const done = new Set(store.get().likeBusy); done.delete(dance.id); store.set({ likeBusy: done });
  }
};

export const loadComments = async (dance) => {
  if (!dance.post) { store.set((s) => ({ comments: { ...s.comments, [dance.id]: { loading: false, items: [] } } })); return; }
  store.set((s) => ({ comments: { ...s.comments, [dance.id]: { ...(s.comments[dance.id] ?? {}), loading: true, error: null } } }));
  try {
    const p = await getJSON(dance.post.json);
    const items = (p.replies?.items ?? p.replies ?? []).filter((r) => typeof r === 'object').map((r) => ({ id: r.id ?? r.url, author: String(r.author ?? '').replace(/^u\//, '') || 'Dancer', body: r.body ?? r.text ?? '', at: r.created_at }));
    store.set((s) => ({ comments: { ...s.comments, [dance.id]: { loading: false, error: null, items } } }));
  } catch { store.set((s) => ({ comments: { ...s.comments, [dance.id]: { loading: false, error: 'Couldn’t load comments.', items: s.comments[dance.id]?.items ?? [] } } })); }
};

export const setPref = (k, v) => { storage.set(k, v); store.set({ [k]: v }); };
