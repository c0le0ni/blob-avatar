// Motion over time: the montage (clips in sequence, crossfading at the seams), the
// idle life underneath (breathing, glances, blinks). Everything is a pure function of
// time and seed, and every period is fitted to the montage length so exports loop.

import { clipPose, rest, type Pose } from './animations';
import { DECOR_SLOTS, type Particle } from './decor';
import type { Expression } from './face';
import { lerp, mod, smooth } from './math';
import { hash } from './prng';
import { loopLength, type BlobState } from './state';

export interface Motion extends Omit<Pose, 'expr' | 'exprW' | 'decor'> {
  exprs: { expr: Expression; w: number }[];
  decor: Particle[];
}

const NUMERIC = ['tx', 'ty', 'sx', 'sy', 'rot', 'anchor', 'wob', 'wobK', 'wobP', 'lookX', 'lookY', 'lookW', 'open', 'eyeScale'] as const;

const XFADE = 0.3;

/** a period close to `p` that fits a whole number of times in the loop */
export const fit = (p: number, loop: number) => (loop > 0 ? loop / Math.max(1, Math.round(loop / p)) : p);

function toMotion(p: Pose, w = 1): Motion {
  const m = { ...p } as unknown as Motion;
  m.exprs = p.expr ? [{ expr: p.expr, w: p.exprW * w }] : [];
  m.decor = p.decor.map((d) => ({ ...d, alpha: d.alpha * w }));
  return m;
}

/** the montage at time t (any t: it loops) */
export function sequenceAt(state: BlobState, t: number): Motion {
  const seq = state.seq.length ? state.seq : [{ anim: 'idle' as const, dur: 3 }];
  const L = loopLength({ ...state, seq });
  const local = mod(t, L);
  let start = 0;
  let i = 0;
  while (i < seq.length - 1 && local >= start + seq[i].dur) start += seq[i++].dur;
  const tau = local - start;
  const cur = clipPose(seq[i].anim, tau, seq[i].dur, state.seed + i * 101);
  if (seq.length < 2 || tau >= XFADE) return toMotion(cur);
  // crossfade from where the previous clip ended
  const j = (i - 1 + seq.length) % seq.length;
  const prev = clipPose(seq[j].anim, seq[j].dur, seq[j].dur, state.seed + j * 101);
  const w = smooth(tau / XFADE);
  const out = toMotion(cur, w);
  for (const k of NUMERIC) out[k] = lerp(prev[k], cur[k], w);
  const prevM = toMotion(prev, 1 - w);
  out.exprs = [...prevM.exprs, ...out.exprs];
  out.decor = [...prevM.decor, ...out.decor].slice(0, DECOR_SLOTS);
  return out;
}

/** breathing: a slow squash and stretch */
export function breath(t: number, loop: number) {
  const b = Math.sin((2 * Math.PI * t) / fit(3.4, loop));
  return { sx: 1 - 0.012 * b, sy: 1 + 0.018 * b };
}

/** when nobody drives the gaze: short glances at seeded spots, often back to the front */
export function idleGaze(t: number, seed: number, loop: number): [number, number] {
  const seg = fit(2.6, loop);
  const k = Math.floor(t / seg);
  const target = (n: number): [number, number] => {
    const k2 = Math.floor(mod(n, Math.max(1, Math.round(loop / seg)) || 1e9));
    if (hash(seed, k2 * 3 + 11) < 0.4) return [0, 0];
    return [(hash(seed, k2 * 3 + 12) * 2 - 1) * 0.75, (hash(seed, k2 * 3 + 13) * 2 - 1) * 0.35];
  };
  const a = target(k - 1);
  const b = target(k);
  const u = smooth((t - k * seg) / 0.35);
  return [lerp(a[0], b[0], u), lerp(a[1], b[1], u)];
}

/** eye openness from blinks: one per window, sometimes two, at seeded moments */
export function blink(t: number, seed: number, loop: number): number {
  const win = fit(3.7, loop);
  const k = Math.floor(t / win);
  const kk = Math.floor(mod(k, Math.max(1, Math.round(loop / win)) || 1e9));
  const offset = 0.3 + hash(seed, kk + 7) * (win - 0.9);
  const local = t - k * win;
  const one = (at: number) => {
    const u = (local - at) / 0.17;
    return u > 0 && u < 1 ? Math.sin(Math.PI * u) : 0;
  };
  let shut = one(offset);
  if (hash(seed, kk + 77) < 0.2) shut = Math.max(shut, one(offset + 0.27));
  return 1 - shut;
}

export { rest };
