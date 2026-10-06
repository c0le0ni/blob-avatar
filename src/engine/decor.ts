// Little things around the blob: z's when it sleeps, hearts, sparks, stars, a drop
// of sweat. Every one has the same number of points, so a slot can turn from one
// kind into another and the animated SVG stays simple.

import { resample, type Contour, type Pt } from './contour';
import { eyeContour, EYE_POINTS } from './glyphs';
import { TAU } from './math';

export const DECOR = ['z', 'heart', 'spark', 'star', 'sweat', 'dot'] as const;
export type DecorKind = (typeof DECOR)[number];

export const DECOR_SLOTS = 6;

export interface Particle {
  kind: DecorKind;
  /** body units, from the body's center */
  x: number;
  y: number;
  /** size in body units */
  s: number;
  rot: number;
  alpha: number;
}

export const DECOR_COLORS: Record<DecorKind, string> = {
  z: '#cfcfc8',
  heart: '#ff5a7a',
  spark: '#ffd23f',
  star: '#ffd23f',
  sweat: '#7cc8ff',
  dot: '#cfcfc8',
};

const OUTLINES: Record<DecorKind, () => Pt[]> = {
  // a chunky Z
  z: () => [[-0.42, -0.45], [0.42, -0.45], [0.42, -0.25], [-0.08, 0.25], [0.42, 0.25], [0.42, 0.45], [-0.42, 0.45], [-0.42, 0.25], [0.08, -0.25], [-0.42, -0.25]],
  heart: () => [],
  star: () => [],
  // a four-point sparkle with concave sides
  spark: () =>
    Array.from({ length: 64 }, (_, i) => {
      const a = (i / 64) * TAU;
      const r = 0.12 + 0.38 * Math.abs(Math.cos(2 * a)) ** 3;
      return [r * Math.sin(a), -r * Math.cos(a)] as Pt;
    }),
  // a drop of sweat, pointing up
  sweat: () =>
    Array.from({ length: 80 }, (_, i) => {
      const a = (i / 80) * TAU;
      const r = 0.32 + 0.16 * Math.cos(a) ** 8 * (Math.cos(a) > 0 ? 1 : 0);
      return [r * Math.sin(a) * 0.85, -r * Math.cos(a) + 0.08] as Pt;
    }),
  dot: () => Array.from({ length: 48 }, (_, i) => [0.3 * Math.sin((i / 48) * TAU), -0.3 * Math.cos((i / 48) * TAU)] as Pt),
};

const cache = new Map<DecorKind, Contour>();

export function decorContour(kind: DecorKind): Contour {
  const hit = cache.get(kind);
  if (hit) return hit;
  const c = kind === 'heart' || kind === 'star' ? eyeContour(kind) : resample(OUTLINES[kind](), EYE_POINTS);
  cache.set(kind, c);
  return c;
}
