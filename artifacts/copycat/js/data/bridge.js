/** Talks to the abstracts.co page hosting this artifact (see docs/plans/artifact-platform.md in abstracts.co). */
const pending = new Map();
let seq = 0;
const embedded = (() => { try { return window.parent !== window; } catch { return true; } })();

addEventListener('message', (e) => {
  if (e.source !== window.parent) return;
  const m = e.data;
  if (m?.abstracts === 'result' && pending.has(m.id)) {
    const { resolve, reject } = pending.get(m.id);
    pending.delete(m.id);
    if (m.ok) resolve(m.value); else reject(Object.assign(new Error(m.error?.message || 'That didn’t work.'), { code: m.error?.code || 'failed' }));
  }
});

const call = (method, params = {}, timeout = 0) => new Promise((resolve, reject) => {
  if (!embedded) { reject(Object.assign(new Error('Open Copycat on abstracts.co to do this.'), { code: 'unsupported' })); return; }
  const id = `c${++seq}`;
  pending.set(id, { resolve, reject });
  window.parent.postMessage({ abstracts: 'call', id, method, params }, '*');
  if (timeout) setTimeout(() => { if (pending.delete(id)) reject(Object.assign(new Error('No answer from abstracts.co.'), { code: 'unsupported' })); }, timeout);
});

export const bridge = {
  info: null,
  hello: null,
  get available() { return !!this.info; },
  call,
};
bridge.hello = call('hello', {}, 1500).then((v) => { bridge.info = v; return v; }).catch(() => null);
