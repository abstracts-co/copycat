import { html, useStore, useEffect, useRef, useState, clock } from '../lib.js';
import { Icon } from '../icons.js';
import { Button, Media, NavBar, SectionHeading, ProgressView, who } from '../ui.js';
import { store, nav, homeModel, dancesFor } from '../data/store.js';
import { findDance } from './dance.js';

export const SongPageView = ({ params }) => {
  useStore(store, (s) => s.feed);
  const anchor = findDance(params.id), song = anchor?.song;
  const audio = useRef(null), [playing, setPlaying] = useState(false), [elapsed, setElapsed] = useState(0), [duration, setDuration] = useState(song?.duration ?? 0), [loading, setLoading] = useState(true), [error, setError] = useState(null);
  useEffect(() => {
    if (song?.youtube || !song?.url) { setLoading(false); setError(song?.source === 'file' ? 'This song came from the dancer’s device.' : null); return; }
    const a = new Audio(song.url); audio.current = a;
    a.addEventListener('loadedmetadata', () => { setDuration(a.duration); setLoading(false); });
    a.addEventListener('timeupdate', () => setElapsed(a.currentTime));
    a.addEventListener('play', () => setPlaying(true)); a.addEventListener('pause', () => setPlaying(false));
    a.addEventListener('error', () => { setLoading(false); setError('The original track won’t play right now.'); });
    return () => a.pause();
  }, [song?.url]);
  if (!song) return html`<${NavBar} title="Sound" onBack=${nav.pop} />`;
  const dances = dancesFor(song);
  return html`<${NavBar} title="Sound" onBack=${nav.pop} />
  <div class="scroll"><div class="col" style="gap:24px;padding:20px">
    <div class="row" style="gap:20px">
      ${song.artwork ? html`<${Media} src=${song.artwork} style="width:104px;height:104px;border-radius:24px;flex:none" />` : html`<span class="glass-surface" style="width:104px;height:104px;border-radius:24px;display:grid;place-items:center;flex:none"><${Icon} name="music.note" size=${34} /></span>`}
      <div class="col" style="gap:6px;min-width:0"><span class="title2 semibold">${song.title}</span><span class="secondary">${song.artist}</span>
        ${song.license && html`<a class="caption secondary" href=${song.licenseUrl || song.page} target="_blank" rel="noopener">${song.license}</a>`}</div>
    </div>
    ${song.youtube ? html`<iframe class="yt-embed" src=${`https://www.youtube.com/embed/${song.youtube}?playsinline=1&rel=0${song.segment ? `&start=${Math.floor(song.segment[0])}` : ''}`} title=${song.title} allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>` : html`    <div class="row" style="gap:16px">
      <${Button} style="glassProminent" size="large" iconOnly icon=${playing ? 'pause.fill' : 'play.fill'} label=${playing ? 'Pause' : 'Play'} disabled=${loading || !duration} onClick=${() => { const a = audio.current; if (!a) return; if (a.paused) { if (a.currentTime < 1 && song.segment) a.currentTime = song.segment[0]; a.play(); } else a.pause(); }} />
      <input type="range" min="0" max=${Math.max(0.1, duration)} step="0.1" value=${elapsed} disabled=${loading || !duration} style="flex:1;accent-color:var(--accent)" onInput=${(e) => { if (audio.current) audio.current.currentTime = Number(e.target.value); }} aria-label="Position" />
      <span class="caption mono secondary">${duration ? clock(duration) : '0:30'}</span>
    </div>`}
    ${loading && song.url && html`<${ProgressView} label="Loading original track" />`}
    ${error && html`<p class="footnote secondary">${error}</p>`}
    <${SectionHeading} title="Top dances" />
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px">${dances.map((d) => html`<button class="col" style="gap:6px;text-align:left" onClick=${() => nav.push('dance', { id: d.id })}>
      <${Media} src=${d.thumbnail} style="aspect-ratio:9/16;border-radius:16px" /><span class="caption semibold line2">${d.title}</span><span class="caption2 secondary line1">${who(d.creator)}</span></button>`)}</div>
    <${Button} style="glassProminent" size="large" full icon="video" label="Use this sound" onClick=${() => { audio.current?.pause(); nav.push('create', { song }); }} />
  </div></div>`;
};

export const SoundsView = () => {
  const feed = useStore(store, (s) => s.feed);
  const sounds = homeModel(feed.dances).trendingSounds;
  return html`<${NavBar} title="Sounds" onBack=${nav.pop} /><div class="scroll"><div class="inset-list" style="margin:16px">
    ${sounds.map((d) => html`<button style="text-align:left;width:100%" onClick=${() => nav.push('song', { id: d.id })}><div class="col"><span>${d.song.title}</span><span class="caption secondary">${d.song.artist}</span></div></button>`)}
  </div></div>`;
};

export const DanceHubView = () => {
  const feed = useStore(store, (s) => s.feed);
  return html`<${NavBar} title="Dances" onBack=${nav.pop} /><div class="scroll"><div class="grid2" style="padding:20px">
    ${homeModel(feed.dances).popularDances.map((d) => html`<button class="col" style="gap:6px;text-align:left" onClick=${() => nav.push('dance', { id: d.id })}>
      <${Media} src=${d.thumbnail} style="aspect-ratio:9/16;border-radius:14px" /><span class="headline line1">${d.title}</span><span class="caption muted">${who(d.creator)}</span></button>`)}
  </div></div>`;
};
