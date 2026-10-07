// Cycles: the animations in order. "All animations" is built in; the person's own
// cycles are kept on this device, and the one on screen travels in the link.
// Editing the built-in one makes a new cycle of the person's, so it is never lost.

import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_CYCLE, DEFAULT_DUR, MAX_CLIPS, type Anim, type BlobState, type Clip } from '../engine';
import type { Edit } from './hooks';

const KEY = 'coleoni-blob.cycles';
export const ALL = 'all';

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

function load(): SavedCycle[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '[]') as unknown;
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((c): c is SavedCycle => c && typeof c.id === 'string' && Number.isInteger(c.n) && validClips(c.clips))
      .map((c) => ({ id: c.id, n: c.n, clips: c.clips.map((k) => ({ anim: k.anim, dur: clampDur(k.dur) })) }));
  } catch {
    return [];
  }
}

const uid = () => Math.random().toString(36).slice(2, 10);

interface Book {
  saved: SavedCycle[];
  active: string;
}

/** which cycle the link opened: the built-in one, one of the person's, or a new one of theirs */
function open(cycle: Clip[]): Book {
  const saved = load();
  if (sameClips(cycle, DEFAULT_CYCLE)) return { saved, active: ALL };
  const hit = saved.find((c) => sameClips(c.clips, cycle));
  if (hit) return { saved, active: hit.id };
  const fresh = { id: uid(), n: nextNumber(saved), clips: cycle };
  return { saved: [...saved, fresh], active: fresh.id };
}

export function useCycles(state: BlobState, edit: Edit) {
  const [book, setBook] = useState<Book>(() => open(state.cycle));

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(book.saved));
    } catch {}
  }, [book.saved]);

  /** change the cycle on screen; the built-in one turns into a new cycle of the person's */
  const change = useCallback(
    (f: (clips: Clip[]) => Clip[]) => {
      const next = f(state.cycle);
      if (next === state.cycle) return;
      edit((s) => (s.cycle = next.map((c) => ({ ...c }))));
      setBook((b) => {
        if (b.saved.some((c) => c.id === b.active)) return { ...b, saved: b.saved.map((c) => (c.id === b.active ? { ...c, clips: next } : c)) };
        const fresh = { id: uid(), n: nextNumber(b.saved), clips: next };
        return { saved: [...b.saved, fresh], active: fresh.id };
      });
    },
    [state.cycle, edit],
  );

  const select = useCallback(
    (id: string) => {
      if (id === 'new') {
        const fresh = { id: uid(), n: nextNumber(book.saved), clips: [{ anim: 'idle' as const, dur: DEFAULT_DUR.idle }] };
        setBook((b) => ({ saved: [...b.saved, fresh], active: fresh.id }));
        edit((s) => (s.cycle = fresh.clips.map((c) => ({ ...c }))));
        return;
      }
      const clips = id === ALL ? DEFAULT_CYCLE : book.saved.find((c) => c.id === id)?.clips;
      if (!clips) return;
      setBook((b) => ({ ...b, active: id }));
      edit((s) => (s.cycle = clips.map((c) => ({ ...c }))));
    },
    [book.saved, edit],
  );

  const remove = useCallback(() => {
    setBook((b) => ({ saved: b.saved.filter((c) => c.id !== b.active), active: ALL }));
    edit((s) => (s.cycle = DEFAULT_CYCLE.map((c) => ({ ...c }))));
  }, [edit]);

  return { saved: book.saved, active: book.active, change, select, remove };
}

export type Cycles = ReturnType<typeof useCycles>;
