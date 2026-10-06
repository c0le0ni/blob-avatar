// The animations. Each clip is a function of its own time (0..dur) that returns how
// far the body moves, stretches and turns, where the eyes look, which expression
// takes over and which particles show. Every clip starts and ends at rest, so clips
// chain without jumps and a montage loops seamlessly.

import type { DecorKind, Particle } from './decor';
import type { Expression } from './face';
import { clamp, ease, fract, smooth, TAU } from './math';
import { hash } from './prng';

export const ANIMS = ['idle', 'bounce', 'hop', 'jelly', 'float', 'spin', 'nod', 'shake', 'lean', 'peek', 'sleep', 'love', 'excited', 'dizzy', 'pop'] as const;
export type Anim = (typeof ANIMS)[number];

export interface Pose {
  /** body units (the body is ~2 units across); y down */
  tx: number;
  ty: number;
  sx: number;
  sy: number;
  /** radians */
  rot: number;
  /** 0 squashes around the center, 1 around the bottom (feet on the ground) */
  anchor: number;
  /** a ripple around the outline: amplitude, number of lobes, phase */
  wob: number;
  wobK: number;
  wobP: number;
  /** where the eyes look (-1..1) and how strongly the clip takes over the gaze */
  lookX: number;
  lookY: number;
  lookW: number;
  /** eye openness multiplier (1 open, 0 shut) */
  open: number;
  eyeScale: number;
  expr: Expression | null;
  exprW: number;
  decor: Particle[];
}

export const rest = (): Pose => ({ tx: 0, ty: 0, sx: 1, sy: 1, rot: 0, anchor: 1, wob: 0, wobK: 3, wobP: 0, lookX: 0, lookY: 0, lookW: 0, open: 1, eyeScale: 1, expr: null, exprW: 0, decor: [] });

export const DEFAULT_DUR: Record<Anim, number> = { idle: 3, bounce: 1.2, hop: 1.6, jelly: 1.4, float: 3, spin: 1.4, nod: 1.6, shake: 1.2, lean: 2.4, peek: 2.4, sleep: 4, love: 2.4, excited: 1.6, dizzy: 2.4, pop: 1.2 };

/** in and out over `edge` seconds, so expressions and particles fade with the clip */
const envelope = (t: number, d: number, edge = 0.3) => smooth(Math.min(t / edge, (d - t) / edge, 1));

/** a parabolic hop of height h over u in 0..1 */
const arc = (u: number, h: number) => -h * 4 * u * (1 - u);

/** particles rising and fading in a loop: n of them, spawned evenly over the clip */
function rising(kind: DecorKind, t: number, d: number, seed: number, n: number, opt: { x: number; y: number; dx: number; rise: number; s: number; spread: number }): Particle[] {
  const out: Particle[] = [];
  const life = Math.min(d, 1.8);
  for (let i = 0; i < n; i++) {
    const p = fract((t + (i * life) / n) / life);
    const jitter = (hash(seed, i + 31) - 0.5) * opt.spread;
    out.push({
      kind,
      x: opt.x + jitter + opt.dx * p,
      y: opt.y - opt.rise * p,
      s: opt.s * (0.6 + 0.6 * p),
      rot: (hash(seed, i + 7) - 0.5) * 0.6,
      alpha: Math.sin(Math.PI * p) ** 0.8,
    });
  }
  return out;
}

type ClipFn = (t: number, d: number, seed: number) => Partial<Pose>;

const CLIPS: Record<Anim, ClipFn> = {
  idle: () => ({}),

  // repeated small bounces: squash on contact, stretch in the air
  bounce: (t, d) => {
    const n = Math.max(1, Math.round(d / 0.6));
    const p = fract((t / d) * n);
    const contact = 0.16;
    if (p < contact) {
      const c = Math.sin((Math.PI * p) / contact);
      return { sy: 1 - 0.15 * c, sx: 1 + 0.12 * c };
    }
    const u = (p - contact) / (1 - contact);
    return { ty: arc(u, 0.34), sy: 1 + 0.07 * Math.sin(Math.PI * u), sx: 1 - 0.05 * Math.sin(Math.PI * u) };
  },

  // crouch, jump, land, wobble
  hop: (t, d) => {
    const k = d / 1.6;
    const crouch = 0.22 * k, air = 0.5 * k, land = crouch + air;
    if (t < crouch) {
      const c = ease.sine(t / crouch);
      return { sy: 1 - 0.14 * c, sx: 1 + 0.1 * c, lookY: 0.25 * c, lookW: c };
    }
    if (t < land) {
      const u = (t - crouch) / air;
      return { ty: arc(u, 0.62), sy: 1 + 0.1 * Math.sin(Math.PI * u), sx: 1 - 0.07 * Math.sin(Math.PI * u), lookY: -0.4 * Math.sin(Math.PI * u), lookW: 1 - u * 0.5 };
    }
    const u = (t - land) / (d - land);
    const s = Math.exp(-5 * u) * Math.cos(u * 15);
    return { sy: 1 - 0.16 * s * (1 - u), sx: 1 + 0.12 * s * (1 - u), wob: 0.03 * Math.exp(-4 * u) * Math.sin(u * 20), wobK: 4 };
  },

  // a poke, then it wobbles like jelly
  jelly: (t, d) => {
    const u = t / d;
    const decay = Math.exp(-3.2 * u) * (1 - u);
    const w = Math.sin(u * 22);
    return { sx: 1 + 0.13 * decay * w, sy: 1 - 0.12 * decay * w, wob: 0.045 * decay * Math.sin(u * 30), wobK: 3, wobP: u * 6, anchor: 0.6 };
  },

  float: (t, d) => {
    const a = (TAU * t) / d;
    return { ty: -0.09 * Math.sin(a), rot: 0.05 * Math.sin(a + 1.2), anchor: 0 };
  },

  // a full turn with a little hop
  spin: (t, d) => {
    const u = clamp((t - 0.12 * d) / (0.72 * d), 0, 1);
    const turn = ease.inOut(u);
    return { rot: turn >= 1 ? 0 : TAU * turn, ty: arc(u, 0.16), anchor: 0, lookX: 0, lookW: Math.sin(Math.PI * u) };
  },

  // two nods
  nod: (t, d) => {
    const n = 2;
    const p = fract((t / d) * n);
    const dip = Math.sin(Math.PI * p) ** 2;
    return { ty: 0.06 * dip, sy: 1 - 0.05 * dip, lookY: 0.7 * dip, lookW: dip, rot: 0.04 * dip };
  },

  // "no, no"
  shake: (t, d) => {
    const env = Math.sin((Math.PI * t) / d);
    const s = Math.sin((TAU * t * 3) / d);
    return { rot: 0.13 * s * env, tx: 0.05 * s * env, lookX: -0.8 * s * env, lookW: env, anchor: 0.3 };
  },

  // leans one way, then the other
  lean: (t, d) => {
    const s = Math.sin((TAU * t) / d);
    return { rot: -0.15 * s, tx: -0.06 * s, lookX: -s, lookW: Math.abs(s), anchor: 1 };
  },

  // looks around: left, right, back
  peek: (t, d) => {
    const u = t / d;
    const look = u < 0.12 ? smooth(u / 0.12) * -1 : u < 0.42 ? -1 : u < 0.55 ? -1 + 2 * smooth((u - 0.42) / 0.13) : u < 0.85 ? 1 : 1 - smooth((u - 0.85) / 0.15);
    return { lookX: look, lookY: -0.15 * Math.abs(look), lookW: 1, tx: 0.04 * look, eyeScale: 1 + 0.06 * Math.abs(look) };
  },

  sleep: (t, d, seed) => {
    const env = envelope(t, d, 0.5);
    const b = Math.sin((TAU * t) / (d / 2));
    return {
      expr: 'sleepy',
      exprW: env,
      open: 1 - 0.95 * env,
      sy: 1 + 0.035 * b * env,
      sx: 1 - 0.025 * b * env,
      lookY: 0.4,
      lookW: env,
      decor: rising('z', t, d, seed, 3, { x: 0.55, y: -0.75, dx: 0.35, rise: 0.75, s: 0.34, spread: 0.1 }).map((p) => ({ ...p, alpha: p.alpha * env })),
    };
  },

  love: (t, d, seed) => {
    const env = envelope(t, d);
    const p = fract((t / d) * 2);
    return {
      expr: 'love',
      exprW: env,
      ty: arc(p, 0.1) * env,
      decor: rising('heart', t, d, seed, 4, { x: 0, y: -0.85, dx: 0, rise: 0.7, s: 0.3, spread: 1.4 }).map((q) => ({ ...q, alpha: q.alpha * env })),
    };
  },

  excited: (t, d, seed) => {
    const env = envelope(t, d, 0.2);
    const n = Math.max(2, Math.round(d / 0.45));
    const p = fract((t / d) * n);
    const sparks: Particle[] = [];
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + 0.6;
      const tw = Math.sin(Math.PI * fract(t * 1.6 + hash(seed, i) )) ** 2;
      sparks.push({ kind: 'spark', x: Math.cos(a) * 1.25, y: Math.sin(a) * 1.15 - 0.1, s: 0.3 * tw + 0.05, rot: 0, alpha: tw * env });
    }
    return { expr: 'starry', exprW: env, ty: arc(p, 0.2) * env, sy: 1 + 0.05 * Math.sin(Math.PI * p) * env, decor: sparks };
  },

  dizzy: (t, d) => {
    const env = envelope(t, d);
    const a = (TAU * t) / 0.9;
    const stars: Particle[] = [];
    for (let i = 0; i < 3; i++) {
      const b = a + (i * TAU) / 3;
      stars.push({ kind: 'star', x: Math.cos(b) * 0.75, y: -1.02 + Math.sin(b) * 0.16, s: 0.24 + 0.06 * Math.sin(b), rot: b * 0.3, alpha: env * (0.55 + 0.45 * Math.sin(b)) });
    }
    return { expr: 'dizzy', exprW: env, rot: 0.1 * Math.sin(a) * env, tx: 0.05 * Math.cos(a) * env, anchor: 0.2, decor: stars };
  },

  // a quick puff with sparks bursting out
  pop: (t, d, seed) => {
    const u = t / d;
    const s = Math.exp(-4.5 * u) * Math.sin(u * 16) * (1 - u);
    const burst: Particle[] = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + hash(seed, i + 3) * 0.5;
      const r = 1.05 + 0.55 * ease.out(clamp(u * 2.2, 0, 1));
      const life = clamp(1 - u * 2.2, 0, 1);
      burst.push({ kind: i % 2 ? 'dot' : 'spark', x: Math.cos(a) * r, y: Math.sin(a) * r, s: 0.22 * life + 0.02, rot: 0, alpha: life * Math.min(1, u * 12) });
    }
    return { sx: 1 + 0.24 * s, sy: 1 + 0.24 * s, anchor: 0, decor: burst };
  },
};

export function clipPose(anim: Anim, t: number, d: number, seed: number): Pose {
  return { ...rest(), ...CLIPS[anim](clamp(t, 0, d), d, seed) };
}
