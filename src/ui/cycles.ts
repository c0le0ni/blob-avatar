// Cycles: the animations in order. A few ready-made ones (templates) are built in;
// the person's own cycles are kept on this device, and the one on screen travels in
// the link. Editing a template makes a new cycle of the person's, so a template is
// never lost. Plain functions on plain values: the editor (editor.ts) keeps them,
// with undo.

import { DEFAULT_CYCLE, DEFAULT_DUR, MAX_CLIPS, SHOW_AT, type Anim, type Clip } from '../engine';

/** the template with every animation once, the one a new page opens with */
export const ALL = 'all';
/** the choice in the cycle menu that starts a new cycle */
export const NEW = 'new';

export interface SavedCycle {
  id: string;
  /** shown as "Cycle n" in the page's language, unless the person named it */
  n: number;
  name?: string;
  clips: Clip[];
}

export type TemplateKey = 'all' | 'hello' | 'notify' | 'thinking' | 'sleepy' | 'show';

export interface Template {
  /** template ids have a colon, which the person's ids (uid) never do; "all" is older than that */
  id: string;
  key: TemplateKey;
  clips: Clip[];
}

const clip = (anim: Anim, dur = DEFAULT_DUR[anim]): Clip => ({ anim, dur });

/** the ready-made cycles, in the menu's order; every one but "all" fits a light GIF (under 10 s) */
export const TEMPLATES: readonly Template[] = [
  { id: ALL, key: 'all', clips: DEFAULT_CYCLE },
  { id: 'tpl:hello', key: 'hello', clips: [clip('idle', 1.6), clip('wink', 1.4), clip('idle', 1.2), clip('wide', 1.8)] },
  { id: 'tpl:notify', key: 'notify', clips: [clip('idle', 1.6), clip('notification'), clip('alert'), clip('exclaim', 1.6)] },
  { id: 'tpl:thinking', key: 'thinking', clips: [clip('idle', 1.4), clip('thinking'), clip('wide', 1.4), clip('exclaim', 1.6)] },
  { id: 'tpl:sleepy', key: 'sleepy', clips: [clip('idle', 2.4), clip('sleep', 4.8)] },
  { id: 'tpl:show', key: 'show', clips: [clip('play', 1.8), clip('orbit', 3), clip('comet', 2.2), clip('burst')] },
];

export const templateOf = (id: string) => TEMPLATES.find((t) => t.id === id) ?? null;

export const NAME_MAX = 40;

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
  if (!clips[i] || !Number.isFinite(d) || clips[i].dur === d) return clips;
  return clips.map((c, k) => (k === i ? { ...c, dur: d } : c));
}

/** the last animation stays: a cycle is never empty */
export const removeClip = (clips: Clip[], i: number): Clip[] => (clips.length > 1 && clips[i] ? clips.filter((_, k) => k !== i) : clips);

/** an animation at its usual length, at `at` (0 puts it first, the length last); never past the limit */
export function insertClip(clips: Clip[], at: number, anim: Anim): Clip[] {
  if (clips.length >= MAX_CLIPS) return clips;
  const i = Math.max(0, Math.min(clips.length, Math.round(at)));
  return [...clips.slice(0, i), clip(anim), ...clips.slice(i)];
}

export const addClip = (clips: Clip[], anim: Anim): Clip[] => insertClip(clips, clips.length, anim);

/** a copy of a clip right after it, same length */
export function duplicateClip(clips: Clip[], i: number): Clip[] {
  if (clips.length >= MAX_CLIPS || !clips[i]) return clips;
  return [...clips.slice(0, i + 1), { ...clips[i] }, ...clips.slice(i + 1)];
}

/** how far into a clip it shows what it does (as its thumbnail does), past the 0.3 s crossfade from the clip before */
export const tellingMoment = (c: Clip) => Math.min(c.dur - 0.05, Math.max(0.3, c.dur * SHOW_AT[c.anim]));

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

/** a name as typed: trimmed, one line, not too long; empty means "Cycle n" again */
export function cleanName(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const s = v.replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
  return s || undefined;
}

/** the person's cycles as stored, keeping only what is well formed (cycles saved before names have none) */
export function parseSaved(raw: unknown): SavedCycle[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((c): c is SavedCycle => c && typeof c.id === 'string' && Number.isInteger(c.n) && validClips(c.clips))
    .map((c) => {
      const name = cleanName(c.name);
      return { id: c.id, n: c.n, ...(name ? { name } : {}), clips: c.clips.map((k) => ({ anim: k.anim, dur: clampDur(k.dur) })) };
    });
}

export const uid = () => Math.random().toString(36).slice(2, 10);

/** the person's cycles, and the one on screen (a template's id, or one of theirs) */
export interface Book {
  saved: SavedCycle[];
  active: string;
}

/** which cycle a cycle on screen is: a template first, then one of the person's, or a new one of theirs */
export function bookFor(saved: SavedCycle[], cycle: Clip[], newId = uid): Book {
  const tpl = TEMPLATES.find((t) => sameClips(t.clips, cycle));
  if (tpl) return { saved, active: tpl.id };
  const hit = saved.find((c) => sameClips(c.clips, cycle));
  if (hit) return { saved, active: hit.id };
  const fresh = { id: newId(), n: nextNumber(saved), clips: cycle.map((c) => ({ ...c })) };
  return { saved: [...saved, fresh], active: fresh.id };
}

/** the cycle on screen changed: the person's cycle follows, and a template turns into a new cycle of theirs */
export function withClips(b: Book, clips: Clip[], newId = uid): Book {
  if (b.saved.some((c) => c.id === b.active)) return { ...b, saved: b.saved.map((c) => (c.id === b.active ? { ...c, clips } : c)) };
  const fresh = { id: newId(), n: nextNumber(b.saved), clips };
  return { saved: [...b.saved, fresh], active: fresh.id };
}

/** pick a cycle (NEW starts one with a single idle clip): the book, and the clips to put on screen */
export function pickCycle(b: Book, id: string, newId = uid): { book: Book; clips: Clip[] } | null {
  if (id === NEW) {
    const fresh = { id: newId(), n: nextNumber(b.saved), clips: [clip('idle')] };
    return { book: { saved: [...b.saved, fresh], active: fresh.id }, clips: fresh.clips };
  }
  const clips = templateOf(id)?.clips ?? b.saved.find((c) => c.id === id)?.clips;
  return clips ? { book: { ...b, active: id }, clips } : null;
}

/** delete one of the person's cycles; when it is the one on screen, "every animation" comes back */
export function dropCycle(b: Book, id = b.active): { book: Book; clips: Clip[] | null } {
  if (!b.saved.some((c) => c.id === id)) return { book: b, clips: null };
  const saved = b.saved.filter((c) => c.id !== id);
  return id === b.active ? { book: { saved, active: ALL }, clips: DEFAULT_CYCLE } : { book: { ...b, saved }, clips: null };
}

/** give one of the person's cycles a name (an empty one goes back to "Cycle n") */
export function renameCycle(b: Book, id: string, name: string): Book {
  const clean = cleanName(name);
  const at = b.saved.find((c) => c.id === id);
  if (!at || at.name === clean) return b;
  return {
    ...b,
    saved: b.saved.map((c) => {
      if (c.id !== id) return c;
      const { id: cid, n, clips } = c;
      return clean ? { id: cid, n, name: clean, clips } : { id: cid, n, clips };
    }),
  };
}

/** a copy of a cycle (a template or one of the person's) as a new cycle of theirs, on screen */
export function copyCycle(b: Book, id: string, name?: string, newId = uid): { book: Book; clips: Clip[] } | null {
  const clips = templateOf(id)?.clips ?? b.saved.find((c) => c.id === id)?.clips;
  if (!clips) return null;
  const clean = cleanName(name);
  const fresh: SavedCycle = { id: newId(), n: nextNumber(b.saved), ...(clean ? { name: clean } : {}), clips: clips.map((c) => ({ ...c })) };
  // the copy goes right after what it copies
  const at = b.saved.findIndex((c) => c.id === id);
  const saved = at < 0 ? [...b.saved, fresh] : [...b.saved.slice(0, at + 1), fresh, ...b.saved.slice(at + 1)];
  return { book: { saved, active: fresh.id }, clips: fresh.clips };
}
