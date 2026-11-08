import { J, RATE, sample, serializeDance, FORMAT } from './dance.js';
import { Scorer, Reel, letter } from './score.js';
import { GHOSTS, PLAYER, Anchor, Trails, place, placeFit, fitDance, drawPose, drawProgress, viewport } from './ghost.js';
import { loadTracker, openCamera } from './pose.js';
import { SongClock, searchOpenverse, credit, fmt } from './music.js';
import { HOME, sandboxed, prefs, starterIndex, starterMusic, loadDance, community, mine, saveMine, forgetMine, playUrl, remember } from './library.js';
import { zip } from './zip.js';

if (!document.querySelector('link[data-copycat]')) {
  const link = Object.assign(document.createElement('link'), { rel: 'stylesheet', href: new URL('../styles.css', import.meta.url).href });
  link.dataset.copycat = '';
  document.head.append(link);
}

const h = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v === false || v == null) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  return el;
};
const external = (href, label, cls = 'btn') => h('a', { class: cls, href, target: '_blank', rel: 'noopener' }, label);
const icon = (svg) => { const s = h('span', { class: 'icon' }); s.innerHTML = svg; return s; };

const app = document.getElementById('app') ?? document.body.appendChild(h('div', { id: 'app' }));
const embedRef = (() => { const m = document.querySelector('meta[name="copycat-dance"]'); return m ? `u:${new URL(m.content, location.href).href}` : null; })();
const state = { starter: [], pack: null, community: { dances: [], packs: [], ghosts: [] }, loaded: false, ghost: prefs.get('ghost', 'cat'), make: prefs.get('make', { mode: 'upper', length: 30, title: '' }), makeTrack: null, makeFile: null, picking: false, searched: null };
let stopCurrent = () => {};

if (parent !== window) {
  const post = () => parent.postMessage({ abstractsHeight: Math.ceil(document.body.getBoundingClientRect().height) }, '*');
  addEventListener('load', post);
  new ResizeObserver(post).observe(document.body);
}

const ghostStyle = () => GHOSTS[state.ghost] ?? state.community.ghosts.find((g) => g.id === state.ghost) ?? GHOSTS.cat;

// ---------- canvases ----------
const fit = (canvas) => {
  const r = canvas.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
  const w = Math.max(1, Math.round(r.width * dpr)), hh = Math.max(1, Math.round(r.height * dpr));
  if (canvas.width !== w || canvas.height !== hh) { canvas.width = w; canvas.height = hh; }
  return { w, h: hh, dpr };
};
const backdrop = (ctx, w, hh) => {
  const g = ctx.createLinearGradient(0, 0, 0, hh);
  g.addColorStop(0, '#0b0d12'); g.addColorStop(1, '#151a24');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, hh);
  ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.lineWidth = 1;
  for (let i = 1; i < 8; i++) { const y = hh * (0.62 + i * i * 0.006); ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
};
const drawStill = (canvas, dance, at = 0.4) => {
  const { w, h: hh } = fit(canvas), ctx = canvas.getContext('2d');
  backdrop(ctx, w, hh);
  const pose = sample(dance.frames, dance.length * at);
  if (pose) drawPose(ctx, placeFit(pose, dance.aspect, fitDance(dance, w / hh), w / hh), viewport(w, hh, w / hh), ghostStyle());
};

// ---------- data ----------
const loadAll = async () => {
  const [starter, pack] = await Promise.all([starterIndex().catch(() => []), starterMusic().catch(() => null)]);
  state.starter = starter; state.pack = pack;
  render();
  state.community = await community();
  state.loaded = true;
  render();
};

// ---------- router ----------
const route = () => {
  const m = location.hash.match(/^#(\w+)(?:=(.*))?$/);
  return m ? { name: m[1], arg: m[2] ? decodeURIComponent(m[2]) : '' } : { name: embedRef ? 'dance' : 'dances', arg: embedRef ?? '' };
};
const go = (hash) => { if (location.hash === hash) render(); else location.hash = hash; };
addEventListener('hashchange', () => render());

const nav = (active) => embedRef ? null : h('header', { class: 'top' },
  h('a', { class: 'brand', href: '#dances' }, h('img', { src: new URL('../icon.png', import.meta.url).href, alt: '' }), h('span', { text: 'Copycat' })),
  h('nav', { class: 'tabs' }, ...[['dances', 'Dances'], ['music', 'Music'], ['make', 'Make']].map(([k, label]) => h('a', { href: `#${k}`, class: active === k ? 'on' : '', 'aria-current': active === k ? 'page' : false }, label))));

const render = () => {
  stopCurrent(); stopCurrent = () => {};
  const r = route();
  app.replaceChildren();
  const view = { dances, dance: dancePage, play: dancePage, music, make }[r.name] ?? dances;
  const tab = r.name === 'dance' || r.name === 'play' ? 'dances' : r.name;
  app.append(...[nav(tab), view(r.arg)].filter(Boolean));
};

// ---------- dances ----------
const card = (d) => {
  const canvas = h('canvas', { class: 'thumb', 'aria-hidden': 'true' });
  const el = h('a', { class: 'card', href: `#dance=${encodeURIComponent(d.ref)}` }, canvas,
    h('div', { class: 'card-body' }, h('strong', { text: d.title }), h('span', { class: 'muted', text: [d.song, d.artist].filter(Boolean).join(' · ') }),
      h('span', { class: 'meta' }, h('span', { class: 'chip', text: d.mode === 'full' ? 'Full body' : 'Upper body' }), h('span', { class: 'muted', text: fmt(d.length) }), d.by ? h('span', { class: 'muted', text: d.by }) : null)));
  loadDance(d.ref).then((dance) => requestAnimationFrame(() => drawStill(canvas, dance))).catch(() => {});
  return el;
};
const grid = (list) => h('div', { class: 'grid' }, list.map(card));

const dances = () => {
  const own = sandboxed ? [] : mine().map((d) => ({ ref: `m:${d.id}`, id: d.id, title: d.title, mode: d.mode, song: d.song?.title ?? 'Beat', artist: d.song?.artist ?? '', length: Math.round(d.frames.length / RATE), by: 'You' }));
  return h('main', { class: 'view' },
    own.length ? h('section', {}, h('h2', { text: 'Yours' }), grid(own)) : null,
    state.community.dances.length ? h('section', {}, h('h2', { text: 'From a/copycat' }), grid(state.community.dances)) : null,
    h('section', {}, h('h2', { text: 'Starter dances' }), state.starter.length ? grid(state.starter) : h('p', { class: 'muted', text: 'Loading…' })),
    h('section', { class: 'cta' }, h('a', { class: 'btn', href: '#make' }, 'Make a dance'), external(`${HOME}/wall`, 'Post on a/copycat ↗', 'btn ghost')));
};

// ---------- one dance ----------
const credits = (song) => song.source === 'beat' ? h('p', { class: 'muted', text: `Beat · ${song.bpm} BPM` })
  : h('p', { class: 'credit' }, '♪ ', song.page ? external(song.page, credit(song), 'link') : credit(song), song.license ? [' · ', song.licenseUrl ? external(song.licenseUrl, song.license, 'link') : song.license] : null,
    song.source === 'file' ? h('span', { class: 'muted', text: ' · your own copy of this song' }) : null);

const ghostPicker = (onPick) => h('div', { class: 'chips', role: 'radiogroup', 'aria-label': 'Ghost' },
  [...Object.entries(GHOSTS), ...state.community.ghosts.map((g) => [g.id, g])].map(([id, g]) =>
    h('button', { class: `chip pick${state.ghost === id ? ' on' : ''}`, role: 'radio', 'aria-checked': String(state.ghost === id), style: `--c:${g.color}`, onclick: () => { state.ghost = id; prefs.set('ghost', id); onPick(); } }, h('i'), g.name)));

const dancePage = (ref) => {
  const wrap = h('main', { class: 'view' }, h('p', { class: 'muted', text: 'Loading…' }));
  loadDance(ref).then((dance) => {
    const canvas = h('canvas', { class: 'stage-preview', 'aria-label': `${dance.title}, the ghost dancing` });
    const watchBtn = h('button', { class: 'btn ghost', onclick: () => watch.toggle() }, 'Watch');
    const watch = new Watch(canvas, dance, (playing) => { watchBtn.textContent = playing ? 'Stop' : 'Watch'; });
    stopCurrent = () => watch.stop();
    const isMine = ref.startsWith('m:');
    const play = sandboxed ? external(playUrl(ref.startsWith('m:') ? ref : ref), 'Play ↗', 'btn primary') : h('button', { class: 'btn primary', onclick: () => { watch.stop(); startSession('play', dance, ref); } }, 'Play');
    const stageWrap = h('div', { class: 'stage-wrap' }, canvas, h('button', { class: 'stage-play', 'aria-label': 'Watch', onclick: () => watch.toggle() }, icon('<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>')));
    watch.onState = (playing) => { watchBtn.textContent = playing ? 'Stop' : 'Watch'; stageWrap.classList.toggle('playing', playing); };
    wrap.replaceChildren(...[
      embedRef ? null : h('a', { class: 'back', href: '#dances' }, '‹ Dances'),
      stageWrap,
      h('div', { class: 'title-row' }, h('div', {}, h('h1', { text: dance.title }), h('p', { class: 'muted', text: [dance.by && `by ${dance.by}`, dance.mode === 'full' ? 'Full body' : 'Upper body', fmt(dance.length)].filter(Boolean).join(' · ') })),
        h('div', { class: 'actions' }, watchBtn, play)),
      credits(dance.song),
      h('section', {}, h('h2', { text: 'Ghost' }), ghostPicker(() => { render(); })),
      isMine ? h('section', { class: 'cta' },
        h('button', { class: 'btn', onclick: () => downloadDance(dance) }, 'Download to post'), external(`${HOME}/wall`, 'Post on a/copycat ↗', 'btn ghost'),
        h('button', { class: 'btn ghost', onclick: () => { forgetMine(dance.id); go('#dances'); } }, 'Delete')) : null,
      embedRef ? h('section', { class: 'cta' }, external(HOME, 'More dances on a/copycat ↗', 'btn ghost')) : null,
    ].filter(Boolean));
    requestAnimationFrame(() => watch.still());
  }).catch((e) => wrap.replaceChildren(h('p', { class: 'muted', text: e.message || 'This dance won’t load.' }), h('a', { class: 'btn', href: '#dances' }, 'Dances')));
  return wrap;
};

/** The ghost dancing to the song in place, no camera: the part of Copycat that runs inside Abstracts. */
class Watch {
  constructor(canvas, dance, onState) { this.canvas = canvas; this.dance = dance; this.onState = onState; this.trails = new Trails(); this.tmp = new Float32Array(45); this.placed = new Float32Array(45); }
  still() { drawStill(this.canvas, this.dance, 0.3); }
  async toggle() { if (this.clock) this.stop(); else await this.start(); }
  async start() {
    const d = this.dance;
    const song = d.song.source === 'file' ? { source: 'beat', bpm: d.bpm || 110 } : d.song;
    this.clock = new SongClock(song);
    this.onState(true);
    try { await this.clock.ready(); await this.clock.play(d.start); } catch { this.clock?.stop(); this.clock = new SongClock({ source: 'beat', bpm: d.bpm || 110 }); await this.clock.play(d.start); }
    const loop = () => {
      if (!this.clock) return;
      const t = this.clock.now() - d.start;
      if (t > d.length + 0.3) { this.stop(); return; }
      const { w, h: hh } = fit(this.canvas), ctx = this.canvas.getContext('2d'), v = viewport(w, hh, w / hh);
      backdrop(ctx, w, hh);
      const pose = sample(d.frames, Math.max(0, t), this.tmp);
      if (pose) {
        this.fit ??= fitDance(d, w / hh);
        const p = placeFit(pose, d.aspect, this.fit, w / hh, this.placed);
        this.trails.push(t, p, v); this.trails.draw(ctx, ghostStyle().trail, Math.max(3, w / 120));
        drawPose(ctx, p, v, ghostStyle());
      }
      drawProgress(ctx, w, hh, t / d.length, ghostStyle().color);
      this.raf = requestAnimationFrame(loop);
    };
    loop();
  }
  stop() { cancelAnimationFrame(this.raf); this.clock?.stop(); this.clock = null; this.trails.clear(); this.onState(false); if (this.canvas.isConnected) this.still(); }
}

// ---------- camera sessions: play and record ----------
const pickSongFile = (track) => new Promise((resolve) => {
  const input = h('input', { type: 'file', accept: 'audio/*', hidden: true });
  input.addEventListener('change', () => resolve(input.files[0] ?? null), { once: true });
  document.body.append(input); input.click(); setTimeout(() => input.remove(), 60000);
  void track;
});

const startSession = async (mode, dance, ref, opts = {}) => {
  let file = opts.file ?? null;
  if (dance.song.source === 'file' && !file) {
    alertBox(`This dance uses “${credit(dance.song)}” from the dancer’s own device. Pick your copy of the song.`, 'Pick song', async () => { file = await pickSongFile(dance.song); if (file) startSession(mode, dance, ref, { ...opts, file }); });
    return;
  }
  new Session(mode, dance, ref, { ...opts, file }).open();
};

const alertBox = (text, action, onAction) => {
  const box = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true' }, h('div', { class: 'modal-card' }, h('p', { text }),
    h('div', { class: 'actions' }, h('button', { class: 'btn ghost', onclick: () => box.remove() }, 'Cancel'), h('button', { class: 'btn primary', onclick: () => { box.remove(); onAction(); } }, action))));
  document.body.append(box);
};

const REQUIRED = { upper: [J.leftShoulder, J.rightShoulder, J.leftWrist, J.rightWrist, J.nose], full: [J.leftShoulder, J.rightShoulder, J.leftHip, J.rightHip, J.leftAnkle, J.rightAnkle, J.leftWrist, J.rightWrist] };

class Session {
  constructor(mode, dance, ref, opts) {
    this.mode = mode; this.dance = dance; this.ref = ref; this.opts = opts;
    this.anchor = new Anchor(); this.trails = new Trails(); this.ghostTrails = new Trails();
    this.tmp = new Float32Array(45); this.placed = new Float32Array(45);
    this.phase = 'loading'; this.framedSince = 0; this.feedback = null;
  }
  open() {
    const s = this;
    this.canvas = h('canvas', { class: 'stage-canvas' });
    this.msg = h('div', { class: 'stage-msg', 'aria-live': 'polite' });
    this.word = h('div', { class: 'stage-word' });
    this.scoreEl = h('div', { class: 'stage-score' }); this.comboEl = h('div', { class: 'stage-combo' });
    this.root = h('div', { class: `stage ${this.mode}`, role: 'dialog', 'aria-label': this.mode === 'play' ? `Playing ${this.dance.title}` : 'Recording' },
      this.canvas,
      h('div', { class: 'stage-top' }, h('span', { class: 'pill', text: this.dance.song.source === 'beat' ? `♪ Beat · ${this.dance.song.bpm} BPM` : `♪ ${credit(this.dance.song)}` }),
        h('button', { class: 'close', 'aria-label': 'Close', onclick: () => s.close() }, '✕')),
      this.msg, this.word, h('div', { class: 'stage-bottom' }, this.scoreEl, this.comboEl));
    document.body.append(this.root);
    document.documentElement.classList.add('locked');
    this.onKey = (e) => { if (e.key === 'Escape') s.close(); };
    addEventListener('keydown', this.onKey);
    this.say('Starting camera…');
    this.boot().catch((e) => this.fail(e));
  }
  say(text) { this.msg.textContent = text; this.msg.hidden = !text; }
  fail(e) {
    const denied = e?.name === 'NotAllowedError';
    this.say(denied ? 'Copycat needs your camera. Allow it in the address bar, then try again.' : e?.message || 'Something went wrong.');
    this.phase = 'error';
  }
  async boot() {
    const [cam, tracker] = await Promise.all([openCamera(), loadTracker(prefs.get('model', 'lite'))]);
    if (this.closed) { cam.stop(); return; }
    this.cam = cam; this.tracker = tracker;
    this.clock = new SongClock(this.dance.song, this.opts.file);
    await this.clock.ready();
    this.phase = 'framing';
    this.scorer = this.mode === 'play' ? new Scorer(this.dance, cam.aspect, (w) => this.onWindow(w)) : null;
    this.reel = new Reel();
    this.loop();
  }
  onWindow(w) {
    if (!w.grade) return;
    this.word.textContent = { perfect: 'Perfect', great: 'Great', good: 'Good' }[w.grade];
    this.word.className = `stage-word show ${w.grade}`;
    clearTimeout(this.wordTimer);
    this.wordTimer = setTimeout(() => { this.word.className = 'stage-word'; }, 650);
  }
  framed(pose) { return pose && REQUIRED[this.dance.mode].every((j) => pose[j * 3 + 2] >= 0.5); }
  async begin() {
    const beat = this.dance.bpm ? 60 / this.dance.bpm : 0.75;
    const lead = Math.min(this.dance.start, Math.max(3, beat * 4));
    this.lead = this.dance.song.source === 'beat' ? beat * 4 : lead;
    this.beat = beat;
    this.phase = 'countdown';
    if (this.lead < 2) {
      this.beat = 1; this.pre = performance.now() + 3000;
      this.preTimer = setTimeout(() => { this.clock.play(this.dance.start - this.lead).then(() => { this.pre = 0; }); }, 3000);
      return;
    }
    await this.clock.play(this.dance.start - this.lead);
  }
  loop() {
    if (this.closed) return;
    const { w, h: hh } = fit(this.canvas), ctx = this.canvas.getContext('2d');
    const cam = this.cam, v = viewport(w, hh, cam.aspect, true);
    ctx.save(); ctx.translate(w, 0); ctx.scale(-1, 1);
    ctx.drawImage(cam.video, w - v.ox - v.vw, v.oy, v.vw, v.vh);
    ctx.restore();
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(0, 0, w, hh);
    const pose = this.tracker.detect(cam.video);
    const anchor = this.anchor.update(pose, cam.aspect);
    const live = this.phase === 'countdown' || this.phase === 'dancing';
    const songT = !live ? null : this.pre ? this.dance.start - this.lead - Math.max(0, this.pre - performance.now()) / 1000 : this.clock.now();
    const t = songT === null ? null : songT - this.dance.start;

    if (this.phase === 'framing') {
      const ok = this.framed(pose);
      if (ok) { this.framedSince ||= performance.now(); if (performance.now() - this.framedSince > 900) { this.say(''); this.begin(); } else this.say('Hold still…'); }
      else { this.framedSince = 0; this.say(this.dance.mode === 'full' ? 'Step back until you fit head to feet' : 'Get your head, shoulders and hands in view'); }
    }
    if (this.phase === 'countdown' && t !== null) {
      if (t >= 0) { this.phase = 'dancing'; this.say(''); }
      else this.say(String(Math.min(4, Math.ceil(-t / this.beat))));
    }
    if (pose && t !== null && t >= -0.6) {
      if (this.mode === 'play') this.scorer.live.push(t, pose);
      else this.reel.push(t, pose);
    }
    if (this.mode === 'play') {
      const ref = sample(this.dance.frames, Math.max(0, Math.min(this.dance.length, t ?? 0)), this.tmp);
      if (ref) {
        const g = place(ref, this.dance.aspect, anchor, cam.aspect, this.placed), style = ghostStyle();
        if (t !== null) { this.ghostTrails.push(t, g, v); this.ghostTrails.draw(ctx, style.trail, Math.max(4, w / 90)); }
        drawPose(ctx, g, v, style);
      }
    }
    if (pose) {
      if (t !== null) { this.trails.push(t, pose, v); this.trails.draw(ctx, '#ffffff', Math.max(3, w / 120)); }
      drawPose(ctx, pose, v, { ...PLAYER, color: this.mode === 'record' ? '#ff5fd2' : '#ffffff' });
    }
    if (t !== null && t >= 0) {
      drawProgress(ctx, w, hh, t / this.dance.length, this.mode === 'record' ? '#ff5fd2' : ghostStyle().color);
      if (this.scorer) { this.scorer.advance(t); this.scoreEl.textContent = this.scorer.score; this.comboEl.textContent = this.scorer.combo > 1 ? `${this.scorer.combo} combo` : ''; }
      else this.scoreEl.textContent = `● ${fmt(Math.max(0, this.dance.length - t))}`;
      if (t >= this.dance.length) return this.finish();
    }
    this.raf = requestAnimationFrame(() => this.loop());
  }
  finish() {
    this.phase = 'done';
    this.clock.stop();
    if (this.mode === 'play') this.results(); else this.recorded();
  }
  results() {
    const s = this.scorer.advance(this.dance.length, true), score = s.final;
    const best = prefs.get(`best:${this.ref}`, 0);
    if (score > best) prefs.set(`best:${this.ref}`, score);
    this.root.append(h('div', { class: 'results' },
      h('div', { class: 'big' }, h('span', { text: score }), h('small', { text: '/ 100' })),
      h('div', { class: 'grade', text: letter(score) }),
      h('p', { class: 'muted', text: `${s.counts.perfect} Perfect · ${s.counts.great} Great · ${s.counts.good} Good · best combo ${s.best}` }),
      h('p', { class: 'muted', text: score > best && best ? `New best, up from ${best}` : best ? `Your best: ${best}` : '' }),
      h('div', { class: 'actions' }, h('button', { class: 'btn ghost', onclick: () => this.close() }, 'Done'), h('button', { class: 'btn ghost', onclick: () => share(this.dance, score) }, 'Share'),
        h('button', { class: 'btn primary', onclick: () => { this.close(); startSession('play', this.dance, this.ref, this.opts); } }, 'Play again'))));
  }
  recorded() {
    const frames = [];
    for (let i = 0; i < Math.round(this.dance.length * RATE); i++) frames.push(Float32Array.from(this.reel.at(i / RATE) ?? new Float32Array(45)));
    const seen = frames.filter((f) => f[J.leftShoulder * 3 + 2] > 0.35).length / Math.max(1, frames.length);
    const dance = { ...this.dance, frames, aspect: this.cam.aspect };
    this.close();
    if (seen < 0.6) { alertBox('Copycat lost track of you for too much of that. Try again with more light and your body in view.', 'Try again', () => startSession('record', this.dance, null, this.opts)); return; }
    state.review = { dance, file: this.opts.file };
    go('#make=review');
  }
  close() {
    this.closed = true;
    cancelAnimationFrame(this.raf); clearTimeout(this.wordTimer); clearTimeout(this.preTimer);
    this.clock?.stop(); this.cam?.stop();
    removeEventListener('keydown', this.onKey);
    document.documentElement.classList.remove('locked');
    this.root.remove();
  }
}

const share = async (dance, score) => {
  const text = `I scored ${score} on “${dance.title}” in Copycat. Copy the ghost: ${HOME}`;
  try { if (navigator.share) await navigator.share({ text }); else { await navigator.clipboard.writeText(text); toast('Copied'); } } catch {}
};
const toast = (text) => { const t = h('div', { class: 'toast', role: 'status', text }); document.body.append(t); setTimeout(() => t.remove(), 1800); };

// ---------- music ----------
let preview = null;
const stopPreview = () => { preview?.stop(); preview = null; document.querySelectorAll('.track.playing').forEach((e) => e.classList.remove('playing')); };
const trackRow = (t, file = null) => {
  const row = h('div', { class: 'track' },
    h('button', { class: 'round', 'aria-label': `Play ${t.title}`, onclick: async () => {
      const was = row.classList.contains('playing'); stopPreview(); if (was) return;
      preview = new SongClock(t, file); row.classList.add('playing');
      try { await preview.ready(); await preview.play(t.segment?.[0] ?? Math.min(30, (t.duration || 60) / 3)); } catch { stopPreview(); toast('This song won’t play right now.'); }
    } }, '▶'),
    h('div', { class: 'track-body' }, h('strong', { text: t.title }), h('span', { class: 'muted' }, [t.artist, t.duration ? fmt(t.duration) : null].filter(Boolean).join(' · '),
      t.license ? [' · ', t.licenseUrl ? external(t.licenseUrl, t.license, 'link') : t.license] : null)),
    h('button', { class: 'btn small', onclick: () => useTrack(t, file) }, 'Dance to this'));
  return row;
};
const useTrack = (t, file = null) => {
  stopPreview();
  if (sandboxed) { open(`${playUrlFor('make', JSON.stringify(t))}`, '_blank', 'noopener'); return; }
  state.makeTrack = t; state.makeFile = file; state.picking = false;
  go('#make');
};
const playUrlFor = (mode, arg) => playUrl(arg, mode);

const music = () => {
  stopCurrent = stopPreview;
  const results = h('div', { class: 'list' });
  const showSearch = (list) => results.replaceChildren(...(list.length ? list.map((t) => trackRow(t)) : [h('p', { class: 'muted', text: 'Nothing playable found.' })]));
  if (state.searched) showSearch(state.searched);
  const q = h('input', { type: 'search', placeholder: 'Search free music: funk, disco, k-pop…', 'aria-label': 'Search free music' });
  const form = h('form', { class: 'search', onsubmit: async (e) => {
    e.preventDefault(); if (!q.value.trim()) return;
    results.replaceChildren(h('p', { class: 'muted', text: 'Searching…' }));
    try { state.searched = await searchOpenverse(q.value.trim()); showSearch(state.searched); } catch (err) { results.replaceChildren(h('p', { class: 'muted', text: err.message })); }
  } }, q, h('button', { class: 'btn' }, 'Search'));
  const fileInput = h('input', { type: 'file', accept: 'audio/*', hidden: true, onchange: () => {
    const f = fileInput.files[0]; if (!f) return;
    const a = new Audio(URL.createObjectURL(f));
    a.addEventListener('loadedmetadata', () => { const t = { title: f.name.replace(/\.[^.]+$/, '').slice(0, 120), artist: '', source: 'file', duration: a.duration || 0 }; URL.revokeObjectURL(a.src); useTrack(t, f); }, { once: true });
  } });
  return h('main', { class: 'view' },
    h('section', {}, h('h2', { text: 'Find a song' }), form, results,
      h('p', { class: 'muted small', text: 'Creative Commons music from Openverse: Jamendo, ccMixter and Wikimedia. Credit shows with every dance.' })),
    sandboxed ? null : h('section', {}, h('h2', { text: 'From your device' }), h('div', { class: 'cta' }, h('button', { class: 'btn', onclick: () => fileInput.click() }, 'Choose a song file'), fileInput,
      h('button', { class: 'btn ghost', onclick: () => useTrack({ title: 'Beat', source: 'beat', bpm: 110, duration: 0 }) }, 'Just a beat')),
      h('p', { class: 'muted small', text: 'Your file stays on your device. People who play your dance pick their own copy.' })),
    ...state.community.packs.map((p) => h('section', {}, h('h2', {}, p.title, p.by ? h('span', { class: 'muted', text: ` · ${p.by}` }) : null), h('div', { class: 'list' }, p.tracks.map((t) => trackRow(t))))),
    state.pack ? h('section', {}, h('h2', { text: state.pack.title }), h('div', { class: 'list' }, state.pack.tracks.map((t) => trackRow(t)))) : null,
    h('section', { class: 'cta' }, external(`${HOME}/wall`, 'Share a music pack ↗', 'btn ghost')));
};

// ---------- make ----------
const slug = (s) => (s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'dance');

const make = (arg) => {
  if (arg === 'review' && state.review) return review();
  if (arg && arg !== 'review') { try { const t = JSON.parse(arg); if (t && (t.url || t.source === 'beat')) state.makeTrack = t; } catch {} try { history.replaceState(null, '', '#make'); } catch {} }
  if (sandboxed) return h('main', { class: 'view' }, h('section', { class: 'hero' }, h('h1', { text: 'Make a dance' }),
    h('p', { class: 'muted', text: 'Record yourself to any song. Copycat tracks your moves with your camera, on your device.' }),
    external(playUrlFor('make', state.makeTrack ? JSON.stringify(state.makeTrack) : ''), 'Open the camera ↗', 'btn primary')));
  const m = state.make, t = state.makeTrack ?? state.pack?.tracks[0] ?? null;
  if (!t) return h('main', { class: 'view' }, h('p', { class: 'muted', text: 'Loading…' }));
  state.makeTrack = t;
  const save = () => prefs.set('make', m);
  const maxStart = Math.max(0, (t.duration || 0) - m.length - 1);
  let start = Math.min(m.start ?? t.segment?.[0] ?? 0, maxStart);
  if (t.segment && m.track !== t.url) start = Math.min(t.segment[0], maxStart);
  const startLabel = h('span', { class: 'muted', text: fmt(start) });
  const title = h('input', { type: 'text', maxlength: '60', value: m.title, placeholder: 'Name your dance', 'aria-label': 'Dance name', oninput: () => { m.title = title.value; save(); } });
  const by = h('input', { type: 'text', maxlength: '40', value: prefs.get('name', ''), placeholder: 'Your name (optional)', 'aria-label': 'Your name', oninput: () => prefs.set('name', by.value) });
  const seg = (k, options) => h('div', { class: 'chips' }, options.map(([v, label]) => h('button', { class: `chip pick${m[k] === v ? ' on' : ''}`, onclick: () => { m[k] = v; save(); render(); } }, label)));
  return h('main', { class: 'view' },
    h('section', {}, h('h2', { text: 'Song' }), h('div', { class: 'picked' }, h('div', {}, h('strong', { text: t.title }), h('span', { class: 'muted', text: t.source === 'beat' ? ` · ${t.bpm} BPM` : t.artist ? ` · ${t.artist}` : '' })), h('a', { class: 'btn small ghost', href: '#music' }, 'Change'))),
    h('section', {}, h('h2', { text: 'Dance' }), title, by),
    h('section', {}, h('h2', { text: 'Body' }), seg('mode', [['upper', 'Upper body'], ['full', 'Full body']])),
    h('section', {}, h('h2', { text: 'Length' }), seg('length', [[15, '15s'], [30, '30s'], [45, '45s'], [60, '60s']])),
    t.duration > m.length + 2 ? h('section', {}, h('h2', {}, 'Start at ', startLabel),
      h('input', { type: 'range', min: '0', max: String(Math.floor(maxStart)), step: '0.5', value: String(start), 'aria-label': 'Start time', oninput: (e) => { start = Number(e.target.value); startLabel.textContent = fmt(start); m.start = start; m.track = t.url; save(); } })) : null,
    h('section', { class: 'cta' }, h('button', { class: 'btn primary rec', onclick: () => {
      const id = `${slug(m.title || t.title)}-${Math.random().toString(36).slice(2, 6)}`;
      const dance = { format: FORMAT, id, title: (m.title || '').trim() || `${t.title} dance`, by: prefs.get('name', '').trim(), mode: m.mode, aspect: 4 / 3, start: t.source === 'beat' ? 0 : start, bpm: t.bpm || 0, song: t, frames: [], length: m.length, ghost: '' };
      startSession('record', dance, null, { file: state.makeFile });
    } }, '● Record')));
};

const review = () => {
  const { dance, file } = state.review;
  const canvas = h('canvas', { class: 'stage-preview' });
  const watchBtn = h('button', { class: 'btn ghost', onclick: () => w.toggle() }, 'Watch');
  const w = new Watch(canvas, dance, (p) => { watchBtn.textContent = p ? 'Stop' : 'Watch'; });
  stopCurrent = () => w.stop();
  requestAnimationFrame(() => w.still());
  return h('main', { class: 'view' },
    h('div', { class: 'stage-wrap' }, canvas),
    h('div', { class: 'title-row' }, h('div', {}, h('h1', { text: dance.title }), h('p', { class: 'muted', text: `${dance.mode === 'full' ? 'Full body' : 'Upper body'} · ${fmt(dance.length)}` })), h('div', { class: 'actions' }, watchBtn)),
    h('section', { class: 'cta' },
      h('button', { class: 'btn ghost', onclick: () => { state.review = null; startSession('record', { ...dance, frames: [] }, null, { file }); } }, 'Retake'),
      h('button', { class: 'btn primary', onclick: () => {
        const ok = saveMine(dance);
        remember(`m:${dance.id}`, { ...dance, length: dance.frames.length / RATE });
        state.review = null;
        if (!ok) toast('Your browser is out of room. Download it to keep it.');
        downloadDance(dance);
        go(`#dance=${encodeURIComponent(`m:${dance.id}`)}`);
      } }, 'Save')));
};

// ---------- posting ----------
const coverPng = (dance) => new Promise((resolve) => {
  const c = document.createElement('canvas'); c.width = 1200; c.height = 750;
  const ctx = c.getContext('2d');
  backdrop(ctx, 1200, 750);
  let best = 0, at = dance.length * 0.4;
  for (let t = 1; t < dance.length - 1; t += 0.25) {
    const p = sample(dance.frames, t); if (!p) continue;
    const spread = Math.abs(p[J.leftWrist * 3] - p[J.rightWrist * 3]) + Math.max(0, p[J.leftShoulder * 3 + 1] - Math.min(p[J.leftWrist * 3 + 1], p[J.rightWrist * 3 + 1]));
    if (p[J.leftWrist * 3 + 2] > 0.4 && p[J.rightWrist * 3 + 2] > 0.4 && spread > best) { best = spread; at = t; }
  }
  const pose = sample(dance.frames, at);
  const area = viewport(800, 640, 800 / 640, true);
  ctx.save(); ctx.translate(200, 40);
  if (pose) drawPose(ctx, placeFit(pose, dance.aspect, fitDance(dance, 800 / 640, 0.9), 800 / 640), area, { ...GHOSTS.cat, glow: 30 });
  ctx.restore();
  ctx.fillStyle = '#fff'; ctx.font = '700 54px system-ui, sans-serif'; ctx.textAlign = 'center';
  ctx.fillText(dance.title.slice(0, 32), 600, 680);
  ctx.fillStyle = '#8b98a5'; ctx.font = '400 28px system-ui, sans-serif';
  ctx.fillText(dance.song.source === 'beat' ? 'Copycat' : `♪ ${credit(dance.song)}`.slice(0, 60), 600, 722);
  c.toBlob((b) => b.arrayBuffer().then((x) => resolve(new Uint8Array(x))), 'image/png');
});

const escapeHtml = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
export const danceFiles = async (dance) => {
  const song = dance.song.source === 'beat' ? 'a beat' : `“${dance.song.title}”${dance.song.artist ? ` by ${dance.song.artist}` : ''}${dance.song.license ? ` (${dance.song.license})` : ''}`;
  const main = new URL('main.js', import.meta.url).href;
  return [
    { path: 'index.html', data: `<!doctype html>\n<html lang="en">\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1">\n<meta name="copycat-dance" content="dance.json">\n<title>${escapeHtml(dance.title)}</title>\n<body style="margin:0;background:#000">\n<div id="app"></div>\n<script type="module" src="${main}"></script>\n</body>\n</html>\n` },
    { path: 'dance.json', data: JSON.stringify(serializeDance(dance)) },
    { path: 'artifact.json', data: `${JSON.stringify({ title: dance.title, description: `A Copycat dance to ${song}`, kind: 'web', entry: 'index.html', category: 'dances' }, null, 2)}\n` },
    { path: 'content.md', data: `# ${dance.title}\n\nA Copycat dance${dance.by ? ` by ${dance.by}` : ''} to ${song}. ${dance.mode === 'full' ? 'Full body' : 'Upper body'}, ${fmt(dance.length)}.${dance.song.page ? `\n\nSong: ${dance.song.page}` : ''}\n\nCopy the ghost with your camera: ${HOME}\n` },
    { path: 'preview.png', data: await coverPng(dance) },
  ];
};
const downloadDance = async (dance) => {
  const blob = zip(await danceFiles(dance));
  const a = h('a', { href: URL.createObjectURL(blob), download: `${dance.id}.zip` });
  document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  toast('Downloaded. Post the zip with the Artifact cube on a/copycat.');
};

render();
loadAll();
