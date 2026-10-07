// The animations. Each one is a function of its own time (0..dur) that says how the
// body moves, which figure it turns into, what the eyes do, and which extra dots and
// trails show. Every animation starts and ends as the plain blob, so they chain
// without jumps and a cycle loops seamlessly.

import type { Expression } from './face';
import { clamp, ease, lerp, smooth, TAU } from './math';
import { hash } from './prng';
import type { Figure } from './shapes';

export const ANIMS = ['idle', 'thinking', 'wink', 'wide', 'alert', 'notification', 'exclaim', 'sleep', 'egg', 'hexagon', 'play', 'orbit', 'burst', 'comet'] as const;
export type Anim = (typeof ANIMS)[number];

export const DEFAULT_DUR: Record<Anim, number> = {
  idle: 2.4, thinking: 2.6, wink: 1.6, wide: 1.8, alert: 2.4, notification: 2.2, exclaim: 2,
  sleep: 2.4, egg: 1.8, hexagon: 1.6, play: 2, orbit: 3.4, burst: 2.6, comet: 2.4,
};

/** extra dots: thinking, the dot of "!", the notification badge, burst bits. Body radii, y down. */
export interface PartSpec {
  x: number;
  y: number;
  r: number;
  alpha: number;
  /** null = the body's color */
  color: string | null;
}

/** stroked lines: the play trail, orbit rings, the comet's tail. TRAIL_POINTS points each. */
export interface TrailSpec {
  pts: [number, number][];
  color: string;
  width: number;
  alpha: number;
}

export const PART_SLOTS = 3;
export const TRAIL_SLOTS = 5;
export const TRAIL_POINTS = 20;

export interface Pose {
  /** body units (the body is ~2 across); y down */
  tx: number;
  ty: number;
  sx: number;
  sy: number;
  /** overall size of the body and its eyes */
  scale: number;
  /** radians */
  rot: number;
  /** 0 squashes around the center, 1 around the bottom */
  anchor: number;
  /** a ripple around the outline: amplitude, number of lobes, phase */
  wob: number;
  wobK: number;
  wobP: number;
  /** where the eyes look (-1..1) and how much the animation takes over the gaze */
  lookX: number;
  lookY: number;
  lookW: number;
  /** eye openness, both and per eye (1 open, 0 shut) */
  open: number;
  openL: number;
  openR: number;
  eyeScale: number;
  eyeAlpha: number;
  expr: Expression | null;
  exprW: number;
  /** the figure the body turns into, and how far */
  fig: Figure | null;
  figW: number;
  parts: PartSpec[];
  trails: TrailSpec[];
}

export const rest = (): Pose => ({
  tx: 0, ty: 0, sx: 1, sy: 1, scale: 1, rot: 0, anchor: 1, wob: 0, wobK: 3, wobP: 0,
  lookX: 0, lookY: 0, lookW: 0, open: 1, openL: 1, openR: 1, eyeScale: 1, eyeAlpha: 1,
  expr: null, exprW: 0, fig: null, figW: 0, parts: [], trails: [],
});

/** 0 at both ends of the clip, 1 in between: rises over `a` seconds and falls over `b` */
const hold = (t: number, d: number, a: number, b = a) => ease.inOut(clamp(Math.min(t / a, (d - t) / b), 0, 1));

/** a spring settling from 0 to 1 over u in 0..1 */
const spring = (u: number) => (u <= 0 ? 0 : u >= 1 ? 1 : 1 - Math.exp(-6 * u) * Math.cos(u * 12));

/** a bump that rises and falls once over [a, b] */
const bump = (t: number, a: number, b: number) => (t <= a || t >= b ? 0 : Math.sin((Math.PI * (t - a)) / (b - a)) ** 2);

/** eyes fade out as fast as the body starts turning into something without eyes */
const eyesOut = (w: number) => 1 - smooth(clamp(w * 2.2, 0, 1));

const RAINBOW = ['#a855f7', '#3b82f6', '#ec4899', '#22c55e', '#f59e0b'];

type ClipFn = (t: number, d: number, seed: number) => Partial<Pose>;

/** the "!" made of the body (the stem) and a dot, tilted by rot */
function exclamation(w: number, rot: number, dotBounce = 0): Partial<Pose> {
  const stem = -0.28, dot = 0.86 + dotBounce;
  const s = Math.sin(rot), c = Math.cos(rot);
  return {
    fig: 'bar',
    figW: w,
    scale: lerp(1, 0.58, w),
    rot,
    anchor: 0,
    tx: -stem * s * w,
    ty: stem * c * w,
    eyeAlpha: eyesOut(w),
    parts: [{ x: -dot * s * w, y: dot * c * w, r: 0.24 * w, alpha: smooth(clamp(w * 1.5 - 0.3, 0, 1)), color: null }],
  };
}

/** points along an ellipse, for orbit rings: center, radii, turn of the ellipse, start angle */
function ring(rx: number, ry: number, turn: number, phase: number): [number, number][] {
  const pts: [number, number][] = [];
  const ct = Math.cos(turn), st = Math.sin(turn);
  for (let i = 0; i < TRAIL_POINTS; i++) {
    const a = phase + (i / (TRAIL_POINTS - 1)) * TAU;
    const x = rx * Math.cos(a), y = ry * Math.sin(a);
    pts.push([x * ct - y * st, x * st + y * ct]);
  }
  return pts;
}

const CLIPS: Record<Anim, ClipFn> = {
  // breathing, blinks and glances come from underneath (motion.ts)
  idle: () => ({}),

  // shrinks to a dot and two more appear: the "typing" dots
  thinking: (t, d) => {
    const w = hold(t, d, 0.4, 0.4);
    const beat = (k: number) => Math.sin(TAU * (t * 1.6 - k * 0.18)) * 0.5 + 0.5;
    const size = (k: number) => 0.27 * (1 + 0.16 * beat(k) * w);
    const fade = (k: number) => lerp(1, 0.45 + 0.55 * beat(k), w);
    const gap = 0.78 * w;
    return {
      fig: 'circle',
      figW: w,
      scale: lerp(1, size(1), w),
      eyeAlpha: eyesOut(w),
      parts: [
        { x: -gap, y: 0, r: size(0) * smooth(w), alpha: smooth(w) * fade(0), color: null },
        { x: gap, y: 0, r: size(2) * smooth(w), alpha: smooth(w) * fade(2), color: null },
      ],
    };
  },

  // one eye closes, the head tilts a little
  wink: (t, d) => {
    const p = bump(t, 0.2 * d, 0.85 * d);
    return { openR: 1 - p, rot: 0.08 * p, expr: 'happy', exprW: 0.35 * p, lookW: 0 };
  },

  // the eyes open wide, the body lifts
  wide: (t, d) => {
    const w = hold(t, d, 0.25, 0.45);
    return { expr: 'surprised', exprW: w, eyeScale: 1 + 0.16 * w, sy: 1 + 0.05 * w, sx: 1 - 0.03 * w, ty: -0.05 * w };
  },

  // a tilted "!", shaking
  alert: (t, d) => {
    const w = hold(t, d, 0.4, 0.4);
    const shake = 0.07 * Math.sin(TAU * t * 3.2) * w;
    return exclamation(w, -0.32 * w + shake);
  },

  // a badge pops on the top right, the eyes look at it
  notification: (t, d) => {
    const w = hold(t, d, 0.3, 0.4);
    const pop = spring(clamp((t - 0.15 * d) / (0.45 * d), 0, 1)) * hold(t, d, 0.15, 0.35);
    const squash = bump(t, 0.12 * d, 0.32 * d);
    return {
      lookX: 0.9,
      lookY: -0.9,
      lookW: w,
      sy: 1 - 0.05 * squash,
      sx: 1 + 0.04 * squash,
      parts: [{ x: 0.74, y: -0.74, r: 0.22 * pop, alpha: clamp(pop * 3, 0, 1), color: '#3b82f6' }],
    };
  },

  // an upright "!", its dot bouncing
  exclaim: (t, d) => {
    const w = hold(t, d, 0.4, 0.4);
    return exclamation(w, 0, -0.1 * Math.abs(Math.sin(TAU * t * 1.4)) * w);
  },

  // shrinks to a small dot that breathes
  sleep: (t, d) => {
    const w = hold(t, d, 0.5, 0.5);
    const b = Math.sin(TAU * t * 0.8);
    return { scale: lerp(1, 0.16 * (1 + 0.14 * b), w), anchor: 0, ty: 0.15 * w, eyeAlpha: eyesOut(w) };
  },

  egg: (t, d) => {
    const w = hold(t, d, 0.35, 0.4);
    const wob = Math.exp(-4 * (t / d)) * Math.sin(t * 16);
    return { fig: 'egg', figW: w, sx: 1 + 0.04 * wob * w, sy: 1 - 0.04 * wob * w };
  },

  hexagon: (t, d) => {
    const w = hold(t, d, 0.35, 0.4);
    return { fig: 'hexagon', figW: w, rot: 0.18 * Math.sin((Math.PI * t) / d) * w };
  },

  // a play triangle with a ribbon of colors behind it
  play: (t, d) => {
    const w = hold(t, d, 0.35, 0.45);
    const trails: TrailSpec[] = [0, 1, 2].map((k) => {
      const pts: [number, number][] = [];
      for (let i = 0; i < TRAIL_POINTS; i++) {
        const u = i / (TRAIL_POINTS - 1);
        const x = -0.55 - 1.6 * u * w;
        const y = 0.28 + (k - 1) * 0.16 + 0.12 * Math.sin(TAU * (u * 1.2 - t * 1.4) + k) * u;
        pts.push([x, y]);
      }
      return { pts, color: RAINBOW[k], width: 0.13, alpha: smooth(w) * 0.95 };
    });
    return { fig: 'play', figW: w, rot: -0.35 * w, ty: -0.06 * Math.sin(TAU * t * 1.2) * w, trails };
  },

  // colored rings turn around the body
  orbit: (t, d) => {
    const w = hold(t, d, 0.5, 0.5);
    const trails: TrailSpec[] = RAINBOW.map((color, k) => ({
      pts: ring(1.5 * lerp(0.6, 1, w), 0.42, (k * Math.PI) / 5 + t * 0.35, t * 2.4 + k),
      color,
      width: 0.07,
      alpha: smooth(w) * 0.9,
    }));
    return { trails, ty: -0.04 * Math.sin(TAU * t * 0.6) * w };
  },

  // shrinks, then bursts into bits and comes back
  burst: (t, d, seed) => {
    const u = t / d;
    const shrink = smooth(clamp(u / 0.3, 0, 1)) * (1 - smooth(clamp((u - 0.42) / 0.3, 0, 1)));
    const fly = clamp((u - 0.36) / 0.4, 0, 1);
    const back = spring(clamp((u - 0.42) / 0.5, 0, 1));
    const scale = u < 0.42 ? lerp(1, 0.22, shrink) : lerp(0.22, 1, back);
    const parts: PartSpec[] = [0, 1, 2].map((k) => {
      const a = (k / 3) * TAU + 0.5 + hash(seed, k) * 0.6;
      const r = 1.5 * ease.out(fly);
      return { x: Math.sin(a) * r, y: -Math.cos(a) * r, r: 0.14 * (1 - fly), alpha: fly > 0 && fly < 1 ? 1 - fly : 0, color: null };
    });
    return { scale, anchor: 0, eyeAlpha: eyesOut(1 - scale), parts };
  },

  // shrinks to a dot that loops around with a tail
  comet: (t, d) => {
    const w = hold(t, d, 0.35, 0.35);
    const u = clamp((t - 0.3) / (d - 0.6), 0, 1);
    const at = (v: number): [number, number] => {
      const a = TAU * ease.inOut(clamp(v, 0, 1));
      return [1.15 * Math.sin(a), -0.55 * (1 - Math.cos(a))];
    };
    const [x, y] = at(u);
    const pts: [number, number][] = [];
    for (let i = 0; i < TRAIL_POINTS; i++) pts.push(at(u - (i / (TRAIL_POINTS - 1)) * 0.22));
    const moving = u > 0 && u < 1 ? 1 : 0;
    return {
      scale: lerp(1, 0.24, w),
      anchor: 0,
      tx: x,
      ty: y,
      eyeAlpha: eyesOut(w),
      trails: [{ pts, color: '#f472b6', width: 0.16, alpha: w * moving * 0.9 }],
    };
  },
};

export function clipPose(anim: Anim, t: number, d: number, seed: number): Pose {
  return { ...rest(), ...CLIPS[anim](clamp(t, 0, d), d, seed) };
}

/** a moment that shows what an animation does, for thumbnails */
export const SHOW_AT: Record<Anim, number> = {
  idle: 0, thinking: 0.5, wink: 0.5, wide: 0.45, alert: 0.5, notification: 0.6, exclaim: 0.5,
  sleep: 0.5, egg: 0.5, hexagon: 0.5, play: 0.5, orbit: 0.5, burst: 0.45, comet: 0.42,
};

