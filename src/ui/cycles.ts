// Cycles: the animations in order. "All animations" is built in; the person's own
// cycles are kept on this device, and the one on screen travels in the link.
// Editing the built-in one makes a new cycle of the person's, so it is never lost.
// Plain functions on plain values: the editor (editor.ts) keeps them, with undo.

import { DEFAULT_CYCLE, DEFAULT_DUR, MAX_CLIPS, type Anim, type Clip } from '../engine';

export const ALL = 'all';
/** the choice in the cycle menu that starts a new cycle */
export const NEW = 'new';

export interface SavedCycle {
  id: string;
  /** shown as "Cycle n" in the page's language */
  n: number;
  clips: Clip[];
}

export const clampDur = (v: number) => Math.min(10, Math.max(0.4, Math.round(v * 10) / 10));

export const sameClips = (a: Clip[], b: Clip[]) => a.length === b.length && a.every((c, i) => c.anim === b[i].anim && Math.abs(c.dur - b[i].dur) < 1e-6);

export function moveClip(clips: Clip[], from: number, to: number): Clip[] {
  if (from === to || from < 0 || to < 0 || from >= clips.length || to >= clips.length) return clips;
  const next = [...clips];
  const [c] = next.splice(from, 1);
  next.splice(to, 0, c);
  return next;
}

export function resizeClip(clips: Clip[], i: number, dur: number): Clip[] {
  const d = clampDur(dur);
  if (!clips[i] || clips[i].dur === d) return clips;
  return clips.map((c, k) => (k === i ? { ...c, dur: d } : c));
}

/** the last animation stays: a cycle is never empty */
export const removeClip = (clips: Clip[], i: number): Clip[] => (clips.length > 1 && clips[i] ? clips.filter((_, k) => k !== i) : clips);

export const addClip = (clips: Clip[], anim: Anim): Clip[] => (clips.length >= MAX_CLIPS ? clips : [...clips, { anim, dur: DEFAULT_DUR[anim] }]);

/** the start of each clip, and the cycle's length */
export function starts(clips: Clip[]): { at: number[]; length: number } {
  const at: number[] = [];
  let t = 0;
  for (const c of clips) {
    at.push(t);
    t += c.dur;
  }
  return { at, length: t };
}

export const nextNumber = (saved: SavedCycle[]) => saved.reduce((n, c) => Math.max(n, c.n), 0) + 1;

const validClips = (v: unknown): v is Clip[] =>
  Array.isArray(v) && v.length > 0 && v.length <= MAX_CLIPS && v.every((c) => c && typeof c === 'object' && (c as Clip).anim in DEFAULT_DUR && Number.isFinite((c as Clip).dur));

/** the person's cycles as stored, keeping only what is well formed */
export function parseSaved(raw: unknown): SavedCycle[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((c): c is SavedCycle => c && typeof c.id === 'string' && Number.isInteger(c.n) && validClips(c.clips))
    .map((c) => ({ id: c.id, n: c.n, clips: c.clips.map((k) => ({ anim: k.anim, dur: clampDur(k.dur) })) }));
}

export const uid = () => Math.random().toString(36).slice(2, 10);

/** the person's cycles, and the one on screen (ALL for the built-in one) */
export interface Book {
  saved: SavedCycle[];
  active: string;
}

/** which cycle a cycle on screen is: the built-in one, one of the person's, or a new one of theirs */
export function bookFor(saved: SavedCycle[], cycle: Clip[], newId = uid): Book {
  if (sameClips(cycle, DEFAULT_CYCLE)) return { saved, active: ALL };
  const hit = saved.find((c) => sameClips(c.clips, cycle));
  if (hit) return { saved, active: hit.id };
  const fresh = { id: newId(), n: nextNumber(saved), clips: cycle.map((c) => ({ ...c })) };
  return { saved: [...saved, fresh], active: fresh.id };
}

/** the cycle on screen changed: the person's cycle follows, and the built-in one turns into a new cycle of theirs */
export function withClips(b: Book, clips: Clip[], newId = uid): Book {
  if (b.saved.some((c) => c.id === b.active)) return { ...b, saved: b.saved.map((c) => (c.id === b.active ? { ...c, clips } : c)) };
  const fresh = { id: newId(), n: nextNumber(b.saved), clips };
  return { saved: [...b.saved, fresh], active: fresh.id };
}

/** pick a cycle (NEW starts one with a single idle clip): the book, and the clips to put on screen */
export function pickCycle(b: Book, id: string, newId = uid): { book: Book; clips: Clip[] } | null {
  if (id === NEW) {
    const fresh = { id: newId(), n: nextNumber(b.saved), clips: [{ anim: 'idle' as const, dur: DEFAULT_DUR.idle }] };
    return { book: { saved: [...b.saved, fresh], active: fresh.id }, clips: fresh.clips };
  }
  const clips = id === ALL ? DEFAULT_CYCLE : b.saved.find((c) => c.id === id)?.clips;
  return clips ? { book: { ...b, active: id }, clips } : null;
}

/** delete the cycle on screen: the built-in one comes back */
export const dropCycle = (b: Book): { book: Book; clips: Clip[] } => ({ book: { saved: b.saved.filter((c) => c.id !== b.active), active: ALL }, clips: DEFAULT_CYCLE });
