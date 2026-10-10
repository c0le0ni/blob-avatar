// The body shapes, and the figures the body turns into during some animations.
// Each one is drawn once as a dense outline and resampled into a BODY_POINTS
// contour, so any of them morphs into any other. Sizes are in body radii: the
// circle has radius 1 and the others fill about the same box, as drawn.

import { bounds, resample, type Contour, type Pt } from './contour';
import { TAU } from './math';

export const BODY_POINTS = 56;

/** in three rows: round, geometric, organic */
export const SHAPES = ['circle', 'pebble', 'squircle', 'capsule', 'triangle', 'diamond', 'hexagon', 'star', 'cloud', 'droplet', 'heart', 'ghost'] as const;
export type Shape = (typeof SHAPES)[number];

/** outlines only animations use */
export const FIGURES = ['egg', 'hexa', 'play', 'stem'] as const;
export type Figure = Shape | (typeof FIGURES)[number];

// ---------------------------------------------------------------- outline helpers

/** a polar outline: angle 0 at the top, clockwise on screen */
function polar(r: (a: number) => number, samples = 720): Pt[] {
  return Array.from({ length: samples }, (_, i) => {
    const a = (i / samples) * TAU;
    const rr = r(a);
    return [rr * Math.sin(a), -rr * Math.cos(a)] as Pt;
  });
}

/** a radius from a short Fourier series: [a0, a1, b1, a2, b2, ...] over the angle from the top */
const series = (c: number[]) => (a: number) => {
  let r = c[0];
  for (let k = 1; 2 * k <= c.length; k++) r += c[2 * k - 1] * Math.cos(k * a) + (c[2 * k] ?? 0) * Math.sin(k * a);
  return r;
};

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

/** a radius from cosines only (shapes symmetric left to right): [a0, a1, a2, ...] */
const cosines = (c: number[]) => (a: number) => c.reduce((r, v, k) => r + v * Math.cos(k * a), 0);

/** a polygon with every corner replaced by a circular arc of the given radius */
function roundedPolygon(verts: Pt[], radius: number, perCorner = 24): Pt[] {
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
    for (let k = 0; k <= perCorner; k++) pts.push([ox + r * Math.cos(a0 + (da * k) / perCorner), oy + r * Math.sin(a0 + (da * k) / perCorner)]);
  }
  return pts;
}

/** the hull of two circles on the vertical axis: radius rt on top, rb at the bottom, h tall in all */
function taper(rt: number, rb: number, h: number, n = 360): Pt[] {
  const yt = -h / 2 + rt, yb = h / 2 - rb;
  const a = Math.asin((rt - rb) / (yb - yt)); // how much the sides lean
  const pts: Pt[] = [];
  // the top arc, from the left tangent point over the top to the right one
  for (let i = 0; i <= n / 2; i++) {
    const t = Math.PI - a + ((Math.PI + 2 * a) * i) / (n / 2);
    pts.push([rt * Math.cos(t), yt + rt * Math.sin(t)]);
  }
  // the bottom arc, from the right tangent point under the bottom to the left one
  for (let i = 0; i <= n / 2; i++) {
    const t = -a + ((Math.PI + 2 * a) * i) / (n / 2);
    pts.push([rb * Math.cos(t), yb + rb * Math.sin(t)]);
  }
  return pts;
}

/** a stadium (a rectangle with fully round ends), w wide and h tall */
export const stadium = (w: number, h: number): Pt[] => roundedPolygon([[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]], (Math.min(w, h) / 2) * 0.999);

/** n corners on a circle of radius R, the first at the top, turned by `turn` */
const regular = (n: number, R: number, turn = 0): Pt[] => Array.from({ length: n }, (_, i) => [R * Math.sin(turn + (i * TAU) / n), -R * Math.cos(turn + (i * TAU) / n)] as Pt);

/**
 * The classic heart curve, y down, scaled by s. Its point is softened (a power p of
 * sin where the curve has 3) and its cleft made shallower (a bump of d, as narrow as
 * m makes it, lifts the top), so the face sits clearly below the cleft.
 */
function heartCurve(p: number, s: number, d: number, m: number, samples = 1440): Pt[] {
  return Array.from({ length: samples }, (_, i) => {
    const t = (i / samples) * TAU;
    const x = 16 * Math.sign(Math.sin(t)) * Math.abs(Math.sin(t)) ** p;
    const y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t) + d * Math.cos(t / 2) ** (2 * m));
    return [x * s, y * s] as Pt;
  });
}

/** a dome of radius r on straight sides, down to a hem of three scallops that hang amp below it */
function ghostOutline(r: number, top: number, hem: number, amp: number): Pt[] {
  const pts: Pt[] = [];
  // the dome, left to right; then the hem, right to left (resampling draws the sides)
  for (let i = 0; i <= 180; i++) pts.push([-r * Math.cos((Math.PI * i) / 180), top - r * Math.sin((Math.PI * i) / 180)]);
  for (let i = 0; i <= 360; i++) pts.push([r - (2 * r * i) / 360, hem + amp * Math.abs(Math.sin((3 * Math.PI * i) / 360))]);
  return pts;
}

// ---------------------------------------------------------------- the outlines

const OUTLINES: Record<Figure, () => Pt[]> = {
  circle: () => polar(() => 1),
  // a river stone: wider than tall, a little fuller on the right
  pebble: () => polar(series([0.9328, 0.0221, 0.01, -0.0585, 0.0325, -0.0297, 0.0163, -0.0015, -0.0002])),
  // a superellipse between a circle and a square
  squircle: () => polar((a) => ((Math.abs(Math.sin(a)) / 0.959) ** 4.179 + (Math.abs(Math.cos(a)) / 0.9552) ** 4.179) ** (-1 / 4.179)),
  capsule: () => stadium(2.0778, 1.2438),
  triangle: () => roundedPolygon([[0, -1.5296], [1.2656, 0.647], [-1.2656, 0.647]], 0.3402),
  // a rhombus, taller than wide
  diamond: () => roundedPolygon([[0, -1.2], [1, 0], [0, 1.2], [-1, 0]], 0.3),
  // flat on top and bottom, a corner on each side
  hexagon: () => roundedPolygon([[-0.5401, -0.9368], [0.5401, -0.9368], [1.0802, 0], [0.5401, 0.9368], [-0.5401, 0.9368], [-1.0802, 0]], 0.2598),
  // five plump points
  star: () => roundedPolygon(regular(10, 1).map(([x, y], i) => [x * (i % 2 ? 0.66 : 1.2), y * (i % 2 ? 0.66 : 1.2)] as Pt), 0.18),
  // a cloud: five round bumps
  cloud: () => polar((a) => unionRay([[0.4723, 0.1392, 0.4949], [0.03, 0.2334, 0.6002], [-0.4322, 0.139, 0.535], [-0.2296, -0.3544, 0.4792], [0.3097, -0.2956, 0.4386]], a), 1440),
  // a drop, its soft tip up
  droplet: () => polar(cosines([0.7341, -0.1584, 0.1602, 0.0675, 0.0383, 0.0278, 0.0236, 0.0189, 0.014, 0.0109, 0.0095, 0.0083, 0.0067, 0.0055, 0.005, 0.0044, 0.0038, 0.0032, 0.003, 0.0027, 0.0024]), 1440),
  // a heart: two lobes on top, a soft point at the bottom
  heart: () => heartCurve(2.5, 0.062, 4, 8),
  // a dome, straight sides and a hem with three scallops
  ghost: () => ghostOutline(0.86, -0.13, 0.77, 0.2),
  egg: () => polar(series([0.8993, -0.0294, -0.0022, 0.0888, -0.0056, 0.0221, -0.0024, 0.013, -0.0016])),
  // a hexagon standing on a corner
  hexa: () => roundedPolygon(regular(6, 1.0483, -0.0273), 0.3179),
  // the play triangle, pointing up and a little to the right
  play: () => roundedPolygon(regular(3, 1.3965, 0.104).map(([x, y]) => [x, y * 1.0083] as Pt), 0.277),
  // the stem of a "!": round, wider at the top
  stem: () => taper(0.131, 0.085, 0.84),
};

/** where each outline starts: the top, or where it crosses the vertical axis (shapes with two tops) */
const START: Partial<Record<Figure, 'axis'>> = { heart: 'axis' };

/**
 * How much lower than the middle of its box a shape sits, in body radii. The lobes
 * make a heart heavy on top: centered on its box it floats high, and big eyes land
 * low, where it narrows. It sits halfway to its center of area instead.
 */
const DROP: Partial<Record<Figure, number>> = { heart: 0.09 };

const cache = new Map<Figure, Contour>();

/** a shape's or figure's contour, centered on its box */
export function shapeContour(fig: Figure): Contour {
  const hit = cache.get(fig);
  if (hit) return hit;
  const c = resample(OUTLINES[fig](), BODY_POINTS, { start: START[fig] });
  const b = bounds(c);
  const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2 - (DROP[fig] ?? 0);
  for (let i = 0; i < BODY_POINTS; i++) {
    c.x[i] -= cx;
    c.y[i] -= cy;
  }
  cache.set(fig, c);
  return c;
}

const RAYS = 128;
const reach = new Map<Shape, Float64Array>();

/** how far the shape's edge is from its center along an angle (0 = up, clockwise), in body radii */
export function edgeAt(shape: Shape, angle: number): number {
  let table = reach.get(shape);
  if (!table) {
    const c = shapeContour(shape);
    const n = c.x.length;
    table = new Float64Array(RAYS);
    for (let i = 0; i < RAYS; i++) {
      const a = (i / RAYS) * TAU, dx = Math.sin(a), dy = -Math.cos(a);
      let best = 0;
      for (let k = 0; k < n; k++) {
        const x1 = c.x[k], y1 = c.y[k], x2 = c.x[(k + 1) % n], y2 = c.y[(k + 1) % n];
        const ex = x2 - x1, ey = y2 - y1, den = dx * ey - dy * ex;
        if (Math.abs(den) < 1e-12) continue;
        const t = (x1 * ey - y1 * ex) / den, u = (x1 * dy - y1 * dx) / den;
        if (t > 0 && u >= -1e-9 && u <= 1 + 1e-9) best = Math.max(best, t);
      }
      table[i] = best;
    }
    reach.set(shape, table);
  }
  const f = ((angle / TAU) * RAYS) % RAYS;
  const i = Math.floor(f < 0 ? f + RAYS : f);
  const u = (f < 0 ? f + RAYS : f) - i;
  return table[i] * (1 - u) + table[(i + 1) % RAYS] * u;
}
