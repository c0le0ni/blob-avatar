// The body shapes. Each one is drawn once as a dense outline, scaled to the same area
// as a unit circle (so no shape looks bigger than another), and resampled into a
// BODY_POINTS contour. The face sits where each shape has room for it.

import { bounds, polygonArea, resample, type Contour, type Pt } from './contour';
import { TAU } from './math';

export const BODY_POINTS = 48;

export const SHAPES = ['orb', 'bean', 'block', 'pill', 'tri', 'hex', 'puff', 'drop', 'ghost', 'star'] as const;
export type Shape = (typeof SHAPES)[number];

/** where the eyes go on each shape: vertical position (in body radii, up is negative), spread and size */
export interface FaceSpot {
  y: number;
  spread: number;
  size: number;
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
function roundedPolygon(verts: Pt[], radius: number, perCorner = 14): Pt[] {
  const pts: Pt[] = [];
  const n = verts.length;
  for (let i = 0; i < n; i++) {
    const [px, py] = verts[(i - 1 + n) % n];
    const [cx, cy] = verts[i];
    const [nx, ny] = verts[(i + 1) % n];
    const ax = px - cx, ay = py - cy;
    const bx = nx - cx, by = ny - cy;
    const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
    const ux = ax / la, uy = ay / la, vx = bx / lb, vy = by / lb;
    const half = Math.acos(Math.max(-1, Math.min(1, ux * vx + uy * vy))) / 2;
    const cut = Math.min(radius / Math.tan(half), la / 2, lb / 2);
    const r = cut * Math.tan(half);
    // the arc's center sits on the bisector
    const bxs = ux + vx, bys = uy + vy;
    const bl = Math.hypot(bxs, bys) || 1;
    const dist = r / Math.sin(half);
    const ox = cx + (bxs / bl) * dist, oy = cy + (bys / bl) * dist;
    const sx = cx + ux * cut, sy = cy + uy * cut;
    const ex = cx + vx * cut, ey = cy + vy * cut;
    let a0 = Math.atan2(sy - oy, sx - ox);
    let a1 = Math.atan2(ey - oy, ex - ox);
    // go the short way round
    let da = a1 - a0;
    while (da > Math.PI) da -= TAU;
    while (da < -Math.PI) da += TAU;
    for (let k = 0; k <= perCorner; k++) {
      const a = a0 + (da * k) / perCorner;
      pts.push([ox + r * Math.cos(a), oy + r * Math.sin(a)]);
    }
    void a1;
  }
  return pts;
}

/** distance from the origin to the far edge of a union of circles, along an angle */
function unionRay(circles: [number, number, number][], a: number): number {
  const dx = Math.sin(a), dy = -Math.cos(a);
  let best = 0;
  for (const [cx, cy, r] of circles) {
    // |o + t d - c| = r  ->  t^2 - 2 t (d.c) + |c|^2 - r^2 = 0
    const b = dx * cx + dy * cy;
    const disc = b * b - (cx * cx + cy * cy - r * r);
    if (disc < 0) continue;
    best = Math.max(best, b + Math.sqrt(disc));
  }
  return best;
}

// ---------------------------------------------------------------- the shapes

const OUTLINES: Record<Shape, () => Pt[]> = {
  orb: () => polar(() => 1),
  // a soft bean: a touch wider than tall, fuller at the bottom, a little flat underneath
  bean: () =>
    polar(() => 1).map(([x, y]) => {
      const sag = y > 0 ? 1 + 0.08 * y : 1;
      return [x * 1.06 * sag, (y > 0 ? y * (1 - 0.05 * y) : y) * 0.95];
    }),
  // the Coleoni square: generous corners, like the dot in the logo
  block: () => roundedPolygon([[-0.95, -0.95], [0.95, -0.95], [0.95, 0.95], [-0.95, 0.95]], 0.42),
  pill: () => roundedPolygon([[-1.3, -0.78], [1.3, -0.78], [1.3, 0.78], [-1.3, 0.78]], 0.78, 24),
  tri: () => roundedPolygon([[0, -1.2], [1.25, 0.9], [-1.25, 0.9]], 0.5, 18),
  hex: () => roundedPolygon(Array.from({ length: 6 }, (_, i) => [Math.sin((i * TAU) / 6), -Math.cos((i * TAU) / 6)] as Pt), 0.3),
  // a cloud: bumps on top, calmer underneath
  puff: () => {
    const c: [number, number, number][] = [[-0.62, 0.12, 0.6], [-0.22, -0.32, 0.66], [0.32, -0.28, 0.62], [0.68, 0.14, 0.56], [0.05, 0.3, 0.72]];
    return polar((a) => unionRay(c, a), 480);
  },
  // a drop pointing up
  drop: () => {
    const cy = 0.25, r = 0.98, tip = -1.32;
    const d = cy - tip;
    const open = Math.acos(r / d);
    const pts: Pt[] = [[0, tip]];
    for (let i = 0; i <= 90; i++) {
      const a = open + ((TAU - 2 * open) * i) / 90;
      pts.push([r * Math.sin(a), cy - r * Math.cos(a)]);
    }
    return pts;
  },
  // a little ghost: a dome, straight sides and a wavy hem
  ghost: () => {
    const pts: Pt[] = [];
    const top = -0.2, hem = 0.95;
    for (let i = 0; i <= 60; i++) {
      const a = -Math.PI / 2 + (Math.PI * i) / 60;
      pts.push([Math.sin(a), top - Math.cos(a)]);
    }
    for (let i = 1; i <= 20; i++) pts.push([1, top + ((hem - top) * i) / 20]);
    for (let i = 1; i < 60; i++) {
      const x = 1 - (2 * i) / 60;
      pts.push([x, hem + 0.12 * Math.cos(x * 3 * Math.PI)]);
    }
    for (let i = 0; i < 20; i++) pts.push([-1, hem - ((hem - top) * i) / 20]);
    return pts;
  },
  // a soft five-point star
  star: () => polar((a) => 1 + 0.2 * Math.cos(5 * a)),
};

export const FACE: Record<Shape, FaceSpot> = {
  orb: { y: -0.1, spread: 1, size: 1 },
  bean: { y: -0.06, spread: 1, size: 1 },
  block: { y: -0.08, spread: 1, size: 1 },
  pill: { y: -0.02, spread: 1.2, size: 0.95 },
  tri: { y: 0.28, spread: 0.82, size: 0.82 },
  hex: { y: -0.04, spread: 0.98, size: 0.96 },
  puff: { y: 0.06, spread: 1, size: 0.95 },
  drop: { y: 0.3, spread: 0.9, size: 0.9 },
  ghost: { y: -0.16, spread: 0.95, size: 1 },
  star: { y: 0.04, spread: 0.8, size: 0.82 },
};

const cache = new Map<Shape, Contour>();

/** the shape's contour at unit area (same area as a circle of radius 1), centered */
export function shapeContour(shape: Shape): Contour {
  const hit = cache.get(shape);
  if (hit) return hit;
  const c = resample(OUTLINES[shape](), BODY_POINTS);
  // center on the bounding box, then scale to the area of a unit circle
  const b = bounds(c);
  const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
  for (let i = 0; i < BODY_POINTS; i++) {
    c.x[i] -= cx;
    c.y[i] -= cy;
  }
  const k = Math.sqrt(Math.PI / polygonArea(c));
  for (let i = 0; i < BODY_POINTS; i++) {
    c.x[i] *= k;
    c.y[i] *= k;
  }
  cache.set(shape, c);
  return c;
}
