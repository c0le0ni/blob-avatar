// Faces. An expression is a set of numbers per eye (size, stretch, tilt, offset and
// two lids), not a drawing, so expressions blend into each other and lids can close
// any eye style. Each eye works in its own frame: x points away from the nose
// (so one set of numbers describes both eyes), y points down, the eye is ~1 tall.

import { blend, clone, make, size, type Contour } from './contour';
import { EYE_POINTS, eyeContour, FIXED_GLYPHS, type Eye } from './glyphs';
import { clamp, lerp } from './math';

export const EXPRESSIONS = ['neutral', 'happy', 'joy', 'sleepy', 'sad', 'angry', 'surprised', 'wink', 'love', 'starry', 'dizzy', 'focused', 'suspicious', 'shy', 'worried', 'smug'] as const;
export type Expression = (typeof EXPRESSIONS)[number];

export interface EyeParams {
  /** replaces the eye style while this expression is on (hearts, stars…) */
  glyph?: Eye;
  scale: number;
  sx: number;
  sy: number;
  /** radians, positive tilts the top of the eye away from the nose */
  tilt: number;
  dx: number;
  dy: number;
  /** how far the upper lid comes down (0 open, 1 shut), its slope (positive = lower away from the nose) and sag */
  top: number;
  topSlope: number;
  topSag: number;
  /** how far the lower lid comes up, and how much it arches (a smiling squint) */
  bottom: number;
  bottomArch: number;
}

export interface FaceParams {
  left: EyeParams;
  right: EyeParams;
  /** blush on the cheeks, 0..1 */
  cheeks: number;
}

const E = (p: Partial<EyeParams> = {}): EyeParams => ({ scale: 1, sx: 1, sy: 1, tilt: 0, dx: 0, dy: 0, top: 0, topSlope: 0, topSag: 0, bottom: 0, bottomArch: 0, ...p });
const both = (p: Partial<EyeParams>, cheeks = 0): FaceParams => ({ left: E(p), right: E(p), cheeks });

export const FACES: Record<Expression, FaceParams> = {
  neutral: both({}),
  happy: both({ bottom: 0.08, bottomArch: 0.36, dy: -0.02 }, 0.45),
  joy: both({ glyph: 'arc', scale: 1.08, dy: -0.04 }, 0.7),
  sleepy: both({ top: 0.5, topSag: 0.06, sy: 0.92, dy: 0.06 }),
  sad: both({ top: 0.2, topSlope: 0.38, tilt: 0.12, dy: 0.06, sy: 0.95 }),
  angry: both({ top: 0.24, topSlope: -0.5, sy: 0.96 }),
  surprised: both({ scale: 1.22, sy: 1.06, dy: -0.05 }),
  wink: { left: E({ bottom: 0.06, bottomArch: 0.3 }), right: E({ glyph: 'arc', scale: 1 }), cheeks: 0.4 },
  love: both({ glyph: 'heart', scale: 1.22, dy: -0.02 }, 0.8),
  starry: both({ glyph: 'star', scale: 1.3, dy: -0.03 }),
  dizzy: both({ glyph: 'cross', scale: 1.02 }),
  focused: both({ sx: 1.08, top: 0.26, bottom: 0.16, topSlope: -0.12 }),
  suspicious: { left: E({ top: 0.42, bottom: 0.12, topSlope: -0.1 }), right: E({ top: 0.16, sx: 1.04 }), cheeks: 0 },
  shy: both({ scale: 0.88, dy: 0.14, top: 0.12, topSlope: 0.12 }, 1),
  worried: both({ scale: 1.08, top: 0.08, topSlope: 0.34, tilt: -0.08, dy: -0.02 }),
  smug: { left: E({ top: 0.4, topSlope: 0.14, bottomArch: 0.14 }), right: E({ top: 0.46, topSlope: 0.14, bottomArch: 0.14 }), cheeks: 0.25 },
};

const NUM_KEYS = ['scale', 'sx', 'sy', 'tilt', 'dx', 'dy', 'top', 'topSlope', 'topSag', 'bottom', 'bottomArch'] as const;

function blendEye(a: EyeParams, b: EyeParams, t: number): EyeParams {
  const out = { ...a, glyph: t < 0.5 ? a.glyph : b.glyph } as EyeParams;
  for (const k of NUM_KEYS) out[k] = lerp(a[k], b[k], t);
  return out;
}

export function blendFace(a: FaceParams, b: FaceParams, t: number): FaceParams {
  if (t <= 0) return a;
  if (t >= 1) return b;
  return { left: blendEye(a.left, b.left, t), right: blendEye(a.right, b.right, t), cheeks: lerp(a.cheeks, b.cheeks, t) };
}

/** glyph morphs need the outline itself to blend, not just the parameters */
export function glyphBlend(base: Eye, a: EyeParams, b: EyeParams | null, t: number): Contour {
  const ga = eyeContour(a.glyph ?? base);
  if (!b || t <= 0) return ga;
  const gb = eyeContour(b.glyph ?? base);
  return ga === gb ? ga : blend(ga, gb, t);
}

/**
 * One eye in its own frame: the glyph with lids pressed in and the blink applied.
 * openness: 1 open, 0 shut. Returns a new contour (eye units, centered).
 */
export function shapeEye(glyph: Contour, p: EyeParams, openness: number, fixed: boolean): Contour {
  const c = clone(glyph);
  const n = size(c);
  const shut = clamp(1 - openness, 0, 1);
  if (fixed) {
    // hearts, stars, crosses and closed eyes don't have lids: a blink just flattens them
    const k = 1 - shut * 0.85;
    for (let i = 0; i < n; i++) c.y[i] = c.y[i] * k + shut * 0.08;
    return c;
  }
  for (let i = 0; i < n; i++) {
    const x = c.x[i];
    const bump = 1 - 4 * x * x;
    let top = -0.52 + p.top + p.topSlope * x + p.topSag * bump;
    let bot = 0.52 - p.bottom - p.bottomArch * bump;
    // the blink brings both lids to a line a little below the middle
    const mid = (top + bot) / 2 + 0.1;
    top = lerp(top, mid, shut);
    bot = lerp(bot, mid, shut);
    // never thinner than a line
    if (bot - top < 0.09) {
      const m = (top + bot) / 2;
      top = m - 0.045;
      bot = m + 0.045;
    }
    c.y[i] = clamp(c.y[i], top, bot);
  }
  return c;
}

export const isFixed = (eye: Eye) => FIXED_GLYPHS.includes(eye);

/** an empty contour of eye size, for slots that draw nothing */
export const emptyEye = () => make(EYE_POINTS);
