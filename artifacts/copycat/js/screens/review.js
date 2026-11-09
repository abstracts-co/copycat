import { html, useEffect, useRef, useState, clockTenths } from '../lib.js';
import { Icon } from '../icons.js';
import { Button, NavBar, TrimStrip, Spinner, alertDialog, toast } from '../ui.js';
import { nav } from '../data/store.js';
import { publish, drafts, tags } from '../data/publish.js';

/** Preview your dance: watch it, name it, trim the clip, then keep a draft or publish. */
export const ReviewView = ({ params }) => {
  const { result, choice, privacy } = params;
  const video = useRef(), audio = useRef(null), editing = useRef(false), resume = useRef(false);
  const [title, setTitle] = useState(params.title ?? ''), [hashtags, setHashtags] = useState(params.hashtags ?? '');
  const [start, setStart] = useState(params.trim?.start ?? 0), [end, setEnd] = useState(params.trim?.end ?? result.duration), [playhead, setPlayhead] = useState(0);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(null);
  const url = useRef(URL.createObjectURL(result.video));
  useEffect(() => {
    const v = video.current;
    audio.current = choice.song.url ? new Audio(choice.song.url) : null;
    const a = audio.current;
    const onTime = () => {
      if (editing.current) return;
      setPlayhead(v.currentTime);
      if (v.currentTime >= end - 0.04) { v.currentTime = start; if (a) a.currentTime = choice.start + start; }
      if (a && Math.abs(a.currentTime - (choice.start + v.currentTime)) > 0.15) a.currentTime = choice.start + v.currentTime;
    };
    v.addEventListener('timeupdate', onTime);
    v.addEventListener('playing', () => a?.play().catch(() => {}));
    v.addEventListener('pause', () => a?.pause());
    v.addEventListener('loadeddata', () => { setLoading(false); v.currentTime = start; v.play().catch(() => {}); }, { once: true });
    return () => { v.removeEventListener('timeupdate', onTime); a?.pause(); v.pause(); };
  }, [start, end]);
  useEffect(() => () => URL.revokeObjectURL(url.current), []);
  const onEditing = (on) => {
    const v = video.current; editing.current = on;
    if (on) { resume.current = !v.paused; v.pause(); } else { v.currentTime = start; if (resume.current) v.play(); }
  };
  const onChange = (s, e) => { setStart(s); setEnd(e); const v = video.current; if (editing.current) v.currentTime = Math.abs(s - start) > 0.001 ? s : Math.max(s, e - 0.04); };
  const draft = () => ({ id: params.draftId ?? `d${Date.now()}`, title: title.trim(), hashtags: tags(hashtags), hashtagText: hashtags, choice, privacy, result, trim: { start, end } });
  const keep = async () => { setBusy('draft'); try { await drafts.save(draft()); toast('Draft kept'); nav.home(); } catch (e) { alertDialog({ title: 'Couldn’t keep this draft', message: e.message }); } finally { setBusy(null); } };
  const post = async () => {
    video.current.pause(); setBusy('publish');
    try {
      const r = await publish(draft());
      if (params.draftId) drafts.remove(params.draftId);
      toast(r.downloaded ? 'Downloaded. Post it on a/copycat.' : 'Published');
      nav.home();
    } catch (e) { if (e.code !== 'cancelled') alertDialog({ title: e.code === 'needs_github' ? 'Connect GitHub to publish' : 'Couldn’t publish', message: e.code === 'needs_github' ? 'Dances are Artifacts, and posting one needs a GitHub account connected to abstracts.' : e.message }); }
    finally { setBusy(null); }
  };
  const save = () => { const a = Object.assign(document.createElement('a'), { href: url.current, download: `${title.trim() || 'copycat-dance'}.${result.type.includes('mp4') ? 'mp4' : 'webm'}` }); a.click(); };
  const length = end - start;
  return html`<${NavBar} title="Preview your dance" onBack=${() => { audio.current?.pause(); nav.pop(); }} right=${html`<${Button} icon="square.and.arrow.down" iconOnly label="Save preview" disabled=${loading || length < 0.5} onClick=${save} />`} />
  <div class="scroll"><div class="col" style="gap:20px;padding:0 20px 20px">
    <div style="position:relative;height:320px;border-radius:24px;overflow:hidden;background:#111">
      <video ref=${video} src=${url.current} playsinline muted style="width:100%;height:100%;object-fit:contain"></video>
      ${loading && html`<div class="loading-pill glass"><${Spinner} />Loading preview</div>`}
    </div>
    <div><div class="list-header" style="margin-top:0">Your dance</div><div class="inset-list">
      <div><input style="flex:1;height:28px" placeholder="Name your dance" value=${title} maxlength="80" onInput=${(e) => setTitle(e.target.value)} aria-label="Name your dance" /></div>
      <div><input style="flex:1;height:28px" placeholder="Hashtags" value=${hashtags} autocapitalize="off" onInput=${(e) => setHashtags(e.target.value)} aria-label="Hashtags" /></div></div></div>
    <div><div class="list-header" style="margin-top:0">Clip</div><div class="inset-list"><div class="col" style="align-items:stretch;gap:8px;padding:12px 16px">
      <${TrimStrip} duration=${result.duration} start=${start} end=${end} playhead=${playhead} onChange=${onChange} onEditing=${onEditing} />
      <div class="row caption mono secondary"><span>${clockTenths(start)}</span><span class="spacer center">${clockTenths(length)} selected</span><span>${clockTenths(end)}</span></div></div></div></div>
  </div></div>
  <div class="row" style="gap:12px;padding:12px 20px calc(12px + var(--safe-bottom));background:#000">
    <${Button} size="large" full label="Keep draft" disabled=${!!busy} onClick=${keep} />
    <${Button} style="glassProminent" size="large" full disabled=${!!busy || loading || !title.trim() || length < 0.5} onClick=${post}>${busy === 'publish' ? html`<${Spinner} />` : 'Publish dance'}</${Button}>
  </div>`;
};
