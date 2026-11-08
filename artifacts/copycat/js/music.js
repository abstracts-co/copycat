import { cleanTrack } from './dance.js';

/** One clock for the song: an <audio> element for real music, a synthesized beat when there's none. */
export class SongClock {
  constructor(track, file = null) {
    this.track = track;
    if (track.source === 'beat') { this.bpm = track.bpm || 110; return; }
    this.audio = new Audio();
    this.audio.preload = 'auto';
    this.audio.src = file ? URL.createObjectURL(file) : track.url;
    this.anchor = null;
  }
  async ready() {
    if (!this.audio) return;
    if (this.audio.readyState >= 3) return;
    await new Promise((resolve, reject) => {
      const done = () => { clean(); resolve(); }, fail = () => { clean(); reject(new Error('This song won’t play right now.')); };
      const clean = () => { this.audio.removeEventListener('canplay', done); this.audio.removeEventListener('error', fail); };
      this.audio.addEventListener('canplay', done); this.audio.addEventListener('error', fail);
      this.audio.load();
    });
  }
  get duration() { return this.audio ? this.audio.duration || this.track.duration : Infinity; }
  async play(from) {
    if (!this.audio) {
      this.ctx ??= new AudioContext();
      await this.ctx.resume();
      this.origin = this.ctx.currentTime - from; this.from = from; this.playing = true;
      this.nextBeat = Math.ceil(from * this.bpm / 60);
      this.timer = setInterval(() => this.schedule(), 50); this.schedule();
      return;
    }
    this.audio.currentTime = Math.max(0, from);
    await this.audio.play();
    this.anchor = null; this.playing = true;
  }
  schedule() {
    const beat = 60 / this.bpm, ahead = this.ctx.currentTime + 0.2;
    while (this.origin + this.nextBeat * beat < ahead) {
      const at = this.origin + this.nextBeat * beat, accent = this.nextBeat % 4 === 0;
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.frequency.setValueAtTime(accent ? 150 : 110, at); o.frequency.exponentialRampToValueAtTime(40, at + 0.12);
      g.gain.setValueAtTime(accent ? 0.9 : 0.6, at); g.gain.exponentialRampToValueAtTime(0.001, at + 0.18);
      o.connect(g).connect(this.ctx.destination); o.start(at); o.stop(at + 0.2);
      this.nextBeat += 1;
    }
  }
  /** Song time in seconds, smoothed between the coarse updates some browsers give `currentTime`. */
  now() {
    if (!this.audio) return this.playing ? this.ctx.currentTime - this.origin : this.from ?? 0;
    const a = this.audio.currentTime, p = performance.now() / 1000;
    if (this.audio.paused) return a;
    if (!this.anchor || Math.abs(this.anchor.a + (p - this.anchor.p) * this.audio.playbackRate - a) > 0.08) this.anchor = { a, p };
    const guess = this.anchor.a + (p - this.anchor.p) * this.audio.playbackRate;
    return Math.max(a - 0.05, Math.min(a + 0.3, guess));
  }
  stop() {
    this.playing = false;
    if (this.audio) { this.audio.pause(); if (this.audio.src.startsWith('blob:')) URL.revokeObjectURL(this.audio.src); }
    if (this.timer) clearInterval(this.timer);
    this.ctx?.close().catch(() => {});
    this.ctx = null;
  }
}

const LICENSES = { by: 'CC BY', 'by-sa': 'CC BY-SA', cc0: 'CC0', pdm: 'Public domain' };
const PLAYABLE = new Set(['jamendo', 'ccmixter', 'wikimedia_audio']);

/** Creative Commons music anyone may dance to and share, from Openverse (Jamendo, ccMixter, Wikimedia). */
export const searchOpenverse = async (q) => {
  const url = new URL('https://api.openverse.org/v1/audio/');
  url.search = new URLSearchParams({ q, license_type: 'commercial,modification', category: 'music', page_size: '20' });
  const r = await fetch(url);
  if (!r.ok) throw new Error(r.status === 429 ? 'Too many searches. Try again in a minute.' : 'Search isn’t working right now.');
  const { results } = await r.json();
  return results
    .filter((x) => PLAYABLE.has(x.source) && x.url && (x.duration ?? 0) >= 45000)
    .map((x) => cleanTrack({
      title: x.title, artist: x.creator, url: x.url, page: x.foreign_landing_url, source: x.source, duration: x.duration / 1000,
      license: `${LICENSES[x.license] ?? x.license.toUpperCase()} ${x.license_version ?? ''}`.trim(), licenseUrl: x.license_url,
    }))
    .filter(Boolean);
};

export const parsePack = (raw, fallbackBy = '') => {
  if (!raw || raw.format !== 'copycat/music@1' || !Array.isArray(raw.tracks)) return null;
  const tracks = raw.tracks.slice(0, 200).map(cleanTrack).filter((t) => t && t.url);
  return tracks.length ? { title: String(raw.title ?? 'Music').slice(0, 60), by: String(raw.by ?? fallbackBy).slice(0, 60), tracks } : null;
};

export const credit = (t) => [t.title, t.artist].filter(Boolean).join(' · ');
export const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
