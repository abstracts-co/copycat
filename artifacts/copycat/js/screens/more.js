import { html, useStore, useEffect, useState } from '../lib.js';
import { Icon } from '../icons.js';
import { Button, NavBar, ProgressView, Empty, Spinner, toast } from '../ui.js';
import { store, nav, loadComments, ensureViewer, setPref } from '../data/store.js';
import { bridge } from '../data/bridge.js';
import { findDance } from './dance.js';
import { guarded, openOnAbstracts, joinParty } from './actions.js';

export const CommentsView = ({ params }) => {
  const dance = findDance(params.id), c = useStore(store, (s) => s.comments[params.id]);
  const [text, setText] = useState(''), [posting, setPosting] = useState(false);
  useEffect(() => { if (dance) loadComments(dance); }, [params.id]);
  const post = guarded(async () => {
    if (!dance.post) throw new Error('This dance has no post to reply to yet.');
    setPosting(true);
    try { await ensureViewer(); await bridge.call('reply', { post: dance.post.number, text: text.trim() }); setText(''); dance.comments += 1; loadComments(dance); }
    finally { setPosting(false); }
  });
  const items = c?.items ?? [];
  return html`<${NavBar} title="Comments" onBack=${nav.pop} />
  ${c?.error && html`<div class="col" style="gap:8px;padding:16px;align-items:center"><span class="subheadline">${c.error}</span><${Button} label="Retry loading comments" onClick=${() => loadComments(dance)} /></div>`}
  <div class="scroll">${c?.loading && !items.length ? html`<div style="padding-top:60px"><${ProgressView} label="Loading comments" /></div>`
    : !items.length && !c?.error ? html`<${Empty} icon="bubble.right" title="No comments yet" />`
    : html`<div class="inset-list" style="margin:16px">${items.map((r) => html`<div class="col" style="align-items:flex-start;gap:6px"><span class="headline">${r.author}</span><span>${r.body}</span></div>`)}</div>`}</div>
  <form class="row" style="gap:8px;padding:12px 16px calc(12px + var(--safe-bottom))" onSubmit=${(e) => { e.preventDefault(); if (text.trim()) post(); }}>
    <div class="textfield" style="flex:1"><input placeholder="Add a comment" value=${text} maxlength="500" onInput=${(e) => setText(e.target.value)} aria-label="Add a comment" /></div>
    <button type="submit" class="accent semibold" style="min-width:44px;min-height:44px" disabled=${!text.trim() || posting}>${posting ? html`<${Spinner} />` : 'Post'}</button>
  </form>`;
};

export const ReportSheet = ({ title, onSubmit, close }) => {
  const reasons = ['Nudity or sexual content', 'Harassment or bullying', 'Hate or violence', 'Spam', 'Copyright', 'Something else'];
  const [reason, setReason] = useState(null);
  return html`<div class="row" style="margin-bottom:12px"><${Button} label="Cancel" onClick=${close} /><span class="headline spacer center">${title}</span><${Button} style="glassProminent" label="Submit" disabled=${!reason} onClick=${() => { close(); onSubmit(reason); toast('Opening abstracts to send your report'); }} /></div>
    <div class="inset-list">${reasons.map((r) => html`<button style="width:100%;text-align:left" onClick=${() => setReason(r)}><span class="spacer">${r}</span>${reason === r && html`<${Icon} name="checkmark" class="accent" />`}</button>`)}</div>`;
};

export const SettingsView = () => {
  const viewer = useStore(store, (s) => s.viewer), opacity = useStore(store, (s) => s.ghostOpacity), seconds = useStore(store, (s) => s.countdown);
  return html`<${NavBar} title="Settings" onBack=${nav.pop} />
  <div class="scroll"><div style="padding:0 16px 40px">
    <div class="list-header">Account</div>
    <div class="inset-list">
      <div><span class="spacer">Signed in as</span><span class="secondary">${viewer ? `@${viewer.username}` : 'Not signed in'}</span></div>
      <button style="width:100%;text-align:left" onClick=${() => openOnAbstracts('/settings')}><span class="spacer">Abstracts account</span><${Icon} name="chevron.right" class="secondary" /></button>
    </div>
    <div class="list-header">Play</div>
    <div class="inset-list">
      <div><span class="spacer">Ghost opacity</span><input type="range" min="0" max="1" step="0.05" value=${opacity} style="width:140px;accent-color:var(--accent)" onInput=${(e) => setPref('ghostOpacity', Number(e.target.value))} aria-label="Ghost opacity" /></div>
      <div><span class="spacer">Countdown</span>${[3, 5, 10].map((n) => html`<button class=${seconds === n ? 'glassProminent size-small' : 'glass size-small'} onClick=${() => setPref('countdown', n)}>${n}s</button>`)}</div>
      <button style="width:100%;text-align:left" onClick=${joinParty}><span class="spacer accent">Join a party</span></button>
    </div>
    <div class="list-header">About</div>
    <div class="inset-list">
      <button style="width:100%;text-align:left" onClick=${() => openOnAbstracts('/privacy')}><span class="spacer accent">Privacy Policy</span></button>
      <button style="width:100%;text-align:left" onClick=${() => openOnAbstracts(`/a/${store.get().community}`)}><span class="spacer accent">Support</span></button>
    </div>
    <p class="footnote secondary" style="padding:8px 16px">Pose tracking runs on your device with MediaPipe. Your camera is never uploaded; only dances you publish leave your device.</p>
  </div></div>`;
};
