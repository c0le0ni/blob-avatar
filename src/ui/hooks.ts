// The app's state: the avatar (kept in the address bar, so the page is always a
// link to it), the theme, and the small notices.

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { DEFAULT_STATE, cloneState, type BlobState } from '../engine';
import { fromHash, toHash } from '../engine/codec';
import { resolved, setTheme, watchSystem } from '../app/theme';

export type Edit = (f: (s: BlobState) => void) => void;

export function useBlob() {
  const [state, setState] = useState<BlobState>(() => (location.hash.length > 1 ? fromHash(location.hash) : cloneState(DEFAULT_STATE)));
  // the avatar the page opened with is already what the address bar says
  const opened = useRef(state);

  useEffect(() => {
    if (state === opened.current) return;
    const id = window.setTimeout(() => history.replaceState(null, '', `#${toHash(state)}`), 150);
    return () => clearTimeout(id);
  }, [state]);

  useEffect(() => {
    const onHash = () => {
      const h = location.hash.slice(1);
      if (h) setState((prev) => (toHash(prev) === h ? prev : fromHash(h)));
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const edit: Edit = useCallback((f) => {
    setState((prev) => {
      const next = cloneState(prev);
      f(next);
      return next;
    });
  }, []);

  return { state, edit };
}

// ---------------------------------------------------------------- theme

const themeListeners = new Set<() => void>();
const themeStore = {
  subscribe(f: () => void) {
    themeListeners.add(f);
    return () => void themeListeners.delete(f);
  },
  get: () => resolved(),
  emit: () => themeListeners.forEach((f) => f()),
};
watchSystem(themeStore.emit);

export function useTheme() {
  const theme = useSyncExternalStore(themeStore.subscribe, themeStore.get);
  const toggle = useCallback(() => {
    setTheme(resolved() === 'light' ? 'dark' : 'light');
    themeStore.emit();
  }, []);
  return { theme, toggle };
}

// ---------------------------------------------------------------- notices

export interface Notice {
  id: number;
  text: string;
}

let notice: Notice | null = null;
let noticeId = 0;
let noticeTimer = 0;
const noticeListeners = new Set<() => void>();

/** a short notice at the bottom of the page ("Link copied") */
export function toast(text: string) {
  notice = { id: ++noticeId, text };
  noticeListeners.forEach((f) => f());
  clearTimeout(noticeTimer);
  noticeTimer = window.setTimeout(() => {
    notice = null;
    noticeListeners.forEach((f) => f());
  }, 2200);
}

export function useNotice() {
  return useSyncExternalStore(
    (f) => {
      noticeListeners.add(f);
      return () => void noticeListeners.delete(f);
    },
    () => notice,
  );
}

