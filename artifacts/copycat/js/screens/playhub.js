import { html, useEffect, useRef, useState } from '../lib.js';
import { Button, ProgressView } from '../ui.js';
import { openCamera } from '../engine/pose.js';
import { createDance, addFriend, joinParty } from './actions.js';

/** The Play tab is the live selfie camera with the three entry points floating in glass. */
export const PlayHubView = () => {
  const box = useRef(), [state, setState] = useState('opening');
  useEffect(() => {
    let cam, gone = false;
    openCamera().then((c) => { if (gone) { c.stop(); return; } cam = c; c.video.setAttribute('aria-hidden', 'true'); box.current.prepend(c.video); setState('running'); }).catch(() => !gone && setState('unavailable'));
    return () => { gone = true; cam?.stop(); cam?.video.remove(); };
  }, []);
  return html`<div class="play-hub" ref=${box}>
    ${state !== 'running' && html`<div style="position:absolute;top:calc(40px + var(--safe-top));left:0;right:0">${state === 'opening' ? html`<${ProgressView} label="Opening camera…" />` : html`<p class="footnote secondary center">Camera needs attention. Open Create to retry.</p>`}</div>`}
    <div class="shade"></div>
    <div class="actions">
      <${Button} style="glassProminent" size="large" full icon="video.fill" label="Create a dance" onClick=${createDance} />
      <div class="row"><${Button} size="large" icon="person.badge.plus" label="Add friend" onClick=${addFriend} /><${Button} size="large" icon="person.2.fill" label="Join party" onClick=${joinParty} /></div>
    </div>
  </div>`;
};
