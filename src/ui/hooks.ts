// The app's small shared state outside the editor: the theme and the notices.

import { useCallback, useSyncExternalStore } from 'react';
import { resolved, setTheme, themePref, watchSystem, type ThemePref } from '../app/theme';

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

/** the theme on screen, the choice behind it (system, light or dark), and ways to change it */
export function useTheme() {
  const theme = useSyncExternalStore(themeStore.subscribe, themeStore.get);
  const pref = useSyncExternalStore(themeStore.subscribe, themePref);
  const setPref = useCallback((p: ThemePref) => {
    setTheme(p);
    themeStore.emit();
  }, []);
  const toggle = useCallback(() => setPref(resolved() === 'light' ? 'dark' : 'light'), [setPref]);
  return { theme, toggle, pref, setPref };
}

// ---------------------------------------------------------------- notices

export interface Notice {
  id: number;
  text: string;
  /** a button in the notice ("Undo"); a notice with one stays longer */
  action?: { label: string; run: () => void };
}

let notice: Notice | null = null;
let noticeId = 0;
let noticeTimer = 0;
const noticeListeners = new Set<() => void>();

export function dismiss() {
  clearTimeout(noticeTimer);
  if (!notice) return;
  notice = null;
  noticeListeners.forEach((f) => f());
}

/** keep the notice up while the pointer or the focus is on it, and let it go after */
export function holdNotice(on: boolean) {
  clearTimeout(noticeTimer);
  if (!on && notice) noticeTimer = window.setTimeout(dismiss, notice.action ? 5000 : 2200);
}

/** a short notice at the bottom of the page ("Link copied"), with an optional button */
export function toast(text: string, action?: Notice['action']) {
  notice = { id: ++noticeId, text, action };
  noticeListeners.forEach((f) => f());
  holdNotice(false);
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
