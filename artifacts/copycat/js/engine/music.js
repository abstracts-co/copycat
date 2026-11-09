import { cleanSong } from '../data/format.js';

/** The song is the clock: dance time comes from the audio position, smoothed between coarse currentTime updates. */
export class SongClock {
  constructor(song, file = null) {
    this.song = song;
    this.audio = new Audio();
    this.audio.preload = 'auto';
    this.audio.src = file ? URL.createObjectURL(file) : song.url;
    this.anchor = null;
  }
  ready() {
    if (this.audio.readyState >= 3) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const done = () => { clean(); resolve(); }, fail = () => { clean(); reject(new Error('This song won’t play right now.')); };
      const clean = () => { this.audio.removeEventListener('canplay', done); this.audio.removeEventListener('error', fail); };
      this.audio.addEventListener('canplay', done); this.audio.addEventListener('error', fail);
      this.audio.load();
    });
  }
  get duration() { return this.audio.duration || this.song.duration || 0; }
  set muted(v) { this.audio.muted = v; }
  async play(from) { this.audio.currentTime = Math.max(0, from); this.anchor = null; await this.audio.play(); }
  pause() { this.audio.pause(); }
  resume() { this.anchor = null; return this.audio.play(); }
  seek(t) { this.audio.currentTime = Math.max(0, t); this.anchor = null; }
  get paused() { return this.audio.paused; }
  now() {
    const a = this.audio.currentTime, p = performance.now() / 1000;
    if (this.audio.paused) return a;
    if (!this.anchor || Math.abs(this.anchor.a + (p - this.anchor.p) - a) > 0.08) this.anchor = { a, p };
    return Math.max(a - 0.05, Math.min(a + 0.3, this.anchor.a + (p - this.anchor.p)));
  }
  stop() { this.audio.pause(); if (this.audio.src.startsWith('blob:')) URL.revokeObjectURL(this.audio.src); this.audio.removeAttribute('src'); }
}

/** One clip preview at a time, looping the selected range like the picker on iPhone. */
export const preview = new (class {
  constructor() { this.clock = null; this.listeners = new Set(); this.state = { playing: false, loading: false, position: 0, key: null }; }
  emit(patch) { this.state = { ...this.state, ...patch }; this.listeners.forEach((l) => l(this.state)); }
  subscribe(l) { this.listeners.add(l); return () => this.listeners.delete(l); }
  async play(song, start, length, file = null, key = song.url || song.title) {
    this.stop();
    const clock = new SongClock(song, file); this.clock = clock;
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

export const importedSong = (file) => new Promise((resolve, reject) => {
  const a = new Audio(URL.createObjectURL(file));
  a.addEventListener('loadedmetadata', () => { URL.revokeObjectURL(a.src); resolve({ song: { id: `file:${file.name}:${file.size}`, title: file.name.replace(/\.[^.]+$/, '').slice(0, 120), artist: '', source: 'file', duration: a.duration || 0 }, file }); }, { once: true });
  a.addEventListener('error', () => reject(new Error('That file isn’t audio Copycat can play.')), { once: true });
});
