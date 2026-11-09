import { html, useStore, useEffect, useState, useRef, clock, clockTenths } from '../lib.js';
import { Icon } from '../icons.js';
import { Button, Media, NavBar, ProgressView, TrimStrip, Spinner } from '../ui.js';
import { store, nav, homeModel } from '../data/store.js';
import { preview, importedSong, searchApple } from '../engine/music.js';

const STARTER = new URL('../../library/music.json', import.meta.url);
let starter = null;
const loadStarter = () => (starter ??= fetch(STARTER).then((r) => r.json()).then((p) => p.tracks.map((t) => ({ ...t, id: t.url }))).catch(() => []));

const usePreview = () => { const [s, set] = useState(preview.state); useEffect(() => preview.subscribe(set), []); return s; };

/**
 * Find your sound: search Apple's catalog as you type or import a song file, trim the clip,
 * preview it on a loop and use it. Replaces the iPhone picker's Apple Music and Spotify catalogs.
 */
export const MusicPicker = ({ asSheet, onUse, close }) => {
  const feed = useStore(store, (s) => s.feed), packs = useStore(store, (s) => s.packs);
  const [query, setQuery] = useState(''), [results, setResults] = useState([]), [loading, setLoading] = useState(false), [error, setError] = useState(null);
  const [candidate, setCandidate] = useState(null), [start, setStart] = useState(0), [end, setEnd] = useState(30), [starterTracks, setStarter] = useState([]);
  const resume = useRef(false), file = useRef(null), latest = useRef(''), p = usePreview();
  const typed = query.trim();
  useEffect(() => {
    if (!typed) { latest.current = ''; setResults([]); setLoading(false); return; }
    const t = setTimeout(() => search(typed), 250);
    return () => clearTimeout(t);
  }, [typed]);
  useEffect(() => { loadStarter().then(setStarter); return () => preview.stop(); }, []);
  const trending = [...homeModel(feed.dances).trendingSounds.map((d) => d.song), ...packs.flatMap((p) => p.tracks), ...starterTracks].filter((s, i, a) => s.url && a.findIndex((x) => x.url === s.url) === i);
  const show = (song, f = null, autoplay = true) => {
    preview.stop(); setCandidate({ song, file: f });
    const s0 = song.segment ? song.segment[0] : 0, e0 = Math.min(s0 + 30, song.duration || 30);
    setStart(s0); setEnd(e0);
    if (autoplay) preview.play(song, s0, e0 - s0, f).then(() => {
      const d = preview.clock?.song === song && !song.duration ? preview.clock.duration : 0;
      if (d) { setCandidate({ song: { ...song, duration: d }, file: f }); setEnd(Math.min(s0 + 30, d)); }
    });
  };
  const search = async (text = query) => {
    const q = text.trim();
    if (!q || q === latest.current) return;
    latest.current = q; setLoading(true); setError(null);
    try { const songs = await searchApple(q); if (latest.current === q) setResults(songs); }
    catch (e) { if (latest.current === q) setError(e.message); }
    finally { if (latest.current === q) setLoading(false); }
  };
  const importFile = () => file.current.click();
  const onFile = async () => { const f = file.current.files[0]; if (!f) return; try { const { song, file: fl } = await importedSong(f); show(song, fl); } catch (e) { setError(e.message); } };
  const use = () => { preview.stop(); onUse({ song: candidate.song, file: candidate.file, start, length: end - start }); close?.(); };
  const row = (s) => html`<button class="row" style="gap:12px;width:100%;min-height:44px;padding:10px 0;text-align:left" onClick=${() => show(s)}>
    <${Cover} song=${s} /><div class="col" style="gap:4px;min-width:0;flex:1"><span class="line1">${s.title}</span><span class="caption secondary line1">${[s.artist, s.license || (s.youtube && 'YouTube')].filter(Boolean).join(' · ')}</span></div></button>`;
  const importBtn = html`<${Button} icon="square.and.arrow.down" iconOnly label="Import an audio file" onClick=${importFile} />`;
  return html`${asSheet ? html`<div class="row" style="height:56px;gap:8px;margin-top:-8px"><span class="headline spacer">Select song</span>${importBtn}<${Button} label="Done" onClick=${close} /></div>`
      : html`<${NavBar} title="Find your sound" onBack=${nav.pop} right=${importBtn} />`}
    <input type="file" accept="audio/*" hidden ref=${file} onChange=${onFile} />
    <div class=${asSheet ? '' : 'scroll'}><div class="col" style=${`gap:16px;${asSheet ? '' : 'padding:20px'}`}>
      <form class="textfield" onSubmit=${(e) => { e.preventDefault(); search(); }}>
        <input type="search" placeholder="Search songs" value=${query} onInput=${(e) => { setQuery(e.target.value); setError(null); }} enterkeyhint="search" autocapitalize="off" autocorrect="off" autocomplete="off" aria-label="Search songs" />
        <button type="submit" class="accent" style="min-width:44px;min-height:44px" disabled=${!query.trim()}>Search</button></form>
      ${loading && !results.length && html`<${ProgressView} label="Searching" />`}
      ${error && html`<p class="footnote" style="color:#ff9f0a">${error}</p>`}
      ${candidate && html`<div class="col" style="gap:10px;padding:16px;border-radius:18px;background:rgba(255,255,255,0.04)">
        <div class="row" style="gap:12px"><${Cover} song=${candidate.song} />
          <div class="col" style="gap:4px;flex:1;min-width:0"><span class="headline line1">${candidate.song.title}</span><span class="caption secondary line1">${candidate.song.source === 'file' ? `Imported audio · ${clock(candidate.song.duration)}` : [candidate.song.artist, candidate.song.license].filter(Boolean).join(' · ')}</span></div>
          <button class="glassProminent" style="width:44px;height:44px;border-radius:50%" aria-label=${p.loading ? 'Loading preview' : p.playing ? 'Pause preview' : 'Play selected clip'} disabled=${p.loading} onClick=${() => (p.playing ? preview.pause() : preview.play(candidate.song, start, end - start, candidate.file))}>
            ${p.loading ? html`<${Spinner} size=${18} />` : html`<${Icon} name=${p.playing ? 'pause.fill' : 'play.fill'} />`}</button></div>
        <${TrimStrip} duration=${candidate.song.duration || 30} start=${start} end=${end} playhead=${p.position} onChange=${(s, e) => { setStart(s); setEnd(e); }}
          onEditing=${(on) => { if (on) { resume.current = p.playing || p.loading; preview.stop(); } else if (resume.current) { resume.current = false; preview.play(candidate.song, start, end - start, candidate.file); } }} />
        <div class="row caption mono"><span>${clockTenths(start)}</span><span class="spacer center secondary">${clockTenths(end - start)} clip</span><span>${clockTenths(end)}</span></div>
        <${Button} style="glassProminent" size="large" full label="Use this song" disabled=${p.loading} onClick=${use} />
      </div>`}
      ${!query.trim() && !candidate && html`<span class="headline">Trending sounds</span>${trending.length ? html`<div class="col">${trending.map(row)}</div>` : html`<p class="secondary">Search for a song or import an audio file.</p>`}`}
      ${typed && html`<div class="col">${results.map(row)}</div>`}
      <p class="footnote secondary">Songs are 30-second previews from Apple Music. Imported files post with your dance, so upload only music you made or that’s free to share.</p>
    </div></div>`;
};

const Cover = ({ song }) => (song.artwork ? html`<${Media} src=${song.artwork} style="width:48px;height:48px;border-radius:10px;flex:none" />`
  : html`<span style="width:48px;height:48px;border-radius:10px;flex:none;display:grid;place-items:center;background:var(--surface);color:var(--secondary)"><${Icon} name=${song.source === 'file' ? 'waveform' : 'music.note'} /></span>`);

export const MusicPickerView = ({ params }) => html`<${MusicPicker} onUse=${(choice) => { nav.pop(); params?.onUse?.(choice); }} />`;
