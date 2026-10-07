// Motion over time: the cycle (animations in sequence, crossfading at the seams) and
// the life underneath (breathing, the head wandering, blinks). Everything is a pure
// function of time and seed, and every period is fitted to the cycle's length so
// exports loop.

import { clipPose, rest, type PartSpec, type Pose, type TrailSpec } from './animations';
import type { Expression, Face } from './face';
import { lerp, mod, TAU } from './math';
import { hash } from './prng';
import type { Figure } from './shapes';
import { loopLength, type BlobState } from './state';

export interface Motion extends Omit<Pose, 'expr' | 'exprW' | 'fig' | 'figW' | 'eyes' | 'eyesW'> {
  exprs: { expr: Expression; w: number }[];
  figs: { fig: Figure; w: number }[];
  faces: { face: Face; w: number }[];
}

const NUMERIC = ['tx', 'ty', 'sx', 'sy', 'scale', 'rot', 'anchor', 'yaw', 'pitch', 'eyeAlpha', 'shut', 'holeX', 'holeY', 'holeR'] as const;

/** how long one animation takes to turn into the next */
const XFADE = 0.3;
/** the turn eases out like a quick spring: most of it in the first tenth of a second */
const xfade = (u: number) => (1 - Math.exp(-u / 0.075)) / (1 - Math.exp(-XFADE / 0.075));

/** a period close to `p` that fits a whole number of times in the loop */
export const fit = (p: number, loop: number) => (loop > 0 ? loop / Math.max(1, Math.round(loop / p)) : p);

const fade = <T extends { alpha: number }>(list: T[], w: number) => list.map((x) => ({ ...x, alpha: x.alpha * w }));

function toMotion(p: Pose, w = 1): Motion {
  const { expr, exprW, fig, figW, eyes, eyesW, ...rest } = p;
  return {
    ...rest,
    exprs: expr ? [{ expr, w: exprW * w }] : [],
    figs: fig ? [{ fig, w: figW * w }] : [],
    faces: eyes ? [{ face: eyes, w: eyesW * w }] : [],
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
  // turn from where the previous animation was when it ended
  const j = (i - 1 + seq.length) % seq.length;
  const prev = clipPose(seq[j].anim, seq[j].dur, seq[j].dur, state.seed + j * 101);
  const w = xfade(tau);
  const out = toMotion(cur, w);
  for (const k of NUMERIC) out[k] = lerp(prev[k], cur[k], w);
  const before = toMotion(prev, 1 - w);
  out.exprs = [...before.exprs, ...out.exprs];
  out.figs = [...before.figs, ...out.figs];
  out.faces = [...before.faces, ...out.faces];
  out.parts = [...before.parts, ...out.parts];
  out.trails = [...before.trails, ...out.trails];
  // when the eyes jump to another pose, they close on the way and open in place
  if (prev.eyes !== cur.eyes || prev.eyeAlpha !== cur.eyeAlpha) out.shut = Math.max(out.shut, 0.94 * Math.sqrt(Math.sin(Math.PI * Math.min(1, tau / 0.2))));
  return out;
}

/** breathing: the body grows a little taller and back */
export function breath(t: number, loop: number) {
  return 1 + 0.005 * Math.sin((TAU * t) / fit(3.4, loop));
}

/** the head wandering: slow, small turns (yaw, pitch in radians) */
export function wander(t: number, seed: number, loop: number): [number, number] {
  const ph = (k: number) => hash(seed, k) * TAU;
  const s = (p: number, k: number) => Math.sin((TAU * t) / fit(p, loop) + ph(k));
  return [0.055 * s(4.3, 1) + 0.03 * s(2.7, 2), 0.045 * s(3.7, 3) + 0.025 * s(5.9, 4)];
}

/** the eyes' height from blinks: about one every 3.4 s, 0.23 s long, down to 43% */
export function blink(t: number, seed: number, loop: number): number {
  const win = fit(3.4, loop);
  const k = Math.floor(t / win);
  const kk = Math.floor(mod(k, Math.max(1, Math.round(loop / win)) || 1e9));
  const offset = 0.3 + hash(seed, kk + 7) * (win - 0.75);
  const u = (t - k * win - offset) / 0.233;
  return u > 0 && u < 1 ? 1 - 0.57 * Math.sin(Math.PI * u) ** 1.2 : 1;
}

export { rest };
