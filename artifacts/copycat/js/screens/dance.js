import { html, useStore, useEffect, useRef, useState, compact } from '../lib.js';
import { Icon } from '../icons.js';
import { Button, Avatar, NavBar, Spinner, sheet, menu, confirmDialog, toast, who } from '../ui.js';
import { store, nav, toggleLike, loadFeed, ensureViewer } from '../data/store.js';
import { bridge } from '../data/bridge.js';
import { shareDance, guarded, openOnAbstracts } from './actions.js';
import { ReportSheet } from './more.js';
import { block } from './profile.js';

export const findDance = (id) => store.get().feed.dances.find((d) => d.id === id);

/** Plays a dance's video with its song from the clip start, looping together. */
export const useDancePreview = (dance, videoRef) => {
  const [muted, setMuted] = useState(false), [ready, setReady] = useState(false), [failure, setFailure] = useState(null);
  const audio = useRef(null);
  useEffect(() => {
    const v = videoRef.current; if (!v || !dance) return;
    setReady(false); setFailure(null);
    const a = dance.song.url ? new Audio(dance.song.url) : null; audio.current = a;
    const sync = () => { if (v.currentTime < dance.clip.offset || v.currentTime > dance.clip.offset + dance.clip.length) v.currentTime = dance.clip.offset; if (a && Math.abs(a.currentTime - (dance.clip.start + v.currentTime - dance.clip.offset)) > 0.15) a.currentTime = dance.clip.start + v.currentTime - dance.clip.offset; };
    const onPlay = () => { setReady(true); if (a) { sync(); a.play().catch(() => {}); } };
    const onPause = () => a?.pause();
    const onTime = () => sync();
    const onError = () => setFailure('The video couldn’t be opened. Try again.');
    v.addEventListener('playing', onPlay); v.addEventListener('pause', onPause); v.addEventListener('timeupdate', onTime); v.addEventListener('error', onError);
    v.play().catch(() => { v.muted = true; v.play().catch(() => {}); });
    return () => { v.removeEventListener('playing', onPlay); v.removeEventListener('pause', onPause); v.removeEventListener('timeupdate', onTime); v.removeEventListener('error', onError); a?.pause(); };
  }, [dance?.id]);
  useEffect(() => { if (audio.current) audio.current.muted = muted; }, [muted]);
  return { muted, toggleMuted: () => setMuted(!muted), ready, failure, stop: () => { videoRef.current?.pause(); audio.current?.pause(); } };
};

export const DanceDetailView = ({ params }) => {
  useStore(store, (s) => s.feed);
  const liked = useStore(store, (s) => s.liked.has(params.id)), likeBusy = useStore(store, (s) => s.likeBusy.has(params.id));
  const viewer = useStore(store, (s) => s.viewer);
  const dance = findDance(params.id), video = useRef();
  const p = useDancePreview(dance, video);
  if (!dance) return html`<${NavBar} onBack=${nav.pop} /><div class="scroll"><p class="secondary center">This dance is gone.</p></div>`;
  const choose = () => sheet(PlayModeSheet, { onSolo: () => { p.stop(); nav.push('solo', { id: dance.id }); }, onParty: () => { p.stop(); nav.push('lobby', { dance: dance.id }); } });
  const safety = (e) => menu(e.currentTarget.getBoundingClientRect(), [
    { label: 'Report', icon: 'flag', onClick: () => sheet(ReportSheet, { title: 'Report dance', onSubmit: () => openOnAbstracts(new URL(dance.post?.url ?? dance.url).pathname) }) },
    { label: `Block ${who(dance.creator)}`, icon: 'nosign', role: 'destructive', onClick: () => confirmDialog({ title: `Block ${who(dance.creator)}?`, message: 'You won’t see their dances or comments. If you share a party, they are removed from it.', actions: [{ label: 'Block', role: 'destructive', onClick: () => block(dance.creator.handle) }, { label: 'Cancel', role: 'cancel' }] }) },
  ]);
  return html`<div class="detail">
    <img class="fill" src=${dance.thumbnail} alt="" style=${p.ready ? 'opacity:0' : ''} />
    <video class="fill" ref=${video} src=${dance.video} playsinline loop muted preload="auto" crossorigin="anonymous"></video>
    ${p.failure ? html`<div class="glass-surface col" style="position:absolute;left:24px;right:24px;top:40%;padding:20px;gap:12px;align-items:center;border-radius:20px"><span class="headline">Couldn't play video</span><span class="subheadline">${p.failure}</span><${Button} label="Retry" onClick=${loadFeed} /></div>`
      : !p.ready && html`<div class="loading-pill glass"><${Spinner} />Loading video</div>`}
    <${NavBar} overlay onBack=${nav.pop} />
    <div class="chrome">
      <div class="row" style="align-items:flex-end">
        <div class="col" style="gap:10px;flex:1;min-width:0">
          <button class="row" style="gap:8px" onClick=${() => dance.creator.handle && nav.push('profile', { handle: dance.creator.handle })}><${Avatar} user=${dance.creator} size=${34} /><span class="subheadline semibold">${who(dance.creator)}</span></button>
          <span class="title semibold" style="text-shadow:0 1px 8px rgba(0,0,0,0.5)">${dance.title}</span>
        </div>
        <div class="rail-right">
          <${Button} disabled=${likeBusy} onClick=${guarded(() => toggleLike(dance))} aria=${liked ? 'Unlike' : 'Like'}>${likeBusy ? html`<${Spinner} size=${18} />` : html`<${Icon} name=${liked ? 'heart.fill' : 'heart'} />`}${compact(dance.likes)}</${Button}>
          <${Button} icon="bubble.right" label=${compact(dance.comments)} onClick=${() => nav.push('comments', { id: dance.id })} />
          <${Button} icon="square.and.arrow.up" iconOnly label="Share" onClick=${() => shareDance(dance)} />
          <${Button} icon="bookmark" iconOnly label="Save" onClick=${guarded(async () => { await ensureViewer(); await bridge.call('save', { item: dance.itemKey, saved: true }); toast('Saved'); })} />
          <button class="glass circle44" aria-label=${p.muted ? 'Unmute video' : 'Mute video'} onClick=${p.toggleMuted}><${Icon} name=${p.muted ? 'speaker.slash.fill' : 'speaker.wave.2.fill'} /></button>
          ${dance.creator.handle && viewer?.username !== dance.creator.handle && html`<button class="glass circle44" aria-label="More" onClick=${safety}><${Icon} name="ellipsis" /></button>`}
        </div>
      </div>
      <div class="bar glass">
        <button class="col" style="gap:2px;flex:1;min-width:0;text-align:left" onClick=${() => nav.push('song', { id: dance.id })}>
          <span class="row subheadline semibold" style="gap:6px"><${Icon} name="music.note" /><span class="line1">${dance.song.title}</span></span>
          <span class="caption secondary line1">${dance.song.artist}</span></button>
        <${Button} style="glassProminent" size="large" icon="play.fill" label="Play" onClick=${choose} />
      </div>
    </div>
  </div>`;
};

const PlayModeSheet = ({ onSolo, onParty, close }) => html`<div class="col" style="gap:16px">
  <div class="title2 semibold center">How do you want to play?</div>
  <${Button} style="glassProminent" size="large" full icon="person" label="Solo" onClick=${() => { close(); onSolo(); }} />
  <${Button} size="large" full icon="person.2" label="With friends" onClick=${() => { close(); onParty(); }} />
</div>`;
