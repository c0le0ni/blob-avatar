// Undo and redo, as plain values: what was, what is and what was undone. Edits
// that come in a stream (a color dragged across the picker, a clip stretched)
// share a key, and pushes with the same key close together make one step, so one
// undo takes back the whole gesture.

export interface History<T> {
  past: T[];
  present: T;
  future: T[];
  /** the key of the last push and when it came, to fold the next one into it */
  key: string | null;
  at: number;
}

/** steps kept behind the present */
export const LIMIT = 100;

/** pushes with the same key closer than this make one step */
export const COALESCE_MS = 700;

let gestures = 0;

/**
 * A key for one gesture (a press, a drag): every push it makes is one step however
 * long it lasts, and the next gesture is a step of its own, even right after.
 */
export const gestureKey = (name: string) => `${name}#${++gestures}`;

const isGesture = (key: string) => key.includes('#');

export const createHistory = <T>(present: T): History<T> => ({ past: [], present, future: [], key: null, at: 0 });

export function push<T>(h: History<T>, next: T, key: string | null = null, now = Date.now()): History<T> {
  if (next === h.present) return h;
  const fold = key !== null && key === h.key && (isGesture(key) || now - h.at < COALESCE_MS);
  if (fold) return { ...h, present: next, future: [], at: now };
  const past = h.past.length >= LIMIT ? [...h.past.slice(h.past.length - LIMIT + 1), h.present] : [...h.past, h.present];
  return { past, present: next, future: [], key, at: now };
}

export function undo<T>(h: History<T>): History<T> {
  if (!h.past.length) return h;
  return { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future], key: null, at: 0 };
}

export function redo<T>(h: History<T>): History<T> {
  if (!h.future.length) return h;
  return { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1), key: null, at: 0 };
}
