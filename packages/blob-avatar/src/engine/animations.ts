// The animations. Each one is a function of its own time (0..dur) that says what
// the blob turns into and does: its figure, size and place, its eyes, the extra
// dots, a gap cut into the body, and colored lines around it. Clips hold their
// look until the next one takes over; motion.ts crossfades between them.

import type { Expression, Face } from './face';
import { STATE_EYES } from './face';
import { clamp, ease, lerp, mod, smooth, TAU } from './math';
import { hash } from './prng';
import type { Figure } from './shapes';

/** the first fourteen, in their order: the cycle an avatar plays when it names none (see state.ts) */
export const CLASSIC_ANIMS = ['idle', 'thinking', 'wink', 'wide', 'alert', 'notification', 'exclaim', 'sleep', 'egg', 'hexagon', 'play', 'orbit', 'burst', 'comet'] as const;

/** every animation: the classic ones, then gestures, moods and states */
export const ANIMS = [...CLASSIC_ANIMS, 'nod', 'shake', 'jump', 'spin', 'love', 'party', 'dizzy', 'shiver', 'melt', 'snooze', 'rain', 'loading', 'check', 'question'] as const;
export type Anim = (typeof ANIMS)[number];

export const DEFAULT_DUR: Record<Anim, number> = {
  idle: 2.4, thinking: 2.6, wink: 1.6, wide: 1.8, alert: 2.4, notification: 2.2, exclaim: 2,
  sleep: 2.4, egg: 1.8, hexagon: 1.6, play: 2, orbit: 3.4, burst: 2.6, comet: 2.4,
  jump: 1.6, spin: 1.6, nod: 1.4, shake: 1.4, love: 2, dizzy: 2.2, melt: 2.4, loading: 2, check: 1.8, question: 2, snooze: 2.6, rain: 2.4, party: 2, shiver: 1.4,
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

/** half a sine over 0..1, flat outside it */
const wave = (v: number) => Math.sin(Math.PI * clamp(v, 0, 1));

/** one hop, u from 0 to 1: a squash, the air, a smaller squash on landing (as the click's hop) */
function hop(u: number, height = 0.33): Partial<Pose> {
  const a = clamp((u - 0.2) / 0.45, 0, 1);
  const e = 0.08 * wave(a) - 0.16 * wave(u / 0.22) - 0.09 * wave((u - 0.65) / 0.35);
  return { sx: 1 - 0.7 * e, sy: 1 + e, ty: 4 * height * a * (a - 1), anchor: 1 };
}

/** fades in over the first `a` seconds and out over the last `b` */
const span = (t: number, d: number, a = 0.15, b = 0.2) => clamp(t / a, 0, 1) * clamp((d - t) / b, 0, 1);

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

  // two hops, looking up in the air
  jump: (t, d) => {
    const u = (t % (d / 2)) / (d / 2);
    return { ...hop(u), pitch: -0.25 * wave((u - 0.2) / 0.45) };
  },

  // a full turn on the spot: the eyes go round the back, the body narrows side on
  spin: (t) => {
    const a = TAU * ease.inOut(clamp((t - 0.15) / 1.15, 0, 1));
    return { yaw: a, sx: 0.8 + 0.2 * Math.abs(Math.cos(a)), ty: -0.06 * wave((t - 0.15) / 1.15) };
  },

  // yes: two nods
  nod: (t) => {
    const u = clamp((t - 0.1) / 1.0, 0, 1);
    const n = Math.sin(TAU * 2 * u) * wave(u);
    return { pitch: 0.38 * Math.max(0, n) - 0.12 * Math.max(0, -n), ty: 0.03 * Math.max(0, n), sy: 1 - 0.03 * Math.max(0, n), anchor: 1 };
  },

  // no: shakes the head three times, smaller each time
  shake: (t) => {
    const u = clamp((t - 0.1) / 1.1, 0, 1);
    const n = Math.sin(TAU * 3 * u) * (1 - u) * smooth(u * 6);
    return { yaw: 0.5 * n, tx: 0.03 * n, rot: 0.03 * n };
  },

  // turns into a heart that beats twice a second, happy
  love: (t) => {
    const b = t % 1;
    const beat = 0.09 * wave(b / 0.16) + 0.06 * wave((b - 0.22) / 0.18);
    return { fig: 'heart', figW: 1, scale: 1 + beat, expr: 'happy', exprW: 1 };
  },

  // the eyes go round and round, the body sways
  dizzy: (t, d) => {
    const w = span(t, d, 0.3, 0.3);
    const a = TAU * 1.4 * t;
    return { yaw: 0.32 * Math.cos(a) * w, pitch: 0.26 * Math.sin(a) * w, rot: 0.12 * Math.sin(TAU * 0.7 * t) * w, tx: 0.05 * Math.sin(TAU * 0.7 * t) * w, expr: 'confused', exprW: 0.6 };
  },

  // melts into a puddle, eyes half shut, and springs back up
  melt: (t, d) => {
    const down = step(t, 0.1, 0.8) * (1 - pop(clamp((t - (d - 0.65)) / 0.65, 0, 1)));
    return { sy: 1 - 0.42 * down, sx: 1 + 0.32 * down, anchor: 1, shut: 0.4 * down, pitch: 0.2 * down };
  },

  // a ring turns around it like a spinner, and the eyes follow its head
  loading: (t, d) => {
    const w = span(t, d, 0.2, 0.25);
    const head = (TAU * t) / 0.9 - Math.PI / 2;
    const len = 1.1 + 0.8 * Math.sin((TAU * t) / 1.8);
    const trails = halves(arc3d(1.28, 0, 0.35, head - len, len, 0, 0), ramp(70, 60), 0.075, w);
    return { trails, yaw: 0.22 * Math.cos(head) * w, pitch: 0.16 * Math.sin(head) * w };
  },

  // done: turns into a check mark that pops in
  check: (t) => ({ fig: 'check', figW: 1, eyeAlpha: 0, scale: lerp(0.7, 1, pop(t / 0.45)), rot: -0.08 * (1 - pop(t / 0.45)) }),

  // a "?" that tilts its head
  question: (t) => {
    const r = 0.14 * Math.sin(TAU * 0.6 * t);
    return { fig: 'hook', figW: 1, eyeAlpha: 0, rot: r, ty: -0.1, parts: [{ x: 0.02 - 0.9 * Math.sin(r), y: -0.1 + 0.9 * Math.cos(r), r: 0.13, alpha: 1, color: null }] };
  },

  // a nap: eyes shut, slow deep breaths, bubbles rising from the top
  snooze: (t) => {
    const breath = Math.sin((TAU * t) / 1.3);
    const parts: PartSpec[] = [0, 1, 2].map((i) => {
      const u = mod((t - 0.43 * i) / 1.3, 1);
      return { x: 0.62 + 0.38 * u, y: -0.72 - 0.62 * u, r: lerp(0.045, 0.12, u), alpha: smooth(u * 5) * (1 - smooth((u - 0.7) / 0.3)), color: null };
    });
    return { shut: 0.88, sy: 1 + 0.035 * breath, sx: 1 - 0.02 * breath, anchor: 1, pitch: 0.12, parts };
  },

  // a sad cloud, three drops falling from it
  rain: (t) => {
    const parts: PartSpec[] = [0, 1, 2].map((i) => {
      const u = mod((t - 0.27 * i) / 0.8, 1);
      return { x: [-0.42, 0.06, 0.5][i], y: lerp(0.8, 1.55, ease.in(u)), r: 0.075, alpha: smooth(u * 6) * (1 - smooth((u - 0.75) / 0.25)), color: '#5aaaf2' };
    });
    return { fig: 'cloud', figW: 1, expr: 'sad', exprW: 1, ty: -0.12 + 0.03 * Math.sin((TAU * t) / 1.2), parts };
  },

  // a hop and a burst of streamers, very happy
  party: (t) => {
    const trails: TrailSpec[] = Array.from({ length: TRAIL_SLOTS }, (_, k) => {
      const a = (k * TAU) / TRAIL_SLOTS + 0.2 * (k % 2);
      const u = clamp((t - 0.35 - 0.03 * (k % 3)) / 0.9, 0, 1);
      const r0 = lerp(1.05, 1.5, ease.out(u)), r1 = r0 + 0.32 * (1 - u * 0.6);
      const pts = Array.from({ length: TRAIL_POINTS }, (_, i) => {
        const r = lerp(r0, r1, i / (TRAIL_POINTS - 1));
        const bend = 0.18 * (i / (TRAIL_POINTS - 1)) * (k % 2 ? 1 : -1);
        return [r * Math.sin(a + bend), -r * Math.cos(a + bend) + 0.05] as [number, number];
      });
      return { pts, colors: ramp(10 + 30 * k, 50), width: 0.06, alpha: u > 0 ? wave(u) : 0, front: k % 2 === 1 };
    });
    return { ...hop(clamp(t / 0.9, 0, 1)), expr: 'excited', exprW: 1, trails };
  },

  // shivers with fear
  shiver: (t, d) => {
    const w = span(t, d, 0.15, 0.2);
    return { tx: 0.028 * Math.sin(TAU * 13 * t) * w, rot: 0.025 * Math.sin(TAU * 9 * t + 1) * w, sx: 1 - 0.03 * w, sy: 1 - 0.04 * w, anchor: 1, expr: 'scared', exprW: 1 };
  },
};

export function clipPose(anim: Anim, t: number, d: number, seed: number): Pose {
  return { ...rest(), ...CLIPS[anim](clamp(t, 0, d), d, seed) };
}

/** a moment that shows what an animation does, for thumbnails */
export const SHOW_AT: Record<Anim, number> = {
  idle: 0, thinking: 0.3, wink: 0.5, wide: 0.5, alert: 0.5, notification: 0.6, exclaim: 0.5,
  sleep: 0.35, egg: 0.5, hexagon: 0.5, play: 0.45, orbit: 0.5, burst: 0.2, comet: 0.17,
  jump: 0.42, spin: 0.45, nod: 0.18, shake: 0.2, love: 0.08, dizzy: 0.3, melt: 0.5, loading: 0.4, check: 0.6, question: 0.4, snooze: 0.3, rain: 0.3, party: 0.4, shiver: 0.4,
};
