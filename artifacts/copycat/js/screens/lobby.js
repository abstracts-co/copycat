import { html, useStore, useEffect, useRef, useState, cls } from '../lib.js';
import { Icon } from '../icons.js';
import { Button, NavBar, ProgressView, Media, sheet, confirmDialog, useNow } from '../ui.js';
import { store, nav, homeModel, ensureViewer, HOST } from '../data/store.js';
import { Party, MAX_MEMBERS } from '../party/room.js';
import { share, guarded } from './actions.js';
import { findDance } from './dance.js';

const REACTIONS = ['🔥', '👏', '✨', '💜', '😂', '🙌'];
let current = null;
const initials = (v = '') => v.split(' ').slice(0, 2).map((w) => w[0] ?? '').join('').toUpperCase();
const inviteLink = (room) => `${HOST}/a/${store.get().community}?a_room=${room}`;

const Video = ({ stream, muted, mirror }) => {
  const ref = useRef();
  useEffect(() => { if (ref.current && ref.current.srcObject !== stream) { ref.current.srcObject = stream; ref.current.play().catch(() => {}); } }, [stream]);
  return html`<video ref=${ref} autoplay playsinline muted=${muted} style=${mirror ? 'transform:scaleX(-1)' : ''}></video>`;
};

const usePartyState = (party) => { useStore(party.store, (s) => s); return party.s; };

const Tile = ({ party, member, height }) => {
  const s = party.s, me = member.id === s.me?.id, media = party.value(`media:${member.id}`) ?? { mic: true, cam: true };
  const stream = me ? party.media : s.streams[member.id], camOn = me ? s.cam : media.cam;
  const reaction = party.value(`reaction:${member.id}`), now = useNow(500);
  const showReaction = reaction && party.serverNow() - reaction.at < 3000;
  void now;
  return html`<div class="lobby-tile" style=${`height:${height}px;aspect-ratio:auto`} aria-label=${`${me ? 'You' : member.name}, ${camOn ? 'camera on' : 'camera off'}, ${party.value(`ready:${member.id}`) ? 'ready' : 'not ready'}`}>
    ${stream && camOn ? html`<${Video} stream=${stream} muted=${me} mirror=${me} />` : html`<span class="initials">${initials(member.name || member.username)}</span>`}
    ${showReaction && html`<span style="position:absolute;top:8px;left:8px;font-size:26px">${reaction.emoji}</span>`}
    <div class="label">
      ${party.value('host') === member.id && html`<span style="color:#ffd60a"><${Icon} name="crown.fill" /></span>`}
      <span class="line1">${me ? 'You' : member.name || member.username}</span>
      ${party.value(`ready:${member.id}`) && html`<span style="color:#30d158"><${Icon} name="checkmark.circle.fill" /></span>`}
      <span class="spacer"></span>${!(me ? s.mic : media.mic) && html`<${Icon} name="mic.slash.fill" />`}
    </div></div>`;
};

const DancePicker = ({ party, close }) => {
  const s = usePartyState(party), dances = homeModel(store.get().feed.dances).popularDances, open = !party.value('round');
  return html`<div class="col" style="gap:12px">
    <span class="title2 bold">Choose a dance</span>
    <span class="footnote secondary">One vote each. Ties follow the host’s vote, then the earliest vote.</span>
    <div style="display:flex;gap:8px;overflow-x:auto;scroll-snap-type:x mandatory;scrollbar-width:none;margin:0 -24px;padding:0 24px">
      ${dances.map((d) => {
        const count = party.active.filter((m) => party.value(`vote:${m.id}`) === d.id).length, mine = party.value(`vote:${s.me?.id}`) === d.id, selected = party.value('selected') === d.id;
        return html`<div class="col" style=${`flex:0 0 calc(100% - 16px);scroll-snap-align:center;gap:12px;padding:14px;border-radius:22px;background:${selected ? 'rgba(244,214,58,0.12)' : 'rgba(255,255,255,0.04)'};box-shadow:${selected ? 'inset 0 0 0 1.5px var(--accent)' : 'none'}`}>
          <${Media} src=${d.thumbnail} style="height:150px;border-radius:18px" />
          <span class="headline line2">${d.title}</span>
          <span class="subheadline secondary line1">${d.song.title} · ${d.song.artist}</span>
          <div class="row"><span class="row" style="gap:4px">👍 ${count}</span><span class="spacer"></span><span class="subheadline semibold">${mine ? 'Your vote' : selected ? 'Selected' : 'Vote'}</span></div>
          <${Button} style="glassProminent" size="large" full label=${mine ? 'Voted' : 'Vote for this dance'} disabled=${!open || mine} onClick=${() => { party.vote(d.id); close(); }} />
        </div>`;
      })}
    </div></div>`;
};

const Reactions = ({ party, close }) => html`<div class="col" style="gap:12px;align-items:center"><span class="headline">Send a reaction</span>
  <div style="display:grid;grid-template-columns:repeat(3,52px);gap:8px">${REACTIONS.map((e) => html`<button class="glass" style="width:52px;height:52px;border-radius:50%;font-size:24px" aria-label=${`React ${e}`} onClick=${() => { party.react(e); close(); }}>${e}</button>`)}</div></div>`;

export const LobbyView = ({ params }) => {
  const [party, setParty] = useState(() => (current && !current.left && (!params.room || current.s.room === params.room) ? current : null));
  const [error, setError] = useState(null), box = useRef(), [height, setHeight] = useState(600);
  useEffect(() => {
    if (party) return;
    let gone = false;
    (async () => {
      try {
        await ensureViewer();
        const p = new Party(); current = p;
        p.onStart = (round) => nav.push('solo', { id: round.dance, party: playBridge(p) });
        p.onBack = () => { const st = store.get().stack; if (st[st.length - 1]?.name === 'solo') nav.pop(); };
        await p.join(params.room);
        if (gone) return;
        if (params.dance && !p.value('selected')) p.set('selected', params.dance);
        setParty(p);
      } catch (e) { if (!gone) setError(e.code === 'denied' || e.code === 'cancelled' ? 'Parties need your abstracts account.' : e.message); }
    })();
    return () => { gone = true; };
  }, []);
  useEffect(() => { const r = new ResizeObserver(() => setHeight(box.current?.clientHeight ?? 600)); if (box.current) r.observe(box.current); return () => r.disconnect(); }, [party]);
  const leave = () => { current?.leave(); current = null; nav.pop(); };
  if (!party) return html`<${NavBar} title="Party" onBack=${nav.pop} /><div class="scroll" style="display:grid;place-items:center">${error ? html`<div class="col" style="gap:12px;align-items:center;padding:24px"><span class="secondary center">${error}</span><${Button} label="Back" onClick=${nav.pop} /></div>` : html`<${ProgressView} label="Opening the party…" />`}</div>`;
  return html`<${LobbyBody} party=${party} leave=${leave} boxRef=${box} height=${height} />`;
};

const LobbyBody = ({ party, leave, boxRef, height }) => {
  const s = usePartyState(party);
  useStore(store, (x) => x.feed);
  const selected = findDance(party.value('selected')) ?? homeModel(store.get().feed.dances).popularDances[0];
  const active = party.active, me = s.me, round = party.value('round');
  const ready = !!party.value(`ready:${me?.id}`), canStart = s.status === 'open' && active.length >= 2 && active.every((m) => party.value(`ready:${m.id}`)) && !!selected && !round;
  const columns = active.length <= 2 ? 1 : 2, rows = Math.max(1, Math.ceil(active.length / columns));
  const camHeight = Math.max(rows * 100 + (rows - 1) * 8, height * (round?.phase === 'finished' ? 0.35 : 0.62)), tileH = (camHeight - (rows - 1) * 8) / rows;
  const finals = active.map((m) => ({ id: m.id, name: m.id === me?.id ? 'You' : m.name || m.username, score: party.value(`final:${m.id}`)?.score ?? null })).sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  const confirmLeave = () => confirmDialog({ title: 'Leave the party?', actions: [{ label: 'Leave', role: 'destructive', onClick: leave }, { label: 'Cancel', role: 'cancel' }] });
  return html`<${NavBar} title="Party" onBack=${confirmLeave} right=${html`<button class="glass size-regular" style="color:var(--destructive)" onClick=${leave}>Leave</button>`} />
  <div class="scroll" ref=${boxRef}><div class="col" style="gap:16px;padding:16px">
    <div class="row" style="gap:12px">
      <button class="col" style="gap:4px;flex:1;min-width:0;text-align:left" disabled=${!!round} aria-label=${`Selected dance: ${selected?.title ?? 'none'}`} onClick=${() => sheet(DancePicker, { party }, { tall: true })}>
        <span class="row title3 semibold" style="gap:6px"><span class="line1">${selected?.title ?? 'Choose a dance'}</span><${Icon} name="chevron.right" size=${12} class="secondary" /></span>
        <span class="subheadline secondary line1">${selected?.song.title ?? ''}</span></button>
      <${Button} size="large" icon="person.badge.plus" iconOnly label="Invite a friend" onClick=${() => share(inviteLink(s.room), `Join my Copycat party: ${s.room}`)} />
    </div>
    <span class="footnote secondary">Party code <span class="mono semibold" style="color:#fff;letter-spacing:2px">${s.room}</span></span>
    ${round?.phase === 'finished' && html`<div class="col" style="gap:12px;padding:8px 0">
      <span class="title2 bold">Round complete</span>
      ${finals.map((r) => html`<div class="row" style="gap:12px"><span class="spacer">${r.name}</span><span class="mono">${r.score === null ? '—' : `${r.score} / 100`}</span></div>`)}
      ${party.isHost ? html`<${Button} style="glassProminent" size="large" full label="Next round" onClick=${() => party.nextRound()} />` : html`<span class="footnote secondary">Waiting for the host to choose the next round.</span>`}
    </div>`}
    <div style=${`display:grid;grid-template-columns:repeat(${columns},1fr);gap:8px`}>${active.map((m) => html`<${Tile} key=${m.id} party=${party} member=${m} height=${tileH} />`)}
      ${active.length < MAX_MEMBERS && columns === 2 && active.length % 2 === 1 && html`<button class="lobby-tile invite" style=${`height:${tileH}px;aspect-ratio:auto`} onClick=${() => share(inviteLink(s.room), `Join my Copycat party: ${s.room}`)}><${Icon} name="plus" /><span class="footnote">Invite</span></button>`}</div>
    ${!active.length && html`<${ProgressView} label="Loading participants" />`}
    ${s.error && html`<p class="footnote secondary">${s.error}</p>`}
    ${s.status === 'reconnecting' && html`<${ProgressView} label="Reconnecting lobby…" />`}
  </div></div>
  <div class="col" style="gap:10px;padding:12px 16px calc(12px + var(--safe-bottom));background:rgba(20,20,22,0.8);-webkit-backdrop-filter:blur(20px);backdrop-filter:blur(20px)">
    <div class="row" style="gap:16px;justify-content:center">
      <${Button} size="large" iconOnly icon=${s.mic ? 'mic.fill' : 'mic.slash.fill'} label="Microphone" onClick=${() => party.toggleMic()} />
      <${Button} size="large" iconOnly icon=${s.cam ? 'video.fill' : 'video.slash.fill'} label="Camera" onClick=${() => party.toggleCam()} />
      <${Button} size="large" iconOnly icon="face.smiling" label="Send a reaction" onClick=${() => sheet(Reactions, { party })} />
    </div>
    ${!round && html`<div class="row" style="gap:12px">
      <button class=${cls('glass', 'size-large', 'full')} style=${`color:${ready ? '#30d158' : 'var(--accent)'}`} disabled=${s.status !== 'open' || !selected} onClick=${() => party.toggleReady()}>${ready ? 'Ready' : 'Ready up'}</button>
      ${party.isHost && html`<${Button} style="glassProminent" size="large" full label="Start round" disabled=${!canStart} onClick=${() => party.startRound(selected?.id)} />`}
    </div>`}
  </div>`;
};

/** What the play screen needs from a party: positioning, the shared start, live scores and the member strip. */
const playBridge = (p) => ({
  attachPlay: (h) => p.attachPlay(h), detachPlay: () => p.detachPlay(), setPositioned: (r) => p.setPositioned(r), serverNow: () => p.serverNow(),
  sendScore: (a, b) => p.sendScore(a, b), finish: (n) => p.finish(n), leaveRound: () => p.backToLobby(), backToLobby: () => p.backToLobby(),
  Strip: () => html`<${MemberStrip} party=${p} />`,
});

const MemberStrip = ({ party }) => {
  const s = usePartyState(party), others = party.active.filter((m) => m.id !== s.me?.id);
  const round = party.value('round'), playing = !!round?.startAt && party.serverNow() >= round.startAt;
  const leader = others.reduce((best, m) => ((s.scores[m.id]?.score ?? -1) > (s.scores[best?.id]?.score ?? -1) ? m : best), null);
  return html`<div class="member-strip">${others.map((m) => {
    const media = party.value(`media:${m.id}`) ?? { mic: true, cam: true }, score = s.scores[m.id]?.score;
    return html`<div class="member-card" aria-label=${`${m.name}, live score ${score ?? 'not received yet'}`}>
      ${s.streams[m.id] && media.cam ? html`<${Video} stream=${s.streams[m.id]} />` : html`<span class="initials" style="position:absolute;inset:0;display:grid;place-items:center;font-weight:700">${initials(m.name || m.username)}</span>`}
      <div class="meta"><div class="row" style="gap:3px">${leader?.id === m.id && score !== undefined && html`<span style="color:#ffd60a"><${Icon} name="crown.fill" /></span>`}<span class="line1">${m.name || m.username}</span></div>
        <div class="row">${playing ? html`<span class="mono">${score ?? '—'}</span>` : html`<span class="line1">${s.positioned[m.id] ? 'Ready' : 'Getting in position'}</span>`}<span class="spacer"></span>${!media.mic && html`<${Icon} name="mic.slash.fill" />`}</div></div>
    </div>`;
  })}</div>`;
};

export const JoinView = () => {
  const [code, setCode] = useState('');
  const ok = /^[A-HJ-NP-Z2-9]{6}$/.test(code);
  return html`<${NavBar} title="Join a party" onBack=${nav.pop} />
  <div class="col" style="gap:16px;padding:20px">
    <span class="subheadline secondary">Enter the code from your friend’s invite.</span>
    <div class="textfield"><input class="mono" style="letter-spacing:6px;font-size:22px;text-transform:uppercase" maxlength="6" placeholder="CODE" value=${code} autocapitalize="characters" autocomplete="off" onInput=${(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} aria-label="Party code" /></div>
    <${Button} style="glassProminent" size="large" full label="Join party" disabled=${!ok} onClick=${guarded(() => nav.replace('lobby', { room: code }))} />
    <${Button} size="large" full icon="person.2.fill" label="Start a new party" onClick=${guarded(() => nav.replace('lobby', {}))} />
  </div>`;
};
