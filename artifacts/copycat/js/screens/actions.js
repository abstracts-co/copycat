import { toast } from '../ui.js';
import { bridge } from '../data/bridge.js';
import { store, nav, ensureViewer, HOST } from '../data/store.js';

const fail = (e) => {
  if (e?.code === 'cancelled' || e?.code === 'denied') return;
  if (e?.code === 'signed_out') { toast('Sign in on abstracts first.'); return; }
  toast(e?.message || 'That didn’t work.');
};
export const guarded = (fn) => async (...args) => { try { await fn(...args); } catch (e) { fail(e); } };

export const openOnAbstracts = guarded(async (path) => {
  await bridge.hello;
  if (bridge.available) await bridge.call('open', { path }); else window.open(`${HOST}${path}`, '_blank', 'noopener');
});
export const openNotifications = () => openOnAbstracts('/alerts');
export const createDance = () => nav.push('create');
export const joinParty = () => nav.push('join');
export const share = guarded(async (url, text) => {
  await bridge.hello;
  if (bridge.available) { const r = await bridge.call('share', { url, text }); if (r && r.shared === false) toast('Link copied'); return; }
  if (navigator.share) await navigator.share({ url, text }).catch(() => {}); else { await navigator.clipboard.writeText(url); toast('Link copied'); }
});
export const addFriend = guarded(async () => {
  const v = await ensureViewer();
  await share(`${HOST}/a/${store.get().community}`, `Dance with me on Copycat. I'm @${v.username}.`);
});
export const danceLink = (d) => d.post?.url ?? d.url ?? `${HOST}/a/${store.get().community}`;
export const shareDance = (d) => share(danceLink(d), `“${d.title}” on Copycat`);
