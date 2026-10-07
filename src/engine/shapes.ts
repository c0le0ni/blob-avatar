// The body shapes, and the figures the body turns into during some animations.
// Each one is drawn once as a dense outline and resampled into a BODY_POINTS
// contour, so any of them morphs into any other. Shapes are scaled to the area of
// a unit circle (no shape looks bigger than another); figures keep their own size.

import { bounds, polygonArea, resample, type Contour, type Pt } from './contour';
import { TAU } from './math';

export const BODY_POINTS = 48;

export const SHAPES = ['circle', 'pebble', 'squircle', 'capsule', 'triangle', 'hexagon', 'cloud', 'droplet'] as const;
export type Shape = (typeof SHAPES)[number];

/** outlines only animations use: an egg, the stem of a "!", a play triangle */
export const FIGURES = ['egg', 'bar', 'play'] as const;
export type Figure = Shape | (typeof FIGURES)[number];

/** where the eyes sit on each shape: an offset and a scale for the face, in body radii */
export interface FaceSpot {
  x: number;
  y: number;
  s: number;
}

// ---------------------------------------------------------------- outline helpers

/** a polar outline: angle 0 at the top, clockwise on screen */
function polar(r: (a: number) => number, samples = 360): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i < samples; i++) {
    const a = (i / samples) * TAU;
    const rr = r(a);
    pts.push([rr * Math.sin(a), -rr * Math.cos(a)]);
  }
  return pts;
}

/** a polygon with every corner replaced by a circular arc of the given radius */
function roundedPolygon(verts: Pt[], radius: number, perCorner = 16): Pt[] {
  const pts: Pt[] = [];
  const n = verts.length;
  for (let i = 0; i < n; i++) {
    const [px, py] = verts[(i - 1 + n) % n];
    const [cx, cy] = verts[i];
    const [nx, ny] = verts[(i + 1) % n];
    const la = Math.hypot(px - cx, py - cy), lb = Math.hypot(nx - cx, ny - cy);
    const ux = (px - cx) / la, uy = (py - cy) / la, vx = (nx - cx) / lb, vy = (ny - cy) / lb;
    const half = Math.acos(Math.max(-1, Math.min(1, ux * vx + uy * vy))) / 2;
    const cut = Math.min(radius / Math.tan(half), la / 2, lb / 2);
    const r = cut * Math.tan(half);
    // the arc's center sits on the bisector of the corner
    const bx = ux + vx, by = uy + vy;
    const bl = Math.hypot(bx, by) || 1;
    const dist = r / Math.sin(half);
    const ox = cx + (bx / bl) * dist, oy = cy + (by / bl) * dist;
    const a0 = Math.atan2(cy + uy * cut - oy, cx + ux * cut - ox);
    let da = Math.atan2(cy + vy * cut - oy, cx + vx * cut - ox) - a0;
    while (da > Math.PI) da -= TAU;
    while (da < -Math.PI) da += TAU;
    for (let k = 0; k <= perCorner; k++) {
      const a = a0 + (da * k) / perCorner;
      pts.push([ox + r * Math.cos(a), oy + r * Math.sin(a)]);
    }
  }
  return pts;
}

/** a stadium (a rectangle with fully round ends), w wide and h tall */
export function stadium(w: number, h: number): Pt[] {
  const r = Math.min(w, h) / 2;
  return roundedPolygon([[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]], r * 0.999, 24);
}

/** distance from the origin to the far edge of a union of circles, along an angle */
function unionRay(circles: [number, number, number][], a: number): number {
  const dx = Math.sin(a), dy = -Math.cos(a);
  let best = 0;
  for (const [cx, cy, r] of circles) {
    const b = dx * cx + dy * cy;
    const disc = b * b - (cx * cx + cy * cy - r * r);
    if (disc >= 0) best = Math.max(best, b + Math.sqrt(disc));
  }
  return best;
}

const regular = (n: number, r: number, turn = 0): Pt[] => Array.from({ length: n }, (_, i) => [r * Math.sin(turn + (i * TAU) / n), -r * Math.cos(turn + (i * TAU) / n)] as Pt);

// ---------------------------------------------------------------- the outlines

const OUTLINES: Record<Figure, () => Pt[]> = {
  circle: () => polar(() => 1),
  // a river stone: a little wider than tall, softly uneven
  pebble: () => polar((a) => 1 + 0.07 * Math.cos(2 * (a - 0.45)) + 0.025 * Math.cos(3 * a + 0.8)).map(([x, y]) => [x * 1.04, y * 0.9]),
  // a superellipse: between a circle and a square
  squircle: () => polar((a) => (Math.abs(Math.sin(a)) ** 4 + Math.abs(Math.cos(a)) ** 4) ** -0.25),
  capsule: () => stadium(2.5, 1.45),
  triangle: () => roundedPolygon(regular(3, 1.25), 0.46),
  hexagon: () => roundedPolygon(regular(6, 1.06), 0.3),
  // a cloud: bumps on top, a calmer base
  cloud: () => {
    const c: [number, number, number][] = [[-0.66, 0.16, 0.56], [-0.24, -0.3, 0.64], [0.34, -0.26, 0.6], [0.7, 0.18, 0.52], [0.02, 0.32, 0.7]];
    return polar((a) => unionRay(c, a), 480);
  },
  // a drop with its soft tip up
  droplet: () =>
    Array.from({ length: 240 }, (_, i) => {
      const t = (i / 240) * TAU;
      return [Math.sin(t) * Math.sin(t / 2) ** 1.3, -Math.cos(t) * 1.15] as Pt;
    }),
  // wider at the bottom than at the top
  egg: () => polar(() => 1).map(([x, y]) => [x * (0.8 + 0.1 * y), y * 1.08] as Pt),
  bar: () => stadium(0.62, 1.9),
  play: () => roundedPolygon(regular(3, 1.2, TAU / 4), 0.42),
};

/** eyes on a triangle or a drop sit lower and closer, where the shape is wide */
export const FACE: Record<Shape, FaceSpot> = {
  circle: { x: 0, y: 0, s: 1 },
  pebble: { x: 0, y: 0.03, s: 0.98 },
  squircle: { x: 0, y: 0, s: 1 },
  capsule: { x: 0.06, y: 0.12, s: 0.82 },
  triangle: { x: 0, y: 0.34, s: 0.74 },
  hexagon: { x: 0, y: 0.02, s: 0.96 },
  cloud: { x: 0, y: 0.1, s: 0.9 },
  droplet: { x: 0, y: 0.32, s: 0.8 },
};

const isShape = (f: Figure): f is Shape => (SHAPES as readonly string[]).includes(f);
const cache = new Map<Figure, Contour>();

/** the contour of a shape (at the area of a unit circle) or a figure (at its own size), centered */
export function shapeContour(fig: Figure): Contour {
  const hit = cache.get(fig);
  if (hit) return hit;
  const c = resample(OUTLINES[fig](), BODY_POINTS);
  const b = bounds(c);
  const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
  const k = isShape(fig) ? Math.sqrt(Math.PI / polygonArea(c)) : 1;
  for (let i = 0; i < BODY_POINTS; i++) {
    c.x[i] = (c.x[i] - cx) * k;
    c.y[i] = (c.y[i] - cy) * k;
  }
  cache.set(fig, c);
  return c;
}
