import { html, useStore, useEffect, useState, compact } from '../lib.js';
import { drafts } from '../data/publish.js';
import { Button, Avatar, Media, NavBar, ProgressView, Empty, confirmDialog, sheet, toast } from '../ui.js';
import { store, nav, profileModel, loadProfile } from '../data/store.js';
import { bridge } from '../data/bridge.js';
import { share, openOnAbstracts, openNotifications, guarded } from './actions.js';
import { ReportSheet } from './more.js';

export const ProfileView = ({ params, root }) => {
  const viewer = useStore(store, (s) => s.viewer);
  const handle = params?.handle ?? (root ? viewer?.username : null);
  const own = root || (!!viewer && viewer.username === handle);
  const version = useStore(store, (s) => s.draftsVersion), [mine, setMine] = useState([]);
  useEffect(() => { if (own) drafts.list().then(setMine); }, [version, own]);
  useStore(store, (s) => s.feed);
  useStore(store, (s) => s.profiles[handle]);
  useEffect(() => { if (handle) loadProfile(handle); }, [handle]);
  if (root && !handle) return html`<${NavBar} title="Profile" right=${html`<${Button} icon="bell" iconOnly label="Notifications" tint="tinted" onClick=${openNotifications} />`} />
    <div class="scroll"><${Empty} icon="person.crop.circle" title="Your profile" message=${bridge.info && !bridge.info.signedIn ? 'Sign in on abstracts to see your profile.' : 'Like, post or join a party and your abstracts profile shows here.'} /></div>`;
  const m = profileModel(handle), u = m.user;

  const ownerControls = html`<div class="row" style="gap:10px">
      <${Button} style="glassProminent" size="large" full class="headline" label="Edit" onClick=${() => nav.push('editProfile')} />
      <${Button} size="large" full icon="gearshape" iconOnly label="Settings" onClick=${() => nav.push('settings')} /></div>`;
  const visitorControls = html`<div class="row" style="gap:12px">
      <${Button} size="large" label="Report" onClick=${() => sheet(ReportSheet, { title: 'Report profile', onSubmit: () => openOnAbstracts(`/u/${u.handle}`) })} />
      <${Button} size="large" label="Block" class="destructive-text" onClick=${() => confirmDialog({ title: `Block @${u.handle}?`, message: 'You won’t see their dances or comments. If you share a party, they are removed from it.', actions: [{ label: 'Block', role: 'destructive', onClick: () => block(u.handle) }, { label: 'Cancel', role: 'cancel' }] })} /></div>`;
  return html`${root ? html`<${NavBar} title="Profile" right=${html`<${Button} icon="bell" iconOnly label="Notifications" tint="tinted" onClick=${openNotifications} />`} />` : html`<${NavBar} title=${`@${u.handle}`} onBack=${nav.pop} />`}
  <div class="scroll"><div class="col" style="gap:24px;padding:16px 20px">
    <div class="row" style="gap:16px">
      <${Avatar} user=${u} size=${80} />
      <div class="col" style="gap:6px;flex:1;min-width:0">
        <div class="row" style="gap:12px"><span class="title3 semibold" style="flex:1">${u.name}</span><${Button} icon="square.and.arrow.up" iconOnly label="Share" onClick=${() => share(u.profile ?? `https://abstracts.co/u/${u.handle}`, `@${u.handle} on Copycat`)} /></div>
        <span class="subheadline muted line1">@${u.handle}</span>
        ${u.bio && html`<span class="subheadline muted line3">${u.bio}</span>`}
      </div>
    </div>
    <div class="stats">${[[m.dances.length, 'Dances'], [m.likes, 'Likes'], [u.rep ?? 0, 'Rep']].map(([v, l]) => html`<div><span class="title3 semibold mono">${compact(v)}</span><span class="caption muted">${l}</span></div>`)}</div>
    ${m.isOwner ? ownerControls : root ? null : visitorControls}
    <div class="grid3">${(own ? mine : []).map((d) => html`<div style="position:relative">
      <${Media} src=${d.coverUrl ??= URL.createObjectURL(d.result.cover)} /><div class="pending" style="border-radius:8px">
        <${Button} size="small" label="Edit draft" onClick=${() => nav.push('review', { result: d.result, choice: d.choice, privacy: d.privacy, title: d.title, hashtags: d.hashtagText, trim: d.trim, draftId: d.id })} />
        <span class="caption2 semibold line2">${d.title || 'Draft'}</span></div></div>`)}${m.dances.map((d) => html`<button onClick=${() => nav.push('dance', { id: d.id })} aria-label=${d.title}><${Media} src=${d.thumbnail} /></button>`)}</div>
    ${!m.dances.length && !mine.length && html`<p class="subheadline secondary center">No dances yet</p>`}
  </div><div class="tab-bottom-pad"></div></div>`;
};

const blocked = new Set(JSON.parse(localStorage.getItem('copycat:blocked') ?? '[]'));
export const block = (handle) => { blocked.add(handle); try { localStorage.setItem('copycat:blocked', JSON.stringify([...blocked])); } catch {} store.set((s) => ({ feed: { ...s.feed, dances: s.feed.dances.filter((d) => d.creator.handle !== handle) } })); toast(`Blocked @${handle}`); nav.pop(); };
export const isBlocked = (handle) => blocked.has(handle);

/** Name, photo and bio live on the member's abstracts profile, so Edit opens it there. */
export const EditProfileView = () => {
  const viewer = useStore(store, (s) => s.viewer);
  return html`<${NavBar} title="Edit profile" onBack=${nav.pop} />
  <div class="scroll"><div class="col" style="gap:20px;padding:20px">
    <div class="glass-surface form-group">
      <div class="form-row" style="gap:16px"><${Avatar} user=${viewer} size=${72} /><span>Change profile photo</span></div>
      <div class="form-row"><label>Name</label><span>${viewer?.name ?? ''}</span></div>
      <div class="form-row"><label>Username</label><span>@${viewer?.username ?? ''}</span></div>
    </div>
    <p class="footnote secondary center">Your Copycat profile is your abstracts profile.</p>
    <${Button} style="glassProminent" size="large" full label="Edit on abstracts" onClick=${() => openOnAbstracts('/settings')} />
  </div></div>`;
};
