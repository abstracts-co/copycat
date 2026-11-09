import { html, useStore, useEffect, useState } from '../lib.js';
import { Icon } from '../icons.js';
import { Button, Wordmark, Avatar, Spinner } from '../ui.js';
import { store, ensureViewer, setPref } from '../data/store.js';
import { bridge } from '../data/bridge.js';
import { openOnAbstracts } from './actions.js';

/** CopycatSignInView: abstracts is the account, so one button replaces Apple, Google and email. */
export const SignInView = () => {
  const [busy, setBusy] = useState(false), [error, setError] = useState(null), [step, setStep] = useState('signin');
  const go = async () => {
    setBusy(true); setError(null);
    try { await ensureViewer(); setStep('onboarding'); }
    catch (e) {
      if (e.code === 'signed_out') { await bridge.call('signIn').catch(() => {}); }
      else if (e.code === 'unsupported') store.set({ browsing: true });
      else if (e.code !== 'denied' && e.code !== 'cancelled') setError(e.message);
    } finally { setBusy(false); }
  };
  if (step === 'onboarding') return html`<${OnboardingView} />`;
  return html`<div class="screen" style="padding:28px;padding-bottom:calc(44px + var(--safe-bottom));padding-top:calc(36px + var(--safe-top));gap:20px">
    <div class="center"><${Wordmark} size=${40} /></div>
    <div class="spacer"></div>
    <div class="col center" style="gap:12px"><span class="largeTitle semibold" style="letter-spacing:-0.7px">Make your move.</span>
      <span class="title3 secondary" style="line-height:29px">Create dances. Follow your friends.<br />Play together.</span></div>
    <div class="spacer"></div>
    <span class="headline center">Sign up or sign in</span>
    <div class="col" style="gap:12px">
      <button class="glassProminent white size-large full" style="height:54px" disabled=${busy} onClick=${go}>${busy ? html`<${Spinner} />` : html`<span style="font-weight:600">Continue with abstracts</span>`}</button>
      <${Button} size="large" full label="Look around first" onClick=${() => store.set({ browsing: true })} />
    </div>
    ${error && html`<p class="footnote secondary center">${error}</p>`}
    <div class="row footnote" style="gap:16px;justify-content:center"><button class="accent" onClick=${() => openOnAbstracts('/privacy')}>Privacy Policy</button><button class="accent" onClick=${() => openOnAbstracts(`/a/${store.get().community}`)}>Support</button></div>
  </div>`;
};

const perm = async (name) => { try { return (await navigator.permissions.query({ name })).state; } catch { return 'prompt'; } };

/** Post sign-in onboarding: your profile, then camera, microphone and where your music comes from. */
export const OnboardingView = () => {
  const viewer = useStore(store, (s) => s.viewer), source = useStore(store, (s) => s.musicSource);
  const [step, setStep] = useState(0), [camera, setCamera] = useState('prompt'), [mic, setMic] = useState('prompt');
  const refresh = async () => { const c = await perm('camera'), m = await perm('microphone'); if (c !== 'prompt') setCamera(c); if (m !== 'prompt') setMic(m); };
  useEffect(() => { refresh(); }, []);
  const request = async (kind) => {
    const set = kind === 'camera' ? setCamera : setMic;
    try { const s = await navigator.mediaDevices.getUserMedia(kind === 'camera' ? { video: true } : { audio: true }); s.getTracks().forEach((t) => t.stop()); set('granted'); }
    catch (e) { set(e?.name === 'NotAllowedError' ? 'denied' : 'prompt'); }
  };
  const done = () => { setPref('onboarded', true); };
  const canFinish = camera === 'granted' && mic === 'granted' && !!source;
  const access = (title, icon, detail, state, onAllow) => html`<div>
    <span style=${`width:40px;height:40px;border-radius:50%;display:grid;place-items:center;flex:none;${state === 'granted' ? 'background:var(--accent);color:#000' : 'background:rgba(255,255,255,0.1)'}`}><${Icon} name=${icon} /></span>
    <span class="col spacer" style="gap:2px"><span class="semibold">${title}</span><span class="footnote secondary">${detail}</span></span>
    ${state === 'granted' ? html`<span class="accent" aria-label=${`${title} allowed`} style="min-width:44px;display:grid;place-items:center"><${Icon} name="checkmark" /></span>`
      : state === 'denied' ? html`<span class="footnote secondary" style="max-width:110px;text-align:right">Allow it in your browser settings</span>`
      : html`<${Button} style="glassProminent" label="Allow" onClick=${onAllow} />`}</div>`;
  const provider = (key, title, icon) => html`<button style="width:100%;text-align:left" onClick=${() => setPref('musicSource', key)}>
    <span style=${`width:40px;height:40px;border-radius:50%;display:grid;place-items:center;flex:none;${source === key ? 'background:var(--accent);color:#000' : 'background:rgba(255,255,255,0.1)'}`}><${Icon} name=${icon} /></span>
    <span class="semibold spacer">${title}</span>${source === key ? html`<span class="accent" style="min-width:44px;display:grid;place-items:center"><${Icon} name="checkmark" /></span>` : html`<span class="subheadline semibold accent">Connect</span>`}</button>`;
  return html`<div class="screen">
    <div class="scroll"><div class="col" style="gap:28px;padding:calc(20px + var(--safe-top)) 24px 12px">
      <div class="row" style="gap:6px;width:160px;margin:0 auto" aria-label=${`Step ${step + 1} of 2`}>${[0, 1].map((i) => html`<span style=${`flex:1;height:3px;border-radius:2px;background:${i <= step ? 'var(--accent)' : 'rgba(255,255,255,0.14)'}`}></span>`)}</div>
      <div class="col center" style="gap:8px"><span class="largeTitle semibold" style="letter-spacing:-0.7px">${step === 0 ? 'Make it yours.' : 'Set the stage.'}</span>
        <span class="title3 secondary" style="line-height:28px">${step === 0 ? 'This is how friends find you and see you in parties.' : 'Copycat needs your camera and mic to record. Pick where your music comes from.'}</span></div>
      ${step === 0 ? html`<div class="col" style="gap:24px;align-items:center">
          <span style="position:relative"><${Avatar} user=${viewer} size=${120} /><button onClick=${() => openOnAbstracts('/settings')} aria-label="Change profile photo" style="position:absolute;right:0;bottom:0;width:32px;height:32px;border-radius:50%;background:var(--accent);color:#000;display:grid;place-items:center;box-shadow:0 0 0 3px #000"><${Icon} name="pencil" size=${14} /></button></span>
          <div class="glass-surface form-group" style="width:100%">
            <div class="form-row"><label>Name</label><span>${viewer?.name ?? ''}</span></div>
            <div class="form-row"><label>Username</label><span><span class="secondary">@</span>${viewer?.username ?? ''}</span></div>
          </div></div>`
      : html`<div class="col" style="gap:20px">
          <div class="inset-list glass-surface" style="border-radius:22px">
            ${access('Camera', 'camera.fill', 'Records your dance and follows your moves.', camera, () => request('camera'))}
            ${access('Microphone', 'mic.fill', 'Talk with friends in parties.', mic, () => request('microphone'))}
          </div>
          <span class="caption semibold secondary center" style="letter-spacing:1.5px">MUSIC</span>
          <div class="inset-list glass-surface" style="border-radius:22px">
            ${provider('openverse', 'Free music', 'music.note')}
            ${provider('files', 'Your song files', 'waveform')}
          </div>
          <p class="footnote secondary center"><${Icon} name="lock" /> Tracking runs on your device. Your camera is never uploaded.</p>
        </div>`}
    </div></div>
    <div style="padding:12px 24px calc(12px + var(--safe-bottom));background:#000">
      ${step === 0 ? html`<${Button} style="glassProminent" size="large" full label="Continue" onClick=${() => setStep(1)} />`
        : html`<${Button} style="glassProminent" size="large" full label="Start dancing" disabled=${!canFinish} onClick=${done} />`}
    </div></div>`;
};
