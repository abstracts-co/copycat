import { html, createStore, useStore, useRef, useEffect, useState, cls } from './lib.js';
import { Icon } from './icons.js';

export const Button = ({ style = 'glass', size = 'regular', icon, label, onClick, disabled, iconOnly, full, tint, class: c, children, aria }) => html`
  <button class=${cls(style, `size-${size}`, iconOnly && 'icon-only', full && 'full', tint, c)} onClick=${onClick} disabled=${disabled} aria-label=${aria ?? (iconOnly ? label : undefined)}>
    ${icon && html`<${Icon} name=${icon} />`}${!iconOnly && label}${children}
  </button>`;

export const Wordmark = ({ size = 34 }) => html`<span class="wordmark" role="heading" aria-label="Copycat" style=${`font-size:${size}px;letter-spacing:${-size * 0.02}px`}>copycat</span>`;

export const Avatar = ({ user, size = 34 }) => html`<span class="avatar" style=${`width:${size}px;height:${size}px`}>
  ${user?.avatar ? html`<img src=${user.avatar} alt="" loading="lazy" />` : html`<${Icon} name="person.fill" size=${size * 0.42} />`}</span>`;

export const Media = ({ src, video, class: c, style, children, poster }) => html`<div class=${cls('media', c)} style=${style}>
  ${video ? html`<video src=${video} poster=${poster} muted playsinline loop autoplay preload="metadata"></video>` : src ? html`<img src=${src} alt="" loading="lazy" decoding="async" />` : null}${children}</div>`;

export const SectionHeading = ({ title, action, onTap }) => html`<div class="section-heading"><span class="title3 bold">${title}</span>${onTap && html`<button onClick=${onTap}>${action}</button>`}</div>`;

export const NavBar = ({ title, onBack, right, overlay }) => html`<div class=${cls('navbar', overlay && 'overlay')}>
  <div>${onBack && html`<${Button} icon="chevron.left" iconOnly label="Back" size="regular" onClick=${onBack} />`}</div>
  <div class="nav-title line1">${title}</div>
  <div class="nav-right">${right}</div></div>`;

export const Spinner = ({ size = 20 }) => html`<svg class="spin" width=${size} height=${size} viewBox="0 0 24 24" aria-hidden="true"><g stroke="currentColor" stroke-width="2.2" stroke-linecap="round">${[...Array(8)].map((_, i) => html`<line x1="12" y1="3" x2="12" y2="7" opacity=${0.25 + i * 0.1} transform=${`rotate(${i * 45} 12 12)`} />`)}</g></svg>`;
const style = document.createElement('style');
style.textContent = '.spin{animation:spin 1s steps(8) infinite}@keyframes spin{to{transform:rotate(360deg)}}';
document.head.append(style);

export const ProgressView = ({ label }) => html`<div class="col" style="align-items:center;gap:8px;color:var(--secondary)"><${Spinner} />${label && html`<span class="subheadline">${label}</span>`}</div>`;

export const Empty = ({ icon, title, message, children }) => html`<div class="empty">
  ${icon && html`<span class="glyph"><${Icon} name=${icon} size=${52} /></span>`}
  <div class="title2 bold">${title}</div>${message && html`<div class="subheadline secondary">${message}</div>`}
  ${children && html`<div class="col" style="gap:12px;width:100%;max-width:320px;margin-top:12px">${children}</div>`}</div>`;

// Overlays: sheets, confirmation dialogs, alerts, menus and toasts, presented above whatever screen is showing.
export const overlays = createStore({ list: [], toast: null });
let seq = 0;
export const present = (kind, props) => {
  const id = ++seq;
  overlays.set((s) => ({ list: [...s.list, { id, kind, props }] }));
  return () => overlays.set((s) => ({ list: s.list.filter((o) => o.id !== id) }));
};
export const confirmDialog = ({ title, message, actions }) => present('confirm', { title, message, actions });
export const alertDialog = ({ title, message, actions = [{ label: 'OK', role: 'cancel' }] }) => present('alert', { title, message, actions });
export const sheet = (Content, props = {}, opts = {}) => present('sheet', { Content, props, ...opts });
export const menu = (anchor, items) => present('menu', { anchor, items });
let toastTimer;
export const toast = (text) => { overlays.set({ toast: text }); clearTimeout(toastTimer); toastTimer = setTimeout(() => overlays.set({ toast: null }), 2200); };

const Overlay = ({ o, close }) => {
  const p = o.props;
  if (o.kind === 'sheet') {
    return html`<div class="backdrop" onClick=${p.dismissable === false ? null : close}></div>
      <div class=${cls('sheet', p.tall && 'tall')} role="dialog" aria-modal="true">${p.grabber !== false && html`<div class="grabber"></div>`}<${p.Content} ...${p.props} close=${close} /></div>`;
  }
  if (o.kind === 'confirm') {
    return html`<div class="backdrop" onClick=${close}></div><div class="action-sheet" role="dialog" aria-modal="true">
      <div class="action-group">${(p.title || p.message) && html`<div class="head">${p.title && html`<div class="semibold" style="color:var(--secondary)">${p.title}</div>`}${p.message && html`<div>${p.message}</div>`}</div>`}
        ${p.actions.filter((a) => a.role !== 'cancel').map((a) => html`<button class=${a.role === 'destructive' ? 'destructive' : ''} onClick=${() => { close(); a.onClick?.(); }}>${a.label}</button>`)}</div>
      <div class="action-group"><button class="cancel" onClick=${() => { close(); p.actions.find((a) => a.role === 'cancel')?.onClick?.(); }}>Cancel</button></div></div>`;
  }
  if (o.kind === 'alert') {
    return html`<div class="backdrop"></div><div class="dialog" role="alertdialog" aria-modal="true">
      <div class="headline">${p.title}</div>${p.message && html`<div class="footnote">${p.message}</div>`}
      <div class="row" style="gap:8px;margin-top:6px">${p.actions.map((a) => html`<button class=${cls(a.role === 'cancel' ? 'glass' : a.role === 'destructive' ? 'glass' : 'glassProminent', 'size-large', 'full')} style=${a.role === 'destructive' ? 'color:var(--destructive)' : ''} onClick=${() => { close(); a.onClick?.(); }}>${a.label}</button>`)}</div></div>`;
  }
  if (o.kind === 'menu') {
    const r = p.anchor, root = document.getElementById('app').getBoundingClientRect();
    const left = Math.min(Math.max(8, r.right - root.left - 230), root.width - 238), below = r.bottom - root.top + 8, above = root.bottom - r.top + 8;
    const pos = r.top - root.top > root.height / 2 ? `bottom:${above}px` : `top:${below}px`;
    return html`<div class="backdrop" style="background:transparent" onClick=${close}></div><div class="menu" role="menu" style=${`left:${left}px;${pos}`}>
      ${p.items.map((i) => html`<button role="menuitem" class=${i.role === 'destructive' ? 'destructive' : ''} onClick=${() => { close(); i.onClick(); }}><span>${i.label}</span>${i.checked ? html`<${Icon} name="checkmark" />` : i.icon && html`<${Icon} name=${i.icon} />`}</button>`)}</div>`;
  }
  return null;
};

export const Overlays = () => {
  const { list, toast: t } = useStore(overlays, (s) => s);
  return html`${list.map((o) => html`<${Overlay} key=${o.id} o=${o} close=${() => overlays.set((s) => ({ list: s.list.filter((x) => x.id !== o.id) }))} />`)}
    ${t && html`<div class="toast glass" role="status">${t}</div>`}`;
};

/** The clip editor: a ruler, the selected range with canary handles, and a white playhead. */
export const TrimStrip = ({ duration, start, end, playhead, onChange, onEditing, minimumStart = 0 }) => {
  const ref = useRef(), canvas = useRef(), drag = useRef(null);
  const d = Math.max(duration, 0.001);
  useEffect(() => {
    const c = canvas.current, w = c.clientWidth * devicePixelRatio, hh = 40 * devicePixelRatio;
    c.width = w; c.height = hh;
    const g = c.getContext('2d');
    for (let t = 0; t <= 40; t++) {
      const x = (t / 40) * (w - 1) + 0.5, tall = t % 5 === 0;
      g.strokeStyle = `rgba(255,255,255,${tall ? 0.42 : 0.2})`; g.lineWidth = devicePixelRatio;
      g.beginPath(); g.moveTo(x, (tall ? 7 : 17) * devicePixelRatio); g.lineTo(x, 32 * devicePixelRatio); g.stroke();
    }
  }, []);
  const pos = (s) => `${(Math.min(Math.max(s, 0), d) / d) * 100}%`;
  const seconds = (clientX) => { const r = ref.current.getBoundingClientRect(); return Math.min(Math.max((clientX - r.left) / r.width, 0), 1) * d; };
  const move = (which, value) => {
    const lower = Math.min(d, Math.max(0, minimumStart)), minimum = Math.min(1, d - lower);
    if (which === 'start') { const s = Math.min(Math.max(lower, value), end - minimum); onChange(s, Math.min(end, s + 300)); }
    else { const e = Math.max(start + minimum, Math.min(d, value)); onChange(Math.max(lower, Math.max(start, e - 300)), e); }
  };
  const down = (e) => {
    const s = seconds(e.clientX);
    drag.current = Math.abs(s - start) <= Math.abs(s - end) ? 'start' : 'end';
    ref.current.setPointerCapture(e.pointerId); onEditing?.(true); move(drag.current, s);
  };
  const key = (which) => (e) => { const delta = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : 0; if (delta) { e.preventDefault(); onEditing?.(true); move(which, (which === 'start' ? start : end) + delta); onEditing?.(false); } };
  return html`<div class="trim" ref=${ref} onPointerDown=${down} onPointerMove=${(e) => drag.current && move(drag.current, seconds(e.clientX))} onPointerUp=${() => { drag.current = null; onEditing?.(false); }}>
    <canvas ref=${canvas}></canvas>
    <div class="sel" style=${`left:${pos(start)};width:calc(${pos(end)} - ${pos(start)})`}></div>
    <div class="head" style=${`left:${pos(playhead)}`}></div>
    <div class="handle" tabindex="0" role="slider" aria-label="Clip start" aria-valuenow=${Math.round(start)} style=${`left:${pos(start)}`} onKeyDown=${key('start')}></div>
    <div class="handle" tabindex="0" role="slider" aria-label="Clip end" aria-valuenow=${Math.round(end)} style=${`left:${pos(end)}`} onKeyDown=${key('end')}></div></div>`;
};

export const useNow = (ms = 500) => { const [n, set] = useState(Date.now()); useEffect(() => { const t = setInterval(() => set(Date.now()), ms); return () => clearInterval(t); }, [ms]); return n; };

export const who = (u) => (u?.handle ? `@${u.handle}` : u?.name ?? 'Dancer');
