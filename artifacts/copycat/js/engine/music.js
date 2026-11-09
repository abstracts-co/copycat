import { cleanSong } from '../data/format.js';
import { HOST } from '../data/store.js';

const wav = (pcm, rate) => {
  const out = new DataView(new ArrayBuffer(44 + pcm.length * 2));
  const text = (at, s) => { for (let i = 0; i < s.length; i++) out.setUint8(at + i, s.charCodeAt(i)); };
  text(0, 'RIFF'); out.setUint32(4, 36 + pcm.length * 2, true); text(8, 'WAVEfmt '); out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 1, true);
  out.setUint32(24, rate, true); out.setUint32(28, rate * 2, true); out.setUint16(32, 2, true); out.setUint16(34, 16, true); text(36, 'data'); out.setUint32(40, pcm.length * 2, true);
  for (let i = 0; i < pcm.length; i++) out.setInt16(44 + i * 2, Math.max(-1, Math.min(1, pcm[i])) * 0x7fff, true);
  return new Blob([out], { type: 'audio/wav' });
};

// iPhone Safari plays sound only from an element that first played during a tap. Every song shares this one element,
// and the first tap anywhere plays a moment of silence on it, so songs can start later from a countdown or a timer.
const player = new Audio();
player.preload = 'auto';
const unlock = () => {
  removeEventListener('click', unlock, true); removeEventListener('touchend', unlock, true);
  if (player.getAttribute('src')) return;
  const silence = URL.createObjectURL(wav(new Float32Array(2400), 24000));
  player.src = silence;
  player.play().catch(() => {}).finally(() => { if (player.src === silence) { player.pause(); player.removeAttribute('src'); player.load(); } URL.revokeObjectURL(silence); });
};
addEventListener('click', unlock, true); addEventListener('touchend', unlock, true);
let owner = null;

/** The song is the clock: dance time comes from the audio position, smoothed between coarse currentTime updates. */
export class SongClock {
  constructor(song, file = null) {
    owner?.stop(); owner = this;
    this.song = song; this.file = file; this.audio = player; this.anchor = null;
    this.src = file ? URL.createObjectURL(file) : song.url;
    player.src = this.src;
  }
  get live() { return owner === this; }
  load() {
    if (player.readyState >= 3) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const done = () => { clean(); resolve(); }, fail = () => { clean(); reject(new Error('This song won’t play right now.')); };
      const clean = () => { player.removeEventListener('canplay', done); player.removeEventListener('error', fail); };
      player.addEventListener('canplay', done); player.addEventListener('error', fail);
      player.load();
    });
  }
  async ready() {
    try { await this.load(); } catch (e) {
      const fresh = this.song.apple && !this.file && this.live ? await applePreview(this.song.apple).catch(() => null) : null;
      if (!fresh || !this.live) throw e;
      this.src = fresh; player.src = fresh; await this.load();
    }
  }
  get duration() { return (this.live && player.duration) || this.song.duration || 0; }
  set muted(v) { if (this.live) player.muted = v; }
  async play(from) { if (!this.live) return; player.currentTime = Math.max(0, from); this.anchor = null; await player.play(); }
  pause() { if (this.live) player.pause(); }
  resume() { this.anchor = null; return this.live ? player.play() : Promise.resolve(); }
  seek(t) { if (this.live) player.currentTime = Math.max(0, t); this.anchor = null; }
  get paused() { return !this.live || player.paused; }
  now() {
    const a = this.live ? player.currentTime : 0, p = performance.now() / 1000;
    if (this.paused) return a;
    if (!this.anchor || Math.abs(this.anchor.a + (p - this.anchor.p) - a) > 0.08) this.anchor = { a, p };
    return Math.max(a - 0.05, Math.min(a + 0.3, this.anchor.a + (p - this.anchor.p)));
  }
  stop() {
    if (owner === this) { owner = null; player.pause(); player.removeAttribute('src'); player.load(); }
    if (this.file && this.src.startsWith('blob:')) URL.revokeObjectURL(this.src);
  }
}

let youtubeApi = null;
const loadYouTube = () => youtubeApi ??= new Promise((resolve, reject) => {
  if (window.YT?.Player) return resolve(window.YT);
  const ready = window.onYouTubeIframeAPIReady;
  window.onYouTubeIframeAPIReady = () => { ready?.(); resolve(window.YT); };
  document.head.append(Object.assign(document.createElement('script'), { src: 'https://www.youtube.com/iframe_api', onerror: () => { youtubeApi = null; reject(new Error('YouTube won’t load right now.')); } }));
});

/** A YouTube song plays in YouTube's own player, kept visible at YouTube's 200×200 minimum; its position is the clock. */
export class YouTubeClock {
  constructor(song) {
    this.song = song; this.state = -1; this.last = null;
    this.box = Object.assign(document.createElement('div'), { className: 'yt-window' });
    // The art origin serves Referrer-Policy: no-referrer, and YouTube's player refuses to load without one (error 153).
    const frame = Object.assign(document.createElement('iframe'), {
      src: `https://www.youtube.com/embed/${song.youtube}?enablejsapi=1&playsinline=1&rel=0&origin=${encodeURIComponent(location.origin)}`,
      allow: 'autoplay; encrypted-media', referrerPolicy: 'strict-origin-when-cross-origin', title: song.title, width: 200, height: 200,
    });
    this.box.append(frame, Object.assign(document.createElement('p'), { className: 'yt-hint', textContent: 'Tap to start the song' }));
    document.getElementById('app').append(this.box);
    this.loaded = loadYouTube().then((YT) => new Promise((resolve, reject) => {
      this.player = new YT.Player(frame, {
        events: {
          onReady: () => resolve(),
          onError: () => reject(new Error('This YouTube video won’t play here.')),
          onStateChange: (e) => { this.state = e.data; if (e.data === 1) { clearTimeout(this.hint); this.box.classList.remove('tap'); this.onPlaying?.(); this.onPlaying = null; } },
        },
      });
    }));
  }
  ready() { return this.loaded; }
  get duration() { return this.player?.getDuration?.() || this.song.duration || 0; }
  set muted(v) { if (v) this.player?.mute(); else this.player?.unMute(); }
  async play(from) { await this.loaded; this.seek(from); return this.resume(); }
  pause() { this.player?.pauseVideo(); }
  resume() {
    this.player?.playVideo();
    return new Promise((resolve) => { if (this.state === 1) return resolve(); this.onPlaying = resolve; clearTimeout(this.hint); this.hint = setTimeout(() => this.box.classList.add('tap'), 1500); });
  }
  seek(t) { this.player?.seekTo(Math.max(0, t), true); this.last = null; }
  get paused() { return this.state !== 1; }
  now() {
    const a = this.player?.getCurrentTime?.() ?? 0, p = performance.now() / 1000;
    if (this.state !== 1) { this.last = null; return a; }
    if (!this.last || a !== this.last.a) this.last = { a, p };
    return this.last.a + Math.min(1, p - this.last.p);
  }
  get live() { return !this.stopped; }
  stop() { this.stopped = true; clearTimeout(this.hint); this.player?.destroy?.(); this.box.remove(); }
}

/** A YouTube song behind the audio element interface the song page uses. */
export class YouTubeAudio extends EventTarget {
  constructor(song) {
    super();
    this.clock = new YouTubeClock(song);
    this.clock.ready().then(() => { this.duration = this.clock.duration; this.dispatchEvent(new Event('loadedmetadata')); }, () => this.dispatchEvent(new Event('error')));
    this.tick = setInterval(() => { if (!this.clock.paused) this.dispatchEvent(new Event('timeupdate')); }, 250);
  }
  get paused() { return this.clock.paused && !this.starting; }
  get currentTime() { return this.clock.now(); }
  set currentTime(t) { this.clock.seek(t); }
  play() { this.starting = true; this.dispatchEvent(new Event('play')); return this.clock.resume().finally(() => { this.starting = false; }); }
  pause() { this.starting = false; this.clock.pause(); this.dispatchEvent(new Event('pause')); }
  stop() { clearInterval(this.tick); this.clock.stop(); }
}

export const makeClock = (song, file = null) => (song.youtube && !file ? new YouTubeClock(song) : new SongClock(song, file));

/** One clip preview at a time, looping the selected range like the picker on iPhone. */
export const preview = new (class {
  constructor() { this.clock = null; this.listeners = new Set(); this.state = { playing: false, loading: false, position: 0, key: null }; }
  emit(patch) { this.state = { ...this.state, ...patch }; this.listeners.forEach((l) => l(this.state)); }
  subscribe(l) { this.listeners.add(l); return () => this.listeners.delete(l); }
  async play(song, start, length, file = null, key = song.url || song.title) {
    this.stop();
    const clock = makeClock(song, file); this.clock = clock;
    this.emit({ loading: true, playing: false, key, position: start });
    try { await clock.ready(); if (this.clock !== clock) return; await clock.play(start); } catch { if (this.clock === clock) this.emit({ loading: false, playing: false }); return; }
    this.emit({ loading: false, playing: true });
    const tick = () => {
      if (this.clock !== clock) return;
      const t = clock.now();
      if (t >= start + length) clock.seek(start);
      this.emit({ position: clock.now() });
      this.raf = requestAnimationFrame(tick);
    };
    tick();
  }
  pause() { this.clock?.pause(); cancelAnimationFrame(this.raf); this.emit({ playing: false }); }
  stop() { cancelAnimationFrame(this.raf); this.clock?.stop(); this.clock = null; this.emit({ playing: false, loading: false }); }
})();

const LICENSES = { by: 'CC BY', 'by-sa': 'CC BY-SA', cc0: 'CC0', pdm: 'Public domain' };
const PLAYABLE = new Set(['jamendo', 'ccmixter', 'wikimedia_audio']);
/** Creative Commons music everyone may dance to and share, through Openverse: Jamendo, ccMixter and Wikimedia. */
export const searchSongs = async (q) => {
  const url = new URL('https://api.openverse.org/v1/audio/');
  url.search = new URLSearchParams({ q, license_type: 'commercial,modification', category: 'music', page_size: '20' });
  const r = await fetch(url);
  if (!r.ok) throw new Error(r.status === 429 ? 'Too many searches. Try again in a minute.' : 'Search isn’t working right now.');
  const { results } = await r.json();
  return results.filter((x) => PLAYABLE.has(x.source) && x.url && (x.duration ?? 0) >= 30000).map((x) => cleanSong({
    id: `openverse:${x.id}`, title: x.title, artist: x.creator, url: x.url, artwork: x.thumbnail, page: x.foreign_landing_url, source: x.source,
    duration: x.duration / 1000, license: `${LICENSES[x.license] ?? x.license.toUpperCase()} ${x.license_version ?? ''}`.trim(), licenseUrl: x.license_url,
  })).filter(Boolean);
};

const youtubeSong = ({ id, title, artist, artwork, duration }) => cleanSong({ id: `youtube:${id}`, title, artist, artwork, duration, url: `https://www.youtube.com/watch?v=${id}`, page: `https://www.youtube.com/watch?v=${id}`, source: 'youtube', youtube: id });
export const youtubeId = (text) => text.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([\w-]{11})/)?.[1] ?? null;
export const youtubeLink = async (id) => {
  const r = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}`);
  if (!r.ok) throw new Error('That YouTube video can’t be found, or its owner doesn’t allow it on other sites.');
  const o = await r.json();
  return youtubeSong({ id, title: o.title, artist: o.author_name, artwork: o.thumbnail_url });
};
const found = new Map();
export const suggestYouTube = (q) => new Promise((resolve) => {
  const name = `ytSuggest${Math.random().toString(36).slice(2)}`, script = document.createElement('script');
  const done = (list) => { clearTimeout(timer); delete window[name]; script.remove(); resolve(list); };
  const timer = setTimeout(() => done([]), 4000);
  window[name] = (d) => done((d?.[1] ?? []).map((x) => (Array.isArray(x) ? x[0] : x)).filter((x) => typeof x === 'string').slice(0, 8));
  script.onerror = () => done([]);
  script.src = `https://suggestqueries-clients6.youtube.com/complete/search?client=youtube&ds=yt&q=${encodeURIComponent(q)}&callback=${name}`;
  document.head.append(script);
});
export const searchYouTube = async (q) => {
  if (found.has(q)) return found.get(q);
  const r = await fetch(`${HOST}/api/youtube/search?q=${encodeURIComponent(q)}`).catch(() => null);
  if (!r?.ok) throw new Error('YouTube search isn’t working right now. Paste a YouTube link instead.');
  const { items = [] } = await r.json();
  const songs = items.map((x) => youtubeSong({ id: x.id, title: x.title, artist: x.channel, artwork: x.thumbnail, duration: x.duration })).filter((s) => s?.youtube);
  found.set(q, songs);
  return songs;
};

const APPLE = 'https://itunes.apple.com';
const appleSong = (r) => cleanSong({
  id: `apple:${r.trackId}`, apple: r.trackId, title: r.trackName, artist: r.artistName, url: r.previewUrl, artwork: r.artworkUrl100?.replace('100x100bb', '300x300bb'),
  page: r.trackViewUrl, license: 'Apple Music', licenseUrl: r.trackViewUrl, source: 'apple', year: Number(r.releaseDate?.slice(0, 4)) || 0,
});
const applePreview = async (id) => (await (await fetch(`${APPLE}/lookup?id=${id}`)).json()).results?.[0]?.previewUrl ?? null;
/** Apple's catalog: a 30-second preview of almost any song, played by Copycat's own audio element. */
export const searchApple = async (q) => {
  if (found.has(`apple:${q}`)) return found.get(`apple:${q}`);
  const r = await fetch(`${APPLE}/search?${new URLSearchParams({ term: q, media: 'music', entity: 'song', limit: '25' })}`).catch(() => null);
  if (!r?.ok) throw new Error(r?.status === 403 || r?.status === 429 ? 'Searching too fast. Try again in a moment.' : 'Search isn’t working right now.');
  const { results = [] } = await r.json();
  const songs = results.filter((x) => x.previewUrl).map(appleSong).filter(Boolean);
  found.set(`apple:${q}`, songs);
  return songs;
};

let top = null;
/** Today's top songs on iTunes, with their previews: what the picker offers before anything is typed. */
export const topSongs = () => (top ??= (async () => {
  const chart = await (await fetch(`${APPLE}/us/rss/topsongs/limit=25/json`)).json();
  const ids = (chart.feed?.entry ?? []).map((e) => e.id?.attributes?.['im:id']).filter((id) => /^\d+$/.test(id ?? ''));
  if (!ids.length) return [];
  const { results = [] } = await (await fetch(`${APPLE}/lookup?id=${ids.join(',')}&entity=song`)).json();
  return results.filter((x) => x.kind === 'song' && x.previewUrl).map(appleSong).filter(Boolean);
})().catch(() => { top = null; return []; }));

export const importedSong = (file) => new Promise((resolve, reject) => {
  const a = new Audio(URL.createObjectURL(file));
  a.addEventListener('loadedmetadata', () => { URL.revokeObjectURL(a.src); resolve({ song: { id: `file:${file.name}:${file.size}`, title: file.name.replace(/\.[^.]+$/, '').slice(0, 120), artist: '', source: 'file', duration: a.duration || 0 }, file }); }, { once: true });
  a.addEventListener('error', () => reject(new Error('That file isn’t audio Copycat can play.')), { once: true });
});

/** The trimmed clip of a song from the dancer's device, as mono 24 kHz WAV, so it posts with the dance and everyone hears it. */
export const clipAudio = async (file, start, length, rate = 24000) => {
  const ctx = new OfflineAudioContext(1, Math.ceil(length * rate), rate);
  const source = ctx.createBufferSource();
  source.buffer = await ctx.decodeAudioData(await file.arrayBuffer());
  source.connect(ctx.destination);
  source.start(0, start, length);
  return wav((await ctx.startRendering()).getChannelData(0), rate);
};
