// Eye glyphs: the outline of one eye, in eye units (about 1 tall, centered on 0),
// resampled to EYE_POINTS so any glyph morphs into any other.

import { resample, type Contour, type Pt } from './contour';
import { TAU } from './math';

export const EYE_POINTS = 28;

export const EYES = ['block', 'dot', 'pill', 'oval', 'pixel', 'heart', 'star', 'cross', 'arc'] as const;
export type Eye = (typeof EYES)[number];

/** an axis-aligned rounded rectangle, w x h, corner radius r */
function roundRect(w: number, h: number, r: number, per = 10): Pt[] {
  const pts: Pt[] = [];
  const hw = w / 2, hh = h / 2;
  const corners: [number, number, number][] = [[hw - r, -hh + r, -Math.PI / 2], [hw - r, hh - r, 0], [-hw + r, hh - r, Math.PI / 2], [-hw + r, -hh + r, Math.PI]];
  for (const [cx, cy, a0] of corners) for (let i = 0; i <= per; i++) {
    const a = a0 + (Math.PI / 2) * (i / per);
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return pts;
}

const ellipse = (w: number, h: number): Pt[] => Array.from({ length: 120 }, (_, i) => {
  const a = (i / 120) * TAU;
  return [(w / 2) * Math.sin(a), -(h / 2) * Math.cos(a)] as Pt;
});

const OUTLINES: Record<Eye, () => Pt[]> = {
  // the default: a block with soft corners, a little taller than wide
  block: () => roundRect(0.74, 1, 0.24),
  dot: () => ellipse(0.82, 0.82),
  pill: () => roundRect(0.46, 1.12, 0.23, 16),
  oval: () => ellipse(0.7, 1),
  pixel: () => roundRect(0.86, 0.86, 0.06, 3),
  heart: () =>
    Array.from({ length: 160 }, (_, i) => {
      const t = (i / 160) * TAU;
      const x = 16 * Math.sin(t) ** 3;
      const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
      return [x / 30, -y / 30 - 0.05] as Pt;
    }),
  star: () =>
    Array.from({ length: 10 }, (_, i) => {
      const r = i % 2 ? 0.25 : 0.62;
      const a = (i / 10) * TAU;
      return [r * Math.sin(a), -r * Math.cos(a) + 0.04] as Pt;
    }),
  cross: () => {
    // an X made of two bars, w = bar width
    const w = 0.15, l = 0.44;
    const arm = (a: number): Pt[] => {
      const c = Math.cos(a), s = Math.sin(a);
      return [[c * l - s * w, s * l + c * w], [c * l + s * w, s * l - c * w]];
    };
    const out: Pt[] = [];
    for (let k = 0; k < 4; k++) {
      const a = Math.PI / 4 + (k * Math.PI) / 2;
      const [p1, p2] = arm(a);
      out.push(p2, p1);
      // the inner corner between this arm and the next
      const m = a + Math.PI / 4;
      out.push([Math.cos(m) * w * Math.SQRT2, Math.sin(m) * w * Math.SQRT2]);
    }
    return out.map(([x, y]) => [x, y] as Pt);
  },
  // a closed, smiling eye: a thick upside-down U
  arc: () => {
    const pts: Pt[] = [];
    const R = 0.4, r = 0.2, cy = 0.2;
    for (let i = 0; i <= 40; i++) {
      const a = Math.PI + (Math.PI * i) / 40;
      pts.push([R * Math.cos(a), cy + R * Math.sin(a)]);
    }
    for (let i = 0; i <= 12; i++) {
      const a = (Math.PI * i) / 12;
      pts.push([R - (R - r) / 2 + ((R - r) / 2) * Math.cos(a), cy + ((R - r) / 2) * Math.sin(a)]);
    }
    for (let i = 0; i <= 40; i++) {
      const a = -(Math.PI * i) / 40;
      pts.push([r * Math.cos(a), cy + r * Math.sin(a)]);
    }
    for (let i = 0; i <= 12; i++) {
      const a = (Math.PI * i) / 12;
      pts.push([-r - (R - r) / 2 + ((R - r) / 2) * Math.cos(a), cy + ((R - r) / 2) * Math.sin(a)]);
    }
    return pts;
  },
};

const cache = new Map<Eye, Contour>();

export function eyeContour(eye: Eye): Contour {
  const hit = cache.get(eye);
  if (hit) return hit;
  const c = resample(OUTLINES[eye](), EYE_POINTS);
  cache.set(eye, c);
  return c;
}

/** glyphs drawn as a fixed figure: lids don't apply to them, a blink squeezes them instead */
export const FIXED_GLYPHS: readonly Eye[] = ['heart', 'star', 'cross', 'arc'];
