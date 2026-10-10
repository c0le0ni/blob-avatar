// The animations. Each one is a function of its own time (0..dur) that says what
// the blob turns into and does: its figure, size and place, its eyes, the extra
// dots, a gap cut into the body, and colored lines around it. Clips hold their
// look until the next one takes over; motion.ts crossfades between them.

import type { Expression, Face } from './face';
import { STATE_EYES } from './face';
import { clamp, ease, lerp, mod, smooth, TAU } from './math';
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

/** colored lines: the play ribbon, orbit rings, the comet's tail. TRAIL_POINTS points each. */
export interface TrailSpec {
  pts: [number, number][];
  /** a gradient along the line, start to end */
  colors: [string, string, string];
  width: number;
  alpha: number;
  /** drawn in front of the body (true) or behind it */
  front: boolean;
}

export const PART_SLOTS = 3;
export const TRAIL_SLOTS = 12;
export const TRAIL_POINTS = 18;

export interface Pose {
  /** body units (the body is ~2 across); y down */
  tx: number;
  ty: number;
  sx: number;
  sy: number;
  /** overall size of the body */
  scale: number;
  /** radians, clockwise */
  rot: number;
  /** 0 squashes around the center, 1 around the bottom */
  anchor: number;
  /** extra head turn for the eyes: yaw (to the right) and pitch (down), radians */
  yaw: number;
  pitch: number;
  /** eyes the animation sets, and how far they take over from the expression */
  eyes: Face | null;
  eyesW: number;
  expr: Expression | null;
  exprW: number;
  eyeAlpha: number;
  /** extra closing of the eyes (1 = shut), on top of the blinks */
  shut: number;
  /** the figure the body turns into, and how far */
  fig: Figure | null;
  figW: number;
  /** a round gap cut into the body (radius 0 = none) */
  holeX: number;
  holeY: number;
  holeR: number;
  parts: PartSpec[];
  trails: TrailSpec[];
}

export const rest = (): Pose => ({
  tx: 0, ty: 0, sx: 1, sy: 1, scale: 1, rot: 0, anchor: 0, yaw: 0, pitch: 0,
  eyes: null, eyesW: 0, expr: null, exprW: 0, eyeAlpha: 1, shut: 0,
  fig: null, figW: 0, holeX: 0, holeY: 0, holeR: 0, parts: [], trails: [],
});

// ---------------------------------------------------------------- colors

/** a pastel hue (55% saturation, 62% lightness) as hex */
function pastel(h: number): string {
  const s = 0.55, l = 0.62;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return '#' + [f(0), f(8), f(4)].map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
}
const ramp = (h0: number, span: number): [string, string, string] => [pastel(mod(h0, 360)), pastel(mod(h0 + span / 2, 360)), pastel(mod(h0 + span, 360))];

// ---------------------------------------------------------------- helpers

/** 0 before a, 1 after b, eased in between */
const step = (t: number, a: number, b: number) => ease.inOut(clamp((t - a) / (b - a), 0, 1));

/** a spring that settles at 1, overshooting a little */
const pop = (u: number) => (u <= 0 ? 0 : u >= 1 ? 1 : 1 - Math.exp(-7 * u) * Math.cos(u * 11));

/** points around a circle of radius r tilted in 3D, from angle a0 over `span` radians; z tells front from back */
function arc3d(r: number, tiltAxis: number, tilt: number, a0: number, span: number, cx = 0, cy = 0): { pts: [number, number][]; z: number[] } {
  const pts: [number, number][] = [];
  const z: number[] = [];
  const ca = Math.cos(tiltAxis), sa = Math.sin(tiltAxis), ct = Math.cos(tilt), st = Math.sin(tilt);
  for (let i = 0; i < TRAIL_POINTS; i++) {
    const a = a0 + (span * i) / (TRAIL_POINTS - 1);
    // a circle in the screen plane, squashed by the tilt, then turned by the axis
    const x0 = r * Math.cos(a), y0 = r * Math.sin(a) * ct, z0 = r * Math.sin(a) * st;
    pts.push([cx + x0 * ca - y0 * sa, cy + x0 * sa + y0 * ca]);
    z.push(z0);
  }
  return { pts, z };
}

/** split a 3D arc into the part behind the body and the part in front, as two trails */
function halves(arc: { pts: [number, number][]; z: number[] }, colors: [string, string, string], width: number, alpha: number): TrailSpec[] {
  const fill = (keep: (z: number) => boolean): [number, number][] | null => {
    const kept = arc.pts.filter((_, i) => keep(arc.z[i]));
    if (kept.length < 2) return null;
    // resample the kept run to the full point count, so every trail keeps its structure
    return Array.from({ length: TRAIL_POINTS }, (_, i) => kept[Math.round((i / (TRAIL_POINTS - 1)) * (kept.length - 1))]);
  };
  const b = fill((z) => z < 0), f = fill((z) => z >= 0);
  return [
    { pts: b ?? arc.pts, colors, width, alpha: b ? alpha : 0, front: false },
    { pts: f ?? arc.pts, colors, width, alpha: f ? alpha : 0, front: true },
  ];
}

type ClipFn = (t: number, d: number, seed: number) => Partial<Pose>;

/** the "!": the stem (the body) and its dot below, leaning by rot, the stem's center at (x, y) */
function exclamation(x: number, y: number, rot: number, gap: number, dotR: number): Partial<Pose> {
  return {
    fig: 'stem',
    figW: 1,
    rot,
    tx: x,
    ty: y,
    eyeAlpha: 0,
    parts: [{ x: x - gap * Math.sin(rot), y: y + gap * Math.cos(rot), r: dotR, alpha: 1, color: null }],
  };
}

const CLIPS: Record<Anim, ClipFn> = {
  // breathing, blinks and glances come from underneath (motion.ts)
  idle: () => ({}),

  // three dots; one at a time grows and darkens: right, left, middle, and again
  thinking: (t) => {
    const order = [2, 0, 1];
    const k = Math.floor((t + 0.23) / 0.5);
    const into = smooth((t + 0.23 - k * 0.5) / 0.13);
    const now = order[mod(k, 3)], before = order[mod(k - 1, 3)];
    const act = (j: number) => (j === now ? (k === 0 ? 1 : into) : 0) + (j === before && k > 0 ? 1 - into : 0);
    const r = (j: number) => lerp(0.164, 0.207, act(j));
    const o = (j: number) => lerp(0.55, 1, act(j));
    return {
      fig: 'circle',
      figW: 1,
      scale: r(1),
      eyeAlpha: 0,
      parts: [
        { x: -0.555, y: 0, r: r(0), alpha: o(0), color: null },
        { x: 0.54, y: 0, r: r(2), alpha: o(2), color: null },
      ],
    };
  },

  // the right eye closes into a line
  wink: () => ({ eyes: STATE_EYES.wink, eyesW: 1 }),

  // big eyes, looking down and to the right
  wide: () => ({ eyes: STATE_EYES.wide, eyesW: 1 }),

  // a leaning "!" slides to the right, waits, and comes back
  alert: (t, d) => {
    const k = d / 2.4;
    const x = lerp(lerp(-0.07, 0.73, step(t, 0.5 * k, 1.4 * k)), 0.1, step(t, 1.6 * k, 2 * k));
    return exclamation(x, -0.33, 0.305, 0.6, 0.12);
  },

  // a blue badge pops in a gap at the top right; the eyes look away
  notification: (t) => {
    const p = pop(t / 0.3);
    return {
      eyes: STATE_EYES.notification,
      eyesW: 1,
      holeX: 0.75,
      holeY: -0.67,
      holeR: 0.205 * p,
      parts: [{ x: 0.75, y: -0.67, r: 0.15 * p, alpha: clamp(p * 4, 0, 1), color: '#2496e8' }],
    };
  },

  // an upright "!"
  exclaim: () => exclamation(0, -0.215, 0, 0.745, 0.11),

  // a small dot bobbing up and down
  sleep: (t) => ({ fig: 'circle', figW: 1, scale: 0.16, ty: 0.11 - 0.19 * Math.cos((TAU * (t - 0.47)) / 0.6), eyeAlpha: 0 }),

  egg: () => ({ fig: 'egg', figW: 1, eyes: STATE_EYES.egg, eyesW: 1 }),

  hexagon: () => ({ fig: 'hexa', figW: 1, eyes: STATE_EYES.hexa, eyesW: 1 }),

  // a play triangle, a ribbon of four colored lines going around it
  // the ribbon runs on a narrow tilted orbit: in front from the top right to the bottom left, then back behind
  play: (t, d) => {
    const w = clamp(t / 0.15, 0, 1) * clamp((d - t) / 0.2, 0, 1);
    const head = (Math.PI * (t - 0.1)) / 1.05;
    const trails = [0, 1, 2, 3].flatMap((k) => halves(arc3d(1.1 + 0.15 * k, -0.5, 1.45, head - 1.55, 1.55, 0.02, 0.05), ramp(95 + 62 * k, 100), 0.05, w));
    return { fig: 'play', figW: 1, eyes: STATE_EYES.play, eyesW: 1, trails };
  },

  // the triangle spins while six rings turn around it
  orbit: (t, d) => {
    const trails = [0, 1, 2, 3, 4, 5].flatMap((k) => {
      const w = smooth((t - 0.15 - 0.08 * k) / 0.25) * clamp((d - t) / 0.3, 0, 1);
      const axis = (k * Math.PI) / 6 + 0.3 * t;
      const colors = ramp(4 + 60 * k, 62);
      const back = arc3d(1.37, axis, 1.25, Math.PI, Math.PI, 0, 0.03);
      const front = arc3d(1.37, axis, 1.25, 0, Math.PI, 0, 0.03);
      return [
        { pts: back.pts, colors, width: 0.055, alpha: w, front: false },
        { pts: front.pts, colors, width: 0.055, alpha: w, front: true },
      ];
    });
    const spin = smooth(t / 0.3) * smooth((d - t) / 0.4);
    const a = -9.1 * t * spin;
    return { fig: 'play', figW: 1, eyes: STATE_EYES.play, eyesW: 1, rot: a, yaw: -a * 0.5, trails };
  },

  // shrinks to a dot that pulls in grey bits, then bursts back
  burst: (t, d, seed) => {
    const k = d / 2.6;
    const back = step(t, 1.75 * k, 2.1 * k);
    const parts: PartSpec[] = [0, 1, 2].map((i) => {
      // each slot pulls in a bit every 0.45 s, from a seeded direction
      const n = Math.floor((t - 0.1 - 0.15 * i) / 0.45);
      const u = (t - 0.1 - 0.15 * i - n * 0.45) / 0.45;
      const live = n >= 0 && t < 1.55 * k;
      const a = hash(seed, i * 31 + n) * TAU;
      const r = lerp(0.55, 0.08, ease.in(u));
      return { x: Math.sin(a) * r, y: -Math.cos(a) * r, r: lerp(0.04, 0.07, u), alpha: live ? smooth(u * 4) * (1 - smooth((u - 0.85) / 0.15)) : 0, color: null };
    });
    return { fig: 'circle', figW: 1 - back, scale: lerp(0.165, 1, back), eyeAlpha: back, parts };
  },

  // a tiny dot with a rainbow tail circling it, in front and behind
  comet: (t, d) => {
    const k = d / 2.4;
    const back = step(t, 1.85 * k, 2.05 * k);
    const on = smooth((t - 0.12) / 0.15) * (1 - smooth((t - 1.8 * k) / (0.12 * k)));
    // the head runs in front from the bottom right to the top left, then behind, one turn every 1.65 s
    const head = 2.2 + ((t - 0.27) * TAU) / 1.65;
    const trails = [0, 1, 2, 3].flatMap((i) => halves(arc3d(0.82, 0.54, 1.45, head - 1.3, 1.3, 0, 0.02 + 0.04 * (i - 1.5)), ramp(4 + 88 * i, 85), 0.095, on));
    return { fig: 'circle', figW: 1 - back, scale: lerp(0.13, 1, back), eyeAlpha: back, ty: 0.02 * (1 - back), trails };
  },
};

export function clipPose(anim: Anim, t: number, d: number, seed: number): Pose {
  return { ...rest(), ...CLIPS[anim](clamp(t, 0, d), d, seed) };
}

/** a moment that shows what an animation does, for thumbnails */
export const SHOW_AT: Record<Anim, number> = {
  idle: 0, thinking: 0.3, wink: 0.5, wide: 0.5, alert: 0.5, notification: 0.6, exclaim: 0.5,
  sleep: 0.35, egg: 0.5, hexagon: 0.5, play: 0.45, orbit: 0.5, burst: 0.2, comet: 0.17,
};
