import { html, useStore, useEffect, useRef, useState, clock, reduceMotion } from '../lib.js';
import { Icon } from '../icons.js';
import { Button, ProgressView, Empty, sheet, menu, confirmDialog, alertDialog, toast } from '../ui.js';
import { store, nav, setPref, ensureViewer } from '../data/store.js';
import { parsePose, sample } from '../data/format.js';
import { loadTracker, openCamera, Tracker, STAGE, J, danceCrop, toDance } from '../engine/pose.js';
import { Stage, GhostAlign, applyTransform, drawPerimeter } from '../engine/stage.js';
import { DanceRecorder } from '../engine/recorder.js';
import { SongClock } from '../engine/music.js';
import { Scorer, grade } from '../engine/score.js';
import { MusicPicker } from './picker.js';
import { findDance } from './dance.js';
import { share, danceLink, guarded } from './actions.js';

/** Opens the selfie camera and the WebAssembly tracker, and runs one frame loop that a flow fills in. */
const useCameraStage = (host, onFrame, { audio = false } = {}) => {
  const [camera, setCamera] = useState({ state: 'opening' }), [attempt, setAttempt] = useState(0);
  const stageRef = useRef(null), live = useRef(null);
  useEffect(() => {
    let gone = false, raf = 0, cam = null;
    setCamera({ state: 'opening' });
    (async () => {
      try {
        const [c, landmarker] = await Promise.all([openCamera({ audio }), loadTracker()]);
        if (gone) { c.stop(); return; }
        cam = c; live.current = c;
        const stage = new Stage(host.current), tracker = new Tracker(landmarker);
        stageRef.current = { stage, tracker, cam };
        setCamera({ state: 'running' });
        const loop = () => {
          if (gone) return;
          const pose = tracker.frame(cam.video), st = stageRef.current, now = performance.now() / 1000;
          if (pose) { st.lastPose = pose; st.lastPoseAt = now; }
          const recent = st.lastPoseAt !== undefined && now - st.lastPoseAt < 0.3;
          onFrame.current?.({ stage, tracker, cam, pose: pose ?? (recent ? st.lastPose : null), fresh: !!pose, recent, now });
          raf = requestAnimationFrame(loop);
        };
        loop();
      } catch (e) {
        if (!gone) setCamera({ state: 'unavailable', denied: e?.name === 'NotAllowedError', reason: e?.name === 'NotAllowedError' ? 'Copycat needs your camera. Allow it in your browser’s address bar, then try again.' : e?.message || 'The camera isn’t available.' });
      }
    })();
    return () => { gone = true; cancelAnimationFrame(raf); cam?.stop(); stageRef.current?.stage.dispose(); stageRef.current = null; };
  }, [attempt]);
  return { camera, retry: () => setAttempt((n) => n + 1), ref: stageRef };
};

/**
 * CopycatPlaybackPosition, simplified: head and shoulders in view, and not so close that the arms can't fit. Distance is
 * the shoulder span in view-height units, so the limit follows the picture's shape: on a wide laptop camera the arms
 * have room at the sides long before the shoulders get small against its short height.
 */
const framing = (pose, mode, aspect) => {
  if (!pose) return { ready: false, message: null };
  const v = (j) => pose[j * 3 + 2] >= 0.35;
  if (!v(J.leftShoulder) || !v(J.rightShoulder) || !v(J.nose)) return { ready: false, message: 'Step back' };
  const span = Math.hypot((pose[J.leftShoulder * 3] - pose[J.rightShoulder * 3]) * aspect, pose[J.leftShoulder * 3 + 1] - pose[J.rightShoulder * 3 + 1]);
  const limit = Math.max(0.3, 0.45 * aspect) * (mode === 'full' ? 0.57 : 1);
  if (span > limit) return { ready: false, message: 'Step back' };
  if (span < 0.06) return { ready: false, message: 'Get closer' };
  if (mode === 'full' && !(v(J.leftAnkle) && v(J.rightAnkle))) return { ready: false, message: 'Step back' };
  return { ready: true, message: null };
};

const trailScale = (c) => Math.max(0.6, Math.min(c.w, c.h) / 720);

const FramingBubble = ({ message }) => html`<div class="framing" aria-live="polite"><span class="bubble glass">${message.toUpperCase()}</span></div>`;
const Countdown = ({ value }) => html`<div class="countdown glass" aria-live="assertive"><span key=${value}>${value}</span></div>`;

/** The camera chrome both flows share: CopycatGameplayView. */
const Chrome = ({ songTitle, songSubtitle, onSong, onClose, privacy, onPrivacy, lockSettings, children, bottom }) => html`
  <div class="gp-top">
    <div class="side" style="left:0"><${Button} size="large" icon="xmark" iconOnly label="Close" onClick=${onClose} /></div>
    <button class="song glass" onClick=${onSong} disabled=${!onSong} aria-label=${songTitle}><${Icon} name="music.note" /><span class="col" style="min-width:0"><span class="t line1">${songTitle}</span>${songSubtitle && html`<span class="s">${songSubtitle}</span>`}</span></button>
    <div class="side" style="right:0"><button class=${`glass size-large icon-only ${privacy ? 'tinted' : ''}`} aria-label="Privacy" aria-pressed=${privacy} disabled=${lockSettings} onClick=${() => onPrivacy(!privacy)}><${Icon} name=${privacy ? 'hand.raised.fill' : 'hand.raised'} /></button></div>
  </div>
  ${children}
  <div class="gp-bottom">${bottom}</div>`;

const TimerButton = ({ disabled }) => {
  const seconds = useStore(store, (s) => s.countdown);
  return html`<${Button} size="large" icon="timer" iconOnly label=${`Countdown ${seconds} seconds`} disabled=${disabled} onClick=${(e) => menu(e.currentTarget.getBoundingClientRect(), [3, 5, 10].map((n) => ({ label: `${n} seconds`, checked: seconds === n, onClick: () => setPref('countdown', n) })))} />`;
};
const RecordButton = ({ on, onClick, disabled, label }) => html`<button class=${`record ${on ? 'on' : ''}`} aria-label=${label} disabled=${disabled} onClick=${onClick}><i></i></button>`;

const BackgroundButton = ({ background, setBackground, disabled }) => {
  const input = useRef();
  const choose = () => input.current.click();
  const onFile = () => {
    const f = input.current.files[0]; if (!f) return;
    const img = new Image(); img.onload = () => setBackground({ image: img, placement: { scale: 1, x: 0, y: 0 } }); img.onerror = () => alertDialog({ title: 'Background photo', message: 'Could not use that photo. Choose another image.' });
    img.src = URL.createObjectURL(f); input.current.value = '';
  };
  return html`<input type="file" accept="image/*" hidden ref=${input} onChange=${onFile} />
    <${Button} size="large" icon=${background ? 'photo.fill' : 'photo'} iconOnly label="Background photo" disabled=${disabled}
      onClick=${() => (background ? confirmDialog({ title: 'Background', actions: [{ label: 'Change photo', onClick: choose }, { label: 'Fit background', onClick: () => setBackground({ ...background, placement: { scale: 1, x: 0, y: 0 } }) }, { label: 'Remove background', role: 'destructive', onClick: () => setBackground(null) }, { label: 'Cancel', role: 'cancel' }] }) : choose())} />`;
};

const sandboxed = (() => { try { return self.origin === 'null'; } catch { return true; } })();
const Unavailable = ({ camera, retry }) => (sandboxed
  ? html`<${Empty} icon="camera.fill" title="Camera unavailable" message="This page can’t use your camera. Open Copycat in its own tab to dance."><${Button} style="glassProminent" size="large" full label="Open Copycat" onClick=${() => window.open('https://abstracts-co.github.io/copycat/artifacts/copycat/', '_blank', 'noopener')} /></${Empty}>`
  : html`<${Empty} icon="camera.fill" title="Camera unavailable" message=${camera.reason}><${Button} size="large" full label="Try again" onClick=${retry} /></${Empty}>`);

const useGestures = (background, setBackground, enabled) => {
  const g = useRef({});
  if (!enabled || !background) return {};
  return {
    onPointerDown: (e) => { g.current.start = { x: e.clientX, y: e.clientY, p: { ...background.placement } }; e.currentTarget.setPointerCapture(e.pointerId); },
    onPointerMove: (e) => { const s = g.current.start; if (!s) return; const r = e.currentTarget.getBoundingClientRect(); setBackground({ ...background, placement: { ...s.p, x: s.p.x + (e.clientX - s.x) / r.width, y: s.p.y + (e.clientY - s.y) / r.height } }); },
    onPointerUp: () => { g.current.start = null; },
    onWheel: (e) => setBackground({ ...background, placement: { ...background.placement, scale: Math.min(3, Math.max(1, background.placement.scale * (e.deltaY < 0 ? 1.05 : 0.95))) } }),
  };
};

// ---------- Create ----------
export const RecordingFlow = ({ params }) => {
  const host = useRef(), frame = useRef(), countdownSeconds = useStore(store, (s) => s.countdown);
  const [choice, setChoice] = useState(params?.song ? { song: params.song, file: null, start: params.song.segment?.[0] ?? 0, length: Math.min(30, params.song.duration || 30) } : null);
  const [privacy, setPrivacy] = useState(false), [background, setBackground] = useState(null);
  const [phase, setPhase] = useState({ name: 'idle' }), [, tick] = useState(0);
  const s = useRef({});
  const { camera, retry, ref } = useCameraStage(host, frame);
  const pick = () => sheet(MusicPicker, { asSheet: true, onUse: (c) => setChoice(c) }, { tall: true });

  frame.current = ({ stage, tracker, cam, pose, fresh, recent, now }) => {
    const st = s.current;
    stage.drawPicture(cam.video, tracker, { privacy, background });
    const c = stage.beginFx(), ctx = stage.fxCtx;
    stage.drawCropGuide();
    if (phase.name === 'armed') {
      const f = recent ? framing(toDance(pose, danceCrop(stage.aspect)), 'upper', STAGE.aspect) : { ready: false, message: null };
      if (f.message !== st.message) { st.message = f.message; tick((n) => n + 1); }
      if (f.ready) { st.readySince ??= now; if (now - st.readySince > 0.65) begin(countdownSeconds); } else st.readySince = null;
    }
    if (phase.name === 'countdown') {
      const left = Math.ceil(st.countdownEnd - now);
      if (left <= 0) startRecording(stage, tracker); else if (left !== phase.value) setPhase({ name: 'countdown', value: left });
    }
    if (phase.name === 'recording' && st.recorder) {
      const t = st.recorder.elapsed;
      st.recorder.frame(fresh ? pose : null, tracker.capturedAt);
      stage.live.push(t, recent ? pose : null); stage.live.draw(ctx, stage.map, trailScale(c));
      drawPerimeter(ctx, c.w, c.h, t / choice.length, now, c.dpr);
      if (Math.floor(t * 4) !== st.lastTick) { st.lastTick = Math.floor(t * 4); tick((n) => n + 1); }
      if (t >= choice.length) stop();
    }
  };
  const begin = (n) => { if (s.current.counting) return; s.current.counting = true; s.current.countdownEnd = performance.now() / 1000 + n; setPhase({ name: 'countdown', value: n }); };
  const startRecording = async (stage, tracker) => {
    const st = s.current;
    if (st.recorder) return;
    try {
      st.recorder = new DanceRecorder(stage, tracker, { privacy });
      st.clock = new SongClock(choice.song, choice.file);
      st.recorder.start(choice.length);
      setPhase({ name: 'recording' });
      await st.clock.play(choice.start);
    } catch (e) { st.recorder?.cancel(); st.recorder = null; setPhase({ name: 'idle' }); alertDialog({ title: 'Couldn’t record', message: e.message }); }
  };
  const stop = async () => {
    const st = s.current; if (!st.recorder || st.stopping) return;
    st.stopping = true; setPhase({ name: 'finalizing' });
    st.clock?.stop();
    const result = await st.recorder.stop();
    st.recorder = null;
    if (result.duration < 1.5) { st.stopping = false; setPhase({ name: 'idle' }); return; }
    nav.replace('review', { result, choice: { ...choice, length: Math.min(choice.length, result.duration) }, privacy });
  };
  useEffect(() => () => { s.current.clock?.stop(); s.current.recorder?.cancel(); }, []);

  const onRecord = () => {
    if (!choice) return pick();
    if (phase.name === 'recording') return stop();
    if (phase.name === 'armed' || phase.name === 'countdown') { s.current.readySince = null; return setPhase({ name: 'idle' }); }
    s.current = {}; setPhase({ name: 'armed' });
  };
  const recording = phase.name === 'recording', armed = phase.name === 'armed' || phase.name === 'countdown';
  const t = s.current.recorder?.elapsed ?? 0;
  const gestures = useGestures(background, setBackground, phase.name === 'idle');
  return html`<div class="stage-view" ref=${host} ...${gestures}>
    ${camera.state === 'opening' && html`<div style="position:absolute;inset:0;display:grid;place-items:center"><${ProgressView} label="Opening camera…" /></div>`}
    ${camera.state === 'unavailable' && html`<${Unavailable} camera=${camera} retry=${retry} />`}
    ${phase.name === 'finalizing' && html`<div style="position:absolute;inset:0;display:grid;place-items:center;background:#000;z-index:8"><${ProgressView} label="Saving your dance…" /></div>`}
  </div>
  <${Chrome} songTitle=${choice ? choice.song.title : 'Choose a song'} songSubtitle=${choice ? clock(choice.length - (recording ? t : 0)) : null} onSong=${armed || recording ? null : pick}
    onClose=${() => { s.current.clock?.stop(); s.current.recorder?.cancel(); nav.pop(); }} privacy=${privacy} onPrivacy=${setPrivacy} lockSettings=${recording}
    bottom=${html`<div class="gp-controls">
      <${TimerButton} disabled=${armed || recording} />
      ${armed && phase.name !== 'countdown' ? html`<div style="width:78px;height:78px"></div>` : html`<${RecordButton} on=${recording} disabled=${camera.state !== 'running'} label=${recording ? 'Stop recording' : 'Record dance'} onClick=${onRecord} />`}
      <${BackgroundButton} background=${background} setBackground=${setBackground} disabled=${armed || recording} />
    </div>`}>
    ${phase.name === 'countdown' && html`<${Countdown} value=${phase.value} />`}
    ${phase.name === 'armed' && (s.current.message ? html`<${FramingBubble} message=${s.current.message} />` : html`<div class="framing"><span class="status-pill glass"><${ProgressView} /></span></div>`)}
  </${Chrome}>`;
};

// ---------- Play ----------
const loadPlayable = async (dance) => {
  const r = await fetch(dance.pose, { credentials: 'omit' });
  if (!r.ok) throw new Error('This dance has no recorded movement.');
  const pose = parsePose(await r.json(), dance.clip.length, dance.clip.offset);
  const ghost = document.createElement('video');
  ghost.crossOrigin = 'anonymous'; ghost.muted = true; ghost.playsInline = true; ghost.preload = 'auto'; ghost.src = dance.ghost;
  await new Promise((res, rej) => { ghost.addEventListener('loadeddata', res, { once: true }); ghost.addEventListener('error', () => rej(new Error('Couldn’t load the starting ghost.')), { once: true }); });
  return { pose: { ...pose, mode: dance.mode }, ghost };
};

export const PlayingFlow = ({ params }) => {
  const dance = findDance(params.id), party = params.party ?? null;
  const host = useRef(), frame = useRef(), opacity = useStore(store, (s) => s.ghostOpacity), countdownSeconds = useStore(store, (s) => s.countdown);
  const [setup, setSetup] = useState('loading'), [error, setError] = useState(null), [privacy, setPrivacy] = useState(false), [ghostOpen, setGhostOpen] = useState(false);
  const [hud, setHud] = useState({ score: 0, combo: 0 }), [feedback, setFeedback] = useState(null), [result, setResult] = useState(null), [paused, setPaused] = useState(false), [, tick] = useState(0);
  const s = useRef({ align: new GhostAlign() });
  const { camera, retry } = useCameraStage(host, frame);

  useEffect(() => {
    if (!dance) return;
    let gone = false;
    loadPlayable(dance).then((p) => { if (gone) return; s.current.playable = p; setSetup(party ? 'armed' : 'ready'); if (party) s.current.armedAt = 0; }).catch((e) => !gone && setError(e.message));
    return () => { gone = true; s.current.clock?.stop(); s.current.playable?.ghost.pause(); };
  }, [dance?.id]);
  useEffect(() => { if (party) party.attachPlay({ ready: (r) => { s.current.partyReady = r; }, startAt: (at) => { s.current.partyStart = at; } }); return () => party?.detachPlay(); }, [party]);

  const onWindow = (w) => {
    const text = w.grade === 'perfect' ? 'Perfect!' : w.grade === 'great' ? 'Great!' : w.grade === 'good' ? 'Good!' : w.quality !== undefined ? 'Keep going' : null;
    if (!text) return;
    setFeedback({ text, id: Math.random() });
    clearTimeout(s.current.fbTimer); s.current.fbTimer = setTimeout(() => setFeedback(null), reduceMotion() ? 900 : 700);
  };

  const begin = async () => {
    const st = s.current, d = dance;
    if (st.begun) return; st.begun = true;
    const scorer = new Scorer({ frames: st.playable.pose.frames, length: st.playable.pose.length, mode: d.mode, aspect: STAGE.aspect }, st.viewAspect ?? STAGE.aspect, onWindow);
    st.scorer = scorer;
    st.clock = new SongClock(d.song, params.file ?? null);
    try { await st.clock.ready(); } catch (e) { setError(e.message); return; }
    setSetup('playing');
    await st.clock.play(d.clip.start).catch(() => {});
    st.playable.ghost.currentTime = d.clip.offset; st.playable.ghost.play().catch(() => {});
  };

  frame.current = ({ stage, tracker, cam, pose, fresh, recent, now }) => {
    const st = s.current, p = st.playable;
    stage.drawPicture(cam.video, tracker, { privacy });
    const c = stage.beginFx(), ctx = stage.fxCtx;
    if (!p) { stage.clearGhost(); return; }
    const playing = setup === 'playing' && st.clock;
    const t = playing ? st.clock.now() - dance.clip.start : 0;
    const ref = sample(p.pose.frames, Math.max(0, Math.min(p.pose.length, t)));
    st.viewAspect = stage.aspect;
    const transform = st.align.update(ref, recent ? pose : null, stage.aspect);
    if (playing && !paused && Math.abs(p.ghost.currentTime - (t + dance.clip.offset)) > 0.15 && t >= 0) p.ghost.currentTime = t + dance.clip.offset;
    stage.drawGhost(p.ghost, transform, opacity);
    if (setup === 'armed' || setup === 'countdown') {
      const f = recent ? framing(pose, dance.mode, stage.aspect) : { ready: false, message: null };
      if (f.message !== st.message) { st.message = f.message; tick((n) => n + 1); }
      const ready = f.ready;
      if (party) {
        party.setPositioned(ready);
        if (st.partyStart) { const left = Math.ceil((st.partyStart - party.serverNow()) / 1000); if (left <= 0) begin(); else if (left !== st.count) { st.count = left; setSetup('countdown'); tick((n) => n + 1); } }
      } else if (setup === 'armed') { if (ready) { st.readySince ??= now; if (now - st.readySince > 0.6 && !st.countdownEnd) { st.countdownEnd = now + countdownSeconds; setSetup('countdown'); } } else st.readySince = null; }
      else if (setup === 'countdown') { const left = Math.ceil(st.countdownEnd - now); if (left <= 0) begin(); else if (left !== st.count) { st.count = left; tick((n) => n + 1); } }
    }
    if (playing) {
      if (fresh && t >= -0.6) st.scorer.live.push(t - (performance.now() - (tracker.capturedAt ?? performance.now())) / 1000, pose);
      st.scorer.advance(t);
      if (st.scorer.score !== hud.score || st.scorer.combo !== hud.combo) setHud({ score: st.scorer.score, combo: st.scorer.combo });
      party?.sendScore(st.scorer.score, st.scorer.combo);
      stage.live.push(t, recent ? pose : null); stage.live.draw(ctx, stage.map, trailScale(c));
      stage.reference.push(t, applyTransform(ref, transform, stage.aspect)); stage.reference.draw(ctx, stage.map, trailScale(c));
      drawPerimeter(ctx, c.w, c.h, t / p.pose.length, now, c.dpr);
      if (Math.floor(t * 4) !== st.lastTick) { st.lastTick = Math.floor(t * 4); tick((n) => n + 1); }
      if (t >= p.pose.length) finish();
    }
  };
  const finish = () => {
    const st = s.current; if (st.done) return; st.done = true;
    st.clock.stop(); st.playable.ghost.pause();
    const final = Math.max(0, Math.min(100, st.scorer.advance(st.playable.pose.length, true).final));
    setResult({ score: final, counts: st.scorer.counts, best: st.scorer.best });
    setSetup('done');
    party?.finish(final);
  };
  const togglePause = () => {
    const st = s.current; if (!st.clock) return;
    if (paused) { st.clock.resume(); st.playable.ghost.play(); } else { st.clock.pause(); st.playable.ghost.pause(); }
    setPaused(!paused);
  };
  const restart = () => { const st = s.current; st.clock?.stop(); s.current = { align: new GhostAlign(), playable: st.playable }; setResult(null); setHud({ score: 0, combo: 0 }); setPaused(false); setSetup('ready'); };
  const close = () => { s.current.clock?.stop(); s.current.playable?.ghost.pause(); if (party) party.leaveRound(); nav.pop(); };

  if (!dance) return html`<${Empty} title="This dance is gone." />`;
  const playing = setup === 'playing', t = playing ? s.current.clock.now() - dance.clip.start : 0, length = s.current.playable?.pose.length ?? dance.clip.length;
  const status = error ? html`<span class="status-pill glass">${error}</span>`
    : setup === 'loading' && camera.state === 'running' ? html`<span class="status-pill glass">Getting your dance ready</span>`
    : (setup === 'armed') && (s.current.message ? html`<span class="bubble glass">${s.current.message.toUpperCase()}</span>` : party && s.current.partyReady ? html`<span class="status-pill glass">You’re ready. Waiting for friends…</span>` : html`<span class="status-pill glass"><${ProgressView} /></span>`);
  return html`<div class="stage-view" ref=${host}>
    ${camera.state === 'opening' && html`<div style="position:absolute;inset:0;display:grid;place-items:center"><${ProgressView} label="Opening camera…" /></div>`}
    ${camera.state === 'unavailable' && html`<${Unavailable} camera=${camera} retry=${retry} />`}
  </div>
  <${Chrome} songTitle=${dance.song.title} songSubtitle=${clock(length - t)} onClose=${close} privacy=${privacy} onPrivacy=${setPrivacy} lockSettings=${playing}
    bottom=${setup === 'done' ? null : html`
      ${playing && html`<div class="scorecard glass"><span class="score">${hud.score.toLocaleString()}</span><span class="headline">x${hud.combo} COMBO</span></div>`}
      ${playing && !party ? html`<div style="margin-top:14px"><${Button} size="large" icon=${paused ? 'play' : 'pause'} label=${paused ? 'Resume' : 'Pause'} onClick=${togglePause} /></div>`
        : !playing && !party && html`<div class="gp-controls">
          <${TimerButton} disabled=${setup !== 'ready'} />
          ${setup === 'ready' ? html`<${RecordButton} label="Start dance" disabled=${camera.state !== 'running'} onClick=${() => { s.current.readySince = null; setSetup('armed'); }} />` : html`<div style="width:78px;height:78px"></div>`}
          <${Button} size="large" icon="photo" iconOnly label="Background photo" disabled />
        </div>`}`}>
    ${party && setup !== 'done' && html`<div style="position:absolute;left:20px;right:20px;top:calc(76px + var(--safe-top));z-index:4"><${party.Strip} /></div>`}
    ${status && html`<div class="framing">${status}</div>`}
    ${setup === 'countdown' && html`<${Countdown} value=${s.current.count ?? countdownSeconds} />`}
    ${feedback && playing && html`<div class="feedback glass" key=${feedback.id}>${feedback.text}</div>`}
    ${setup !== 'done' && html`<div class="ghost-control">
      <button class=${`glass size-large icon-only ${ghostOpen ? 'tinted' : ''}`} aria-label="Ghost opacity" aria-expanded=${ghostOpen} onClick=${() => setGhostOpen(!ghostOpen)}><${Icon} name="person.fill.viewfinder" /></button>
      ${ghostOpen && html`<div class="ghost-slider glass"><input type="range" min="0" max="1" step="0.01" value=${opacity} aria-label="Ghost opacity" onInput=${(e) => setPref('ghostOpacity', Number(e.target.value))} /></div>`}
    </div>`}
    ${result && html`<${Results} score=${result.score} dance=${dance} isParty=${!!party}
      onShare=${() => share(danceLink(dance), `I scored ${result.score} on “${dance.title}” in Copycat.`)}
      onReplay=${party ? () => party.backToLobby() : restart} onChallenge=${guarded(async () => { await ensureViewer(); nav.replace('lobby', { dance: dance.id }); })} />`}
  </${Chrome}>`;
};

const Results = ({ score, isParty, onShare, onReplay, onChallenge }) => html`<div class="results glass-surface" style="border-radius:32px">
  <span class="headline secondary">Your score</span>
  <div class="scoreline"><span class="big">${score}</span><span class="title3 secondary">/ 100</span><span class="grade glass">${grade(score)}</span></div>
  <${Button} style="glassProminent" size="large" full icon="square.and.arrow.up" label="Share score" onClick=${onShare} />
  <div class="row" style="gap:12px;width:100%"><${Button} size="large" full label=${isParty ? 'Back to party' : 'Play again'} onClick=${onReplay} /><${Button} size="large" full label="Challenge friends" onClick=${onChallenge} /></div>
</div>`;
