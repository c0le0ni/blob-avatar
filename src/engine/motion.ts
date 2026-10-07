// Motion over time: the cycle (animations in sequence, crossfading at the seams) and
// the life underneath (breathing, glances, blinks). Everything is a pure function of
// time and seed, and every period is fitted to the cycle's length so exports loop.

import { clipPose, rest, type PartSpec, type Pose, type TrailSpec } from './animations';
import type { Expression } from './face';
import { lerp, mod, smooth } from './math';
import { hash } from './prng';
import type { Figure } from './shapes';
import { loopLength, type BlobState } from './state';

export interface Motion extends Omit<Pose, 'expr' | 'exprW' | 'fig' | 'figW'> {
  exprs: { expr: Expression; w: number }[];
  figs: { fig: Figure; w: number }[];
}

const NUMERIC = ['tx', 'ty', 'sx', 'sy', 'scale', 'rot', 'anchor', 'wob', 'wobK', 'wobP', 'lookX', 'lookY', 'lookW', 'open', 'openL', 'openR', 'eyeScale', 'eyeAlpha'] as const;

const XFADE = 0.3;

/** a period close to `p` that fits a whole number of times in the loop */
export const fit = (p: number, loop: number) => (loop > 0 ? loop / Math.max(1, Math.round(loop / p)) : p);

const fade = <T extends { alpha: number }>(list: T[], w: number) => list.map((x) => ({ ...x, alpha: x.alpha * w }));

function toMotion(p: Pose, w = 1): Motion {
  const { expr, exprW, fig, figW, ...rest } = p;
  return {
    ...rest,
    exprs: expr ? [{ expr, w: exprW * w }] : [],
    figs: fig ? [{ fig, w: figW * w }] : [],
    parts: fade<PartSpec>(p.parts, w),
    trails: fade<TrailSpec>(p.trails, w),
  };
}

/** the cycle at time t (any t: it loops) */
export function sequenceAt(state: BlobState, t: number): Motion {
  const seq = state.cycle.length ? state.cycle : [{ anim: 'idle' as const, dur: 2.4 }];
  const L = loopLength({ ...state, cycle: seq });
  const local = mod(t, L);
  let start = 0;
  let i = 0;
  while (i < seq.length - 1 && local >= start + seq[i].dur) start += seq[i++].dur;
  const tau = local - start;
  const cur = clipPose(seq[i].anim, tau, seq[i].dur, state.seed + i * 101);
  if (seq.length < 2 || tau >= XFADE) return toMotion(cur);
  // crossfade from where the previous animation ended
  const j = (i - 1 + seq.length) % seq.length;
  const prev = clipPose(seq[j].anim, seq[j].dur, seq[j].dur, state.seed + j * 101);
  const w = smooth(tau / XFADE);
  const out = toMotion(cur, w);
  for (const k of NUMERIC) out[k] = lerp(prev[k], cur[k], w);
  const before = toMotion(prev, 1 - w);
  out.exprs = [...before.exprs, ...out.exprs];
  out.figs = [...before.figs, ...out.figs];
  out.parts = [...before.parts, ...out.parts];
  out.trails = [...before.trails, ...out.trails];
  return out;
}

/** breathing: a slow squash and stretch */
export function breath(t: number, loop: number) {
  const b = Math.sin((2 * Math.PI * t) / fit(3.2, loop));
  return { sx: 1 - 0.012 * b, sy: 1 + 0.018 * b };
}

/** when nobody drives the gaze: short glances at seeded spots, often back to the start */
export function idleGaze(t: number, seed: number, loop: number): [number, number] {
  const seg = fit(2.6, loop);
  const k = Math.floor(t / seg);
  const target = (n: number): [number, number] => {
    const k2 = Math.floor(mod(n, Math.max(1, Math.round(loop / seg)) || 1e9));
    if (hash(seed, k2 * 3 + 11) < 0.45) return [0, 0];
    return [(hash(seed, k2 * 3 + 12) * 2 - 1) * 0.6, (hash(seed, k2 * 3 + 13) * 2 - 1) * 0.3];
  };
  const a = target(k - 1);
  const b = target(k);
  const u = smooth((t - k * seg) / 0.35);
  return [lerp(a[0], b[0], u), lerp(a[1], b[1], u)];
}

/** eye openness from blinks: one per window, sometimes two, at seeded moments */
export function blink(t: number, seed: number, loop: number): number {
  const win = fit(3.6, loop);
  const k = Math.floor(t / win);
  const kk = Math.floor(mod(k, Math.max(1, Math.round(loop / win)) || 1e9));
  const offset = 0.3 + hash(seed, kk + 7) * (win - 0.9);
  const local = t - k * win;
  const one = (at: number) => {
    const u = (local - at) / 0.16;
    return u > 0 && u < 1 ? Math.sin(Math.PI * u) : 0;
  };
  let shut = one(offset);
  if (hash(seed, kk + 77) < 0.2) shut = Math.max(shut, one(offset + 0.26));
  return 1 - shut;
}

export { rest };
