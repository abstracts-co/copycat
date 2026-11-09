import { html, render, useStore, cls } from './lib.js';
import { Icon } from './icons.js';
import { Overlays } from './ui.js';
import { store, nav, loadFeed } from './data/store.js';
import { bridge } from './data/bridge.js';
import { HomeView } from './screens/home.js';
import { PlayHubView } from './screens/playhub.js';
import { ProfileView, EditProfileView } from './screens/profile.js';
import { DanceDetailView } from './screens/dance.js';
import { SongPageView, SoundsView, DanceHubView } from './screens/song.js';
import { MusicPickerView } from './screens/picker.js';
import { RecordingFlow, PlayingFlow } from './screens/gameplay.js';
import { ReviewView } from './screens/review.js';
import { CommentsView, SettingsView } from './screens/more.js';
import { SignInView, OnboardingView } from './screens/signin.js';
import { LobbyView, JoinView } from './screens/lobby.js';

const ROUTES = {
  dance: DanceDetailView, song: SongPageView, sounds: SoundsView, dances: DanceHubView, profile: ProfileView, editProfile: EditProfileView,
  music: MusicPickerView, create: RecordingFlow, solo: PlayingFlow, review: ReviewView, comments: CommentsView, settings: SettingsView,
  lobby: LobbyView, join: JoinView, onboarding: OnboardingView,
};
const TABS = [['home', 'Home', 'house', 'house.fill'], ['dance', 'Play', 'play.fill', 'play.fill'], ['profile', 'Profile', 'person.crop.circle', 'person.crop.circle.fill']];

const Root = () => {
  const tab = useStore(store, (s) => s.tab);
  const covered = useStore(store, (s) => s.stack.length > 0);
  const viewer = useStore(store, (s) => s.viewer);
  return html`<div class=${cls('screen', covered && 'covered')} style=${covered ? '' : 'animation:none'}>
    <div class="tab-pane" hidden=${tab !== 'home'}><${HomeView} /></div>
    <div class="tab-pane" hidden=${tab !== 'dance'}>${tab === 'dance' && !covered && html`<${PlayHubView} />`}</div>
    <div class="tab-pane" hidden=${tab !== 'profile'}><${ProfileView} params=${{ handle: viewer?.username, own: true }} root /></div>
    <nav class="tabbar glass" aria-label="Tabs">${TABS.map(([k, label, icon, on]) => html`<button class=${cls('tab', tab === k && 'on')} aria-current=${tab === k ? 'page' : undefined} onClick=${() => nav.tab(k)}><${Icon} name=${tab === k ? on : icon} />${label}</button>`)}</nav>
  </div>`;
};

const App = () => {
  const stack = useStore(store, (s) => s.stack);
  const entered = useStore(store, (s) => s.onboarded || s.browsing);
  if (!entered) return html`<${SignInView} /><${Overlays} />`;
  return html`<div class="stack">
    <${Root} />
    ${stack.map((r, i) => { const View = ROUTES[r.name]; return html`<div key=${r.id} class=${cls('screen', 'push-in', i < stack.length - 1 && 'covered')}><${View} params=${r.params} /></div>`; })}
  </div><${Overlays} />`;
};

const layout = () => {
  const root = document.documentElement;
  if (window.parent === window) return;
  const report = () => {
    if (!root.classList.contains('content-mode')) return;
    const w = document.body.clientWidth, h = Math.round(Math.min(900, Math.max(620, w * 16 / 9)));
    root.style.setProperty('--app-h', `${h}px`);
    window.parent.postMessage({ abstractsHeight: h }, '*');
  };
  root.classList.add('content-mode');
  addEventListener('message', (e) => {
    if (e.source !== window.parent) return;
    if (e.data?.abstractsLayout === 'viewport') { root.classList.remove('content-mode'); window.parent.postMessage({ abstractsLayout: 'viewport' }, '*'); }
    if (e.data?.abstractsLayout === 'content') { root.classList.add('content-mode'); report(); }
  });
  window.parent.postMessage({ abstractsLayout: 'request' }, '*');
  new ResizeObserver(report).observe(document.body);
  report();
};

const start = async () => {
  layout();
  const focus = document.querySelector('meta[name="copycat-dance"]')?.content;
  render(html`<${App} />`, document.getElementById('app'));
  const info = await bridge.hello;
  if (info?.community) store.set({ community: info.community });
  await loadFeed();
  const launch = info?.launch ?? Object.fromEntries(new URLSearchParams(location.search));
  if (launch.room) { store.set({ browsing: true }); nav.push('lobby', { room: launch.room.toUpperCase() }); }
  else if (focus || launch.dance) {
    const id = launch.dance ?? info?.artifact;
    const d = store.get().feed.dances.find((x) => x.id === id);
    if (d) { store.set({ browsing: true }); nav.push('dance', { id: d.id }); }
  }
};
start();
