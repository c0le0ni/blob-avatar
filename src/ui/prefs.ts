// Settings kept on this device: the stage (follow the cursor, react to clicks, the
// export's background, a still preview) and the export options. The theme keeps its own key,
// which the page reads before it paints (public/theme-init.js).

import { useSyncExternalStore } from 'react';

export interface Store<T> {
  get: () => T;
  set: (patch: Partial<T>) => void;
  subscribe: (f: () => void) => () => void;
  /** the value in a component, which renders again when it changes */
  use: () => T;
}

/**
 * A small store of settings under one localStorage key. Only what the person set is
 * saved; everything else follows the defaults, so a default that comes from the
 * device (reduced motion) keeps following it. What is read back goes through
 * `validate`, which keeps only well formed values.
 */
export function createStore<T extends object>(key: string, defaults: T, validate: (raw: Record<string, unknown>) => Partial<T>): Store<T> {
  let own: Partial<T> = {};
  try {
    const raw = JSON.parse(localStorage.getItem(key) || 'null') as unknown;
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) own = validate(raw as Record<string, unknown>);
  } catch {}
  let value: T = { ...defaults, ...own };
  const listeners = new Set<() => void>();
  const get = () => value;
  const subscribe = (f: () => void) => {
    listeners.add(f);
    return () => void listeners.delete(f);
  };
  return {
    get,
    subscribe,
    set(patch) {
      own = { ...own, ...patch };
      value = { ...defaults, ...own };
      try {
        localStorage.setItem(key, JSON.stringify(own));
      } catch {}
      listeners.forEach((f) => f());
    },
    use: () => useSyncExternalStore(subscribe, get),
  };
}

/** the keys whose stored value has the same type as the default: the first pass of a validate */
export function sameTypes<T extends object>(defaults: T, raw: Record<string, unknown>): Partial<T> {
  const out: Partial<T> = {};
  for (const k of Object.keys(defaults) as (keyof T & string)[]) if (typeof raw[k] === typeof defaults[k]) out[k] = raw[k] as T[typeof k];
  return out;
}

// ---------------------------------------------------------------- the editor's settings

export const SIZES = ['256', '512', '1024'] as const;

export interface Settings {
  /** the stage's eyes follow the cursor, and the embed code asks for it (gaze) */
  follow: boolean;
  /** a click on the stage plays the embed's reaction, and the embed code asks for it (reaction) */
  react: boolean;
  /** the stage shows the export's background and round crop */
  showBg: boolean;
  /** the stage holds the rest pose */
  still: boolean;
  /** export size: one of SIZES, or 'custom' for the typed one */
  size: string;
  custom: string;
  /** export on a solid background, in this color */
  bg: boolean;
  bgColor: string;
  /** export cut to a circle */
  round: boolean;
}

const KEY = 'coleoni-blob.settings';
const reducedMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const DEFAULTS: Settings = { follow: false, react: false, showBg: false, still: reducedMotion, size: '512', custom: '', bg: false, bgColor: '#ffffff', round: false };

function validate(raw: Record<string, unknown>): Partial<Settings> {
  const s = sameTypes(DEFAULTS, raw);
  if (s.size !== undefined && s.size !== 'custom' && !(SIZES as readonly string[]).includes(s.size)) delete s.size;
  if (s.custom !== undefined && !/^\d{0,4}$/.test(s.custom)) delete s.custom;
  if (s.bgColor !== undefined && !/^#[0-9a-f]{6}$/i.test(s.bgColor)) delete s.bgColor;
  return s;
}

// the export options had a key of their own before the settings came
try {
  const old = localStorage.getItem('coleoni-blob.export');
  if (old !== null) {
    if (localStorage.getItem(KEY) === null) localStorage.setItem(KEY, old);
    localStorage.removeItem('coleoni-blob.export');
  }
} catch {}

export const settings = createStore<Settings>(KEY, DEFAULTS, validate);
