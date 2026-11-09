import { h, render, Fragment } from 'https://cdn.jsdelivr.net/npm/preact@10.27.0/+esm';
import { useState, useEffect, useRef, useMemo, useCallback, useLayoutEffect, useReducer } from 'https://cdn.jsdelivr.net/npm/preact@10.27.0/hooks/+esm';
import htm from 'https://cdn.jsdelivr.net/npm/htm@3.1.1/+esm';

export const html = htm.bind(h);
export { h, render, Fragment, useState, useEffect, useRef, useMemo, useCallback, useLayoutEffect, useReducer };

/** A tiny observable store: components re-render when a key they read changes. */
export const createStore = (initial) => {
  let state = initial;
  const listeners = new Set();
  return {
    get: () => state,
    set: (patch) => { state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) }; listeners.forEach((l) => l(state)); },
    subscribe: (l) => { listeners.add(l); return () => listeners.delete(l); },
  };
};
export const useStore = (store, pick = (s) => s) => {
  const [, force] = useReducer((n) => n + 1, 0);
  const last = useRef(pick(store.get()));
  useEffect(() => store.subscribe((s) => { const next = pick(s); if (next !== last.current) { last.current = next; force(); } }), [store]);
  last.current = pick(store.get());
  return last.current;
};

export const cls = (...parts) => parts.filter(Boolean).join(' ');
export const clock = (s) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, '0')}`;
export const clockTenths = (s) => { const v = Math.max(0, s); return `${Math.floor(v / 60)}:${(v % 60).toFixed(1).padStart(4, '0')}`; };
export const compact = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, '')}M` : n >= 1e3 ? `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1).replace(/\.0$/, '')}K` : String(n ?? 0));
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export const storage = {
  get(k, d) { try { const v = localStorage.getItem(`copycat:${k}`); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(`copycat:${k}`, JSON.stringify(v)); return true; } catch { return false; } },
};
