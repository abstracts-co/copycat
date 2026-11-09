import { html, useStore, compact } from '../lib.js';
import { Icon } from '../icons.js';
import { Button, Wordmark, Avatar, Media, SectionHeading, ProgressView, Empty, who } from '../ui.js';
import { store, nav, homeModel, loadFeed } from '../data/store.js';
import { openNotifications, createDance, addFriend } from './actions.js';

export const HomeView = () => {
  const feed = useStore(store, (s) => s.feed);
  const home = homeModel(feed.dances);
  let body;
  if (feed.loading && !home.featured) body = html`<div style="padding-top:80px"><${ProgressView} label="Loading dances" /></div>`;
  else if (feed.error && !home.featured) body = html`<${Empty} icon="wifi.exclamationmark" title="Couldn't load dances" message=${feed.error}><${Button} label="Retry" size="large" full onClick=${loadFeed} /></${Empty}>`;
  else if (home.featured) body = html`<div class="col" style="gap:8px;padding:4px 20px 16px">
      <${Featured} dance=${home.featured} />
      <div style="height:8px"></div>
      <${SectionHeading} title="Trending sounds" action="See all" onTap=${() => nav.push('sounds')} />
      <${SoundRail} sounds=${home.trendingSounds} />
      <div style="height:8px"></div>
      <${SectionHeading} title="Popular dances" action="See all" onTap=${() => nav.push('dances')} />
      <${DanceRail} dances=${home.popularDances} showsLikes />
    </div>`;
  else body = html`<${Empty} icon="play.square" title="Make the first move" message="Create a dance or add a friend to play together.">
      <${Button} style="glassProminent" size="large" full label="Create a dance" onClick=${createDance} />
      <${Button} size="large" full icon="person.badge.plus" label="Add a friend" onClick=${addFriend} /></${Empty}>`;
  return html`<div class="home-header"><${Wordmark} size=${26} /><div class="spacer"></div><${Button} icon="bell" iconOnly label="Notifications" tint="tinted" onClick=${openNotifications} /></div>
    <div class="scroll">${body}<div class="tab-bottom-pad"></div></div>`;
};

const Featured = ({ dance }) => html`<button class="featured" onClick=${() => nav.push('dance', { id: dance.id })}>
  <${Media} src=${dance.thumbnail} style="position:absolute;inset:0" />
  <div class="shade"></div>
  <div class="info">
    <span class="caption2 semibold" style="letter-spacing:2px">TRENDING</span>
    <span class="title2 bold line3">${dance.title}</span>
    <span class="row caption" style="gap:5px"><${Avatar} user=${dance.creator} size=${20} />${who(dance.creator)}</span>
    <span class="row caption muted" style="gap:4px"><${Icon} name="music.note" /><span class="line1">${dance.song.title}</span></span>
    <span class="caption semibold">♡ ${compact(dance.likes)}</span>
  </div>
  <span class="join">Join <${Icon} name="arrow.right" /></span>
</button>`;

export const DanceRail = ({ dances, showsLikes }) => html`<div class="rail">${dances.map((d) => html`<div class="dance-tile">
  <button onClick=${() => (showsLikes ? nav.push('dance', { id: d.id }) : nav.push('song', { id: d.id }))} aria-label=${d.title}>
    <${Media} src=${d.thumbnail}>${showsLikes && html`<span class="likes">♡ ${compact(d.likes)}</span>`}</${Media}></button>
  <span class="caption semibold line1">${showsLikes ? d.title : d.song.title}</span>
  <span class="caption2 muted line1">${showsLikes ? who(d.creator) : d.song.artist}</span>
  <button class="play" onClick=${() => nav.push('solo', { id: d.id })} aria-label=${`Play ${d.title}`}><${Icon} name="play.fill" />Play</button>
</div>`)}</div>`;

export const SoundRail = ({ sounds }) => html`<div class="rail" style="gap:12px">${sounds.map((d) => html`<button class="sound-tile" onClick=${() => nav.push('song', { id: d.id })} aria-label=${`${d.song.title}, ${d.song.artist}`}>
  <${Media} src=${d.song.artwork}>${!d.song.artwork && html`<${Icon} name="music.note" size=${26} />`}</${Media}>
  <span class="caption semibold line1">${d.song.title}</span>
  <span class="caption2 muted line1">${d.song.artist}</span>
</button>`)}</div>`;
