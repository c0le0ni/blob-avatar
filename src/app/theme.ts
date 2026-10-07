// The theme: dark (the default) or light. The choice is "system", "light" or "dark";
// "system" follows the device and changes with it.

export type ThemePref = 'system' | 'light' | 'dark';

const KEY = 'coleoni-blob.theme';
const media = matchMedia('(prefers-color-scheme: light)');

export function themePref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'light' || v === 'dark') return v;
  } catch {}
  return 'system';
}

export const resolved = (pref = themePref()): 'light' | 'dark' => (pref === 'light' || (pref === 'system' && media.matches) ? 'light' : 'dark');

function apply(pref: ThemePref) {
  const root = document.documentElement;
  if (resolved(pref) === 'light') root.dataset.theme = 'light';
  else delete root.dataset.theme;
}

export function setTheme(pref: ThemePref) {
  try {
    if (pref === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, pref);
  } catch {}
  // a soft crossfade between the two, where the browser can do it
  const doc = document as Document & { startViewTransition?: (f: () => void) => void };
  if (doc.startViewTransition && !matchMedia('(prefers-reduced-motion: reduce)').matches) doc.startViewTransition(() => apply(pref));
  else apply(pref);
}

/** keep "system" in step with the device */
export function watchSystem(onChange: () => void) {
  media.addEventListener('change', () => {
    if (themePref() === 'system') {
      apply('system');
      onChange();
    }
  });
}
