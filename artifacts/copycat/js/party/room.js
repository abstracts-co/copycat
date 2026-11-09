import { createStore } from '../lib.js';
import { bridge } from '../data/bridge.js';

export const MAX_MEMBERS = 6;
const SCORE_EVERY = 500;

/**
 * A Copycat party on an abstracts.co room: presence and shared state go through the room;
 * voice and video go peer to peer over WebRTC. Shared keys: host, selected, vote:<id>, ready:<id>,
 * media:<id>, reaction:<id>, round, final:<id>.
 */
export class Party {
  constructor() {
    this.store = createStore({ status: 'connecting', error: null, me: null, members: [], state: {}, streams: {}, scores: {}, positioned: {}, mic: true, cam: true, room: null });
    this.peers = new Map(); this.offset = 0; this.bestRtt = Infinity; this.lastScore = 0; this.play = null;
  }
  get s() { return this.store.get(); }
  serverNow() { return Date.now() + this.offset; }
  value(key) { return this.s.state[key]?.value ?? null; }
  async join(room) {
    try {
      const t = await bridge.call('roomToken', room ? { room } : {});
      this.ice = t.ice ?? [{ urls: 'stun:stun.cloudflare.com:3478' }];
      this.store.set({ room: t.room });
      this.media = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: { facingMode: 'user', width: { ideal: 480 }, height: { ideal: 640 }, frameRate: { ideal: 20 } } }).catch(() => null);
      if (!this.media) this.store.set({ cam: false, mic: false });
      this.connect(`${t.url}?token=${encodeURIComponent(t.token)}`);
      return t.room;
    } catch (e) { this.store.set({ status: 'failed', error: e.code === 'unsupported' ? 'Parties need Copycat open on abstracts.co.' : e.message }); throw e; }
  }
  connect(url) {
    const ws = new WebSocket(url); this.ws = ws;
    ws.onmessage = (e) => { try { this.onMessage(JSON.parse(e.data)); } catch {} };
    ws.onclose = (e) => {
      if (this.ws !== ws || this.left) return;
      const error = e.code === 4003 ? 'This party is full.' : e.code === 4002 ? 'This invite expired. Ask for a new one.' : e.code === 4001 ? 'You joined from somewhere else.' : 'Reconnecting lobby…';
      this.store.set({ status: e.code >= 4000 ? 'failed' : 'reconnecting', error });
      if (e.code < 4000) setTimeout(() => !this.left && this.join(this.s.room).catch(() => {}), 1500);
    };
    clearInterval(this.pinger);
    this.pinger = setInterval(() => this.send({ t: 'ping', c: Date.now() }), 4000);
  }
  send(m) { if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(m)); }
  set(key, value) {
    this.send({ t: 'set', key, value });
    this.store.set((s) => ({ state: { ...s.state, [key]: value === null ? undefined : { value, from: s.me?.id, at: this.serverNow() } } }));
    if (key === 'round') this.onRound(value);
  }
  relay(data, to) { this.send(to ? { t: 'send', data, to } : { t: 'send', data }); }

  onMessage(m) {
    if (m.t === 'welcome') {
      this.offset = m.now - Date.now();
      this.store.set({ status: 'open', error: null, me: m.you, members: m.members, state: m.state ?? {} });
      this.send({ t: 'ping', c: Date.now() });
      this.set(`media:${m.you.id}`, { mic: this.s.mic, cam: this.s.cam });
      if (!this.value('host') || !m.members.some((x) => x.id === this.value('host'))) this.set('host', m.you.id);
      for (const other of m.members) if (other.id !== m.you.id) this.ensurePeer(other.id);
    } else if (m.t === 'join') {
      this.store.set((s) => ({ members: [...s.members.filter((x) => x.id !== m.member.id), m.member] }));
      this.ensurePeer(m.member.id);
    } else if (m.t === 'leave') {
      this.store.set((s) => ({ members: s.members.filter((x) => x.id !== m.id), streams: { ...s.streams, [m.id]: undefined } }));
      this.peers.get(m.id)?.pc.close(); this.peers.delete(m.id);
      if (this.value('host') === m.id) { const next = [...this.s.members].sort((a, b) => (a.id < b.id ? -1 : 1))[0]; if (next?.id === this.s.me?.id) this.set('host', next.id); }
    } else if (m.t === 'state') {
      this.store.set((s) => ({ state: { ...s.state, [m.key]: m.value === null ? undefined : { value: m.value, from: m.from, at: m.at } } }));
      if (m.key === 'round') this.onRound(m.value);
      if (this.isHost && m.key.startsWith('vote:')) { const next = this.tally(); if (next && next !== this.value('selected')) this.set('selected', next); }
      if (this.isHost && m.key.startsWith('final:')) this.maybeFinish();
    } else if (m.t === 'pong') {
      const rtt = Date.now() - m.c;
      if (rtt <= this.bestRtt * 1.5) { this.bestRtt = Math.min(rtt, this.bestRtt); this.offset = m.s - (m.c + rtt / 2); }
    } else if (m.t === 'msg') this.onRelay(m.from, m.data);
  }
  onRelay(from, d) {
    if (d?.type === 'signal') this.onSignal(from, d);
    else if (d?.type === 'score') this.store.set((s) => ({ scores: { ...s.scores, [from]: { score: d.score, combo: d.combo, round: d.round } } }));
    else if (d?.type === 'positioned') { this.store.set((s) => ({ positioned: { ...s.positioned, [from]: d.ready } })); this.maybeSchedule(); }
  }

  // WebRTC: the member with the smaller id offers, so two peers never offer to each other at once.
  ensurePeer(id) {
    if (this.peers.has(id) || id === this.s.me?.id) return;
    const pc = new RTCPeerConnection({ iceServers: this.ice });
    const peer = { pc, pending: [] }; this.peers.set(id, peer);
    this.media?.getTracks().forEach((track) => {
      const sender = pc.addTrack(track, this.media);
      if (track.kind === 'video') { const p = sender.getParameters(); p.encodings = [{ maxBitrate: 250_000, scaleResolutionDownBy: 1.5 }]; sender.setParameters(p).catch(() => {}); }
    });
    if (!this.media) { pc.addTransceiver('video', { direction: 'recvonly' }); pc.addTransceiver('audio', { direction: 'recvonly' }); }
    pc.ontrack = (e) => this.store.set((s) => ({ streams: { ...s.streams, [id]: e.streams[0] } }));
    pc.onicecandidate = (e) => e.candidate && this.relay({ type: 'signal', candidate: e.candidate }, id);
    pc.onconnectionstatechange = () => { if (pc.connectionState === 'failed') { pc.close(); this.peers.delete(id); setTimeout(() => this.s.members.some((x) => x.id === id) && this.ensurePeer(id), 1000); } };
    if (this.s.me.id < id) pc.createOffer().then((o) => pc.setLocalDescription(o)).then(() => this.relay({ type: 'signal', sdp: pc.localDescription }, id));
  }
  async onSignal(from, d) {
    if (!this.peers.has(from)) this.ensurePeer(from);
    const peer = this.peers.get(from), pc = peer.pc;
    try {
      if (d.sdp) {
        await pc.setRemoteDescription(d.sdp);
        for (const c of peer.pending.splice(0)) await pc.addIceCandidate(c).catch(() => {});
        if (d.sdp.type === 'offer') { await pc.setLocalDescription(await pc.createAnswer()); this.relay({ type: 'signal', sdp: pc.localDescription }, from); }
      } else if (d.candidate) { if (pc.remoteDescription) await pc.addIceCandidate(d.candidate).catch(() => {}); else peer.pending.push(d.candidate); }
    } catch {}
  }
  toggleMic() { const on = !this.s.mic; this.media?.getAudioTracks().forEach((t) => (t.enabled = on)); this.store.set({ mic: on }); this.set(`media:${this.s.me.id}`, { mic: on, cam: this.s.cam }); }
  toggleCam() { const on = !this.s.cam; this.media?.getVideoTracks().forEach((t) => (t.enabled = on)); this.store.set({ cam: on }); this.set(`media:${this.s.me.id}`, { mic: this.s.mic, cam: on }); }
  react(emoji) { this.set(`reaction:${this.s.me.id}`, { emoji, at: this.serverNow() }); }
  vote(danceId) { this.set(`vote:${this.s.me.id}`, danceId); if (this.isHost) this.set('selected', this.tally() ?? danceId); }
  toggleReady() { this.set(`ready:${this.s.me.id}`, !this.value(`ready:${this.s.me.id}`)); }
  get isHost() { return this.value('host') === this.s.me?.id; }
  get active() { return this.s.members.slice(0, MAX_MEMBERS); }
  /** One vote each; ties follow the host's vote, then the earliest vote. */
  tally() {
    const votes = this.active.map((m) => ({ id: m.id, dance: this.value(`vote:${m.id}`), at: this.s.state[`vote:${m.id}`]?.at ?? 0 })).filter((v) => v.dance);
    if (!votes.length) return this.value('selected');
    const counts = new Map(); votes.forEach((v) => counts.set(v.dance, (counts.get(v.dance) ?? 0) + 1));
    const top = Math.max(...counts.values()), tied = [...counts.keys()].filter((k) => counts.get(k) === top);
    if (tied.length === 1) return tied[0];
    const host = votes.find((v) => v.id === this.value('host') && tied.includes(v.dance));
    return host?.dance ?? votes.filter((v) => tied.includes(v.dance)).sort((a, b) => a.at - b.at)[0].dance;
  }
  startRound(fallback) {
    const id = `r${this.serverNow().toString(36)}`, dance = this.tally() ?? this.value('selected') ?? fallback;
    if (!dance) return;
    this.active.forEach((m) => this.set(`final:${m.id}`, null));
    this.set('round', { id, dance, phase: 'positioning', startAt: null });
  }
  onRound(r) { if (r?.phase === 'positioning' && !r.startAt && this.startedRound !== r.id) { this.startedRound = r.id; this.store.set({ positioned: {}, scores: {} }); this.onStart?.(r); } if (r?.startAt) this.play?.startAt(r.startAt); }
  maybeSchedule() {
    const r = this.value('round');
    if (!this.isHost || !r || r.startAt || r.phase !== 'positioning') return;
    const everyone = this.active.every((m) => this.s.positioned[m.id]);
    if (everyone) this.set('round', { ...r, startAt: this.serverNow() + 4000 });
  }
  attachPlay(p) { this.play = p; const r = this.value('round'); if (r?.startAt) p.startAt(r.startAt); }
  detachPlay() { this.play = null; }
  setPositioned(ready) {
    if (this.lastPositioned === ready) return; this.lastPositioned = ready;
    this.store.set((s) => ({ positioned: { ...s.positioned, [s.me.id]: ready } }));
    this.relay({ type: 'positioned', ready }); this.play?.ready(ready); this.maybeSchedule();
  }
  sendScore(score, combo) {
    const now = performance.now(); if (now - this.lastScore < SCORE_EVERY) return; this.lastScore = now;
    const round = this.value('round')?.id;
    this.store.set((s) => ({ scores: { ...s.scores, [s.me.id]: { score, combo, round } } }));
    this.relay({ type: 'score', score, combo, round });
  }
  finish(score) { this.set(`final:${this.s.me.id}`, { score, round: this.value('round')?.id }); if (this.isHost) setTimeout(() => this.maybeFinish(), 500); }
  maybeFinish() { const r = this.value('round'); if (this.isHost && r && this.active.every((m) => this.value(`final:${m.id}`)?.round === r.id)) this.set('round', { ...r, phase: 'finished' }); }
  nextRound() { this.active.forEach((m) => this.set(`ready:${m.id}`, false)); this.set('round', null); }
  leaveRound() { this.backToLobby(); }
  backToLobby() { this.onBack?.(); }
  leave() {
    this.left = true; clearInterval(this.pinger);
    this.peers.forEach((p) => p.pc.close()); this.peers.clear();
    this.media?.getTracks().forEach((t) => t.stop());
    this.ws?.close(1000);
  }
}
