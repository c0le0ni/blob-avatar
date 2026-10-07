// Expressions. Only the eyes change: where each one sits, how big, how wide, how it
// is turned, and where its lids are. An expression is numbers, not a drawing, so
// expressions blend into each other and a blink works on every one of them.
//
// Positions and sizes are in body radii (the body is about 2 across, y points down).
// The lids work in the eye's own frame, where the eye is 1 tall and x is measured
// across its width: -1 at the edge nearest the other eye, 1 at the far edge.

import { make, type Contour } from './contour';
import { capsule, EYE_POINTS } from './glyphs';
import { clamp, lerp } from './math';

export const EXPRESSIONS = ['neutral', 'attentive', 'surprised', 'excited', 'happy', 'laughing', 'angry', 'sad', 'scared', 'suspicious', 'confused', 'curious', 'proud', 'shy', 'unimpressed', 'sleepy'] as const;
export type Expression = (typeof EXPRESSIONS)[number];

export interface EyeParams {
  /** center, in body radii */
  x: number;
  y: number;
  /** height in body radii, and width as a share of the height */
  h: number;
  w: number;
  /** radians; positive turns the top of the eye to the right */
  tilt: number;
  /** upper lid: how far it comes down (0 open, 1 shut), its slope (positive = lower at the far edge) and sag in the middle */
  top: number;
  topSlope: number;
  topSag: number;
  /** lower lid: how far it comes up, its slope, and how much it arches up in the middle (a smile) */
  bottom: number;
  bottomSlope: number;
  bottomArch: number;
}

export interface FaceParams {
  left: EyeParams;
  right: EyeParams;
}

const E = (p: Partial<EyeParams>): EyeParams => ({ x: 0, y: 0, h: 0.4, w: 0.42, tilt: 0, top: 0, topSlope: 0, topSag: 0, bottom: 0, bottomSlope: 0, bottomArch: 0, ...p });

/** the same eye on both sides, mirrored: x and tilt flip for the left eye */
const pair = (p: Partial<EyeParams>): FaceParams => {
  const right = E(p);
  return { left: { ...right, x: -right.x, tilt: -right.tilt }, right };
};

export const FACES: Record<Expression, FaceParams> = {
  // looking up and to the right, the two capsules leaning the same way
  neutral: { left: E({ x: 0.2, y: -0.38, h: 0.37, tilt: -0.42 }), right: E({ x: 0.58, y: -0.5, h: 0.37, tilt: -0.42 }) },
  attentive: pair({ x: 0.28, y: -0.16, h: 0.42, w: 0.44 }),
  surprised: pair({ x: 0.3, y: -0.16, h: 0.44, w: 0.86 }),
  excited: pair({ x: 0.32, y: -0.14, h: 0.48, w: 0.88, bottom: 0.2, bottomArch: 0.12 }),
  // a smiling squint: the lower lids arch up
  happy: pair({ x: 0.3, y: -0.14, h: 0.3, w: 1.15, bottomArch: 0.62 }),
  // shut and curved like a ^
  laughing: pair({ x: 0.3, y: -0.12, h: 0.28, w: 1.5, top: 0.42, topSag: -0.42, bottom: 0.16, bottomArch: 0.42 }),
  angry: pair({ x: 0.29, y: -0.1, h: 0.3, w: 0.92, top: 0.46, topSlope: -0.7 }),
  sad: pair({ x: 0.3, y: -0.04, h: 0.3, w: 0.95, top: 0.36, topSlope: 0.7 }),
  scared: pair({ x: 0.34, y: -0.12, h: 0.36, w: 0.62, top: 0.12, topSlope: 0.45 }),
  suspicious: { left: E({ x: -0.3, y: -0.14, h: 0.3, w: 0.95 }), right: E({ x: 0.3, y: -0.12, h: 0.3, w: 1.4, top: 0.5, bottom: 0.22 }) },
  confused: { left: E({ x: -0.3, y: -0.18, h: 0.44, w: 0.5 }), right: E({ x: 0.3, y: -0.08, h: 0.28, w: 0.75, tilt: 0.3 }) },
  // looking up and to the left, interested
  curious: { left: E({ x: -0.52, y: -0.36, h: 0.4, w: 0.48, tilt: 0.3 }), right: E({ x: -0.12, y: -0.44, h: 0.43, w: 0.5, tilt: 0.3 }) },
  // chin up, lids half down, a little smile
  proud: pair({ x: 0.3, y: -0.24, h: 0.32, w: 1, top: 0.48, topSlope: 0.2, bottomArch: 0.18 }),
  // looking down and away
  shy: { left: E({ x: -0.5, y: 0.08, h: 0.3, w: 0.52, top: 0.18, tilt: 0.2 }), right: E({ x: -0.12, y: 0.12, h: 0.3, w: 0.52, top: 0.18, tilt: 0.2 }) },
  unimpressed: pair({ x: 0.3, y: -0.12, h: 0.32, w: 0.95, top: 0.52 }),
  sleepy: pair({ x: 0.3, y: -0.06, h: 0.32, w: 1.05, top: 0.68, topSag: 0.06 }),
};

const NUM_KEYS = ['x', 'y', 'h', 'w', 'tilt', 'top', 'topSlope', 'topSag', 'bottom', 'bottomSlope', 'bottomArch'] as const;

function blendEye(a: EyeParams, b: EyeParams, t: number): EyeParams {
  const out = { ...a };
  for (const k of NUM_KEYS) out[k] = lerp(a[k], b[k], t);
  return out;
}

export function blendFace(a: FaceParams, b: FaceParams, t: number): FaceParams {
  if (t <= 0) return a;
  if (t >= 1) return b;
  return { left: blendEye(a.left, b.left, t), right: blendEye(a.right, b.right, t) };
}

/**
 * One eye in its own frame (1 tall, centered): the capsule with its lids pressed in
 * and the blink applied. side is -1 for the left eye and 1 for the right one, so a
 * lid slope means the same thing on both. openness: 1 open, 0 shut.
 */
export function shapeEye(p: EyeParams, openness: number, side: -1 | 1): Contour {
  const g = capsule(p.w);
  const c = make(EYE_POINTS);
  const shut = clamp(1 - openness, 0, 1);
  const half = Math.max(0.05, p.w / 2);
  for (let i = 0; i < EYE_POINTS; i++) {
    const x = g.x[i];
    // -1 at the edge nearest the other eye, 1 at the far edge
    const xs = clamp((x / half) * side, -1, 1);
    const bump = 1 - xs * xs;
    let top = -0.5 + p.top + 0.5 * p.topSlope * xs + p.topSag * bump;
    let bot = 0.5 - p.bottom - 0.5 * p.bottomSlope * xs - p.bottomArch * bump;
    // a blink brings both lids to a line a little below the middle
    const mid = (top + bot) / 2 + 0.06;
    top = lerp(top, mid, shut);
    bot = lerp(bot, mid, shut);
    // never thinner than a line
    if (bot - top < 0.12) {
      const m = (top + bot) / 2;
      top = m - 0.06;
      bot = m + 0.06;
    }
    c.x[i] = x;
    c.y[i] = clamp(g.y[i], top, bot);
  }
  return c;
}
