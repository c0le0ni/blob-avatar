// The body shapes, and the figures the body turns into during some animations.
// Each one is drawn once as a dense outline and resampled into a BODY_POINTS
// contour, so any of them morphs into any other. Sizes are in body radii: the
// circle has radius 1 and the others fill about the same box, as drawn.

import { bounds, resample, type Contour, type Pt } from './contour';
import { TAU } from './math';

export const BODY_POINTS = 56;

/** in rows of four: round, geometric, organic, creatures, then the rest */
export const SHAPES = ['circle', 'pebble', 'squircle', 'capsule', 'triangle', 'diamond', 'hexagon', 'star', 'cloud', 'droplet', 'heart', 'ghost', 'cat', 'bear', 'bunny', 'amoeba', 'flower', 'clover', 'leaf', 'gem', 'bubble'] as const;
export type Shape = (typeof SHAPES)[number];

/** outlines only animations use */
export const FIGURES = ['egg', 'hexa', 'play', 'stem', 'check', 'hook'] as const;
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

/** a circle as a dense outline */
const ring = (cx: number, cy: number, r: number, n = 360): Pt[] => Array.from({ length: n }, (_, i) => [cx + r * Math.sin((i / n) * TAU), cy - r * Math.cos((i / n) * TAU)] as Pt);

/** an outline turned by `a` radians (clockwise on screen) around the origin, then moved */
const place = (pts: Pt[], a: number, dx = 0, dy = 0): Pt[] => pts.map(([x, y]) => [x * Math.cos(a) - y * Math.sin(a) + dx, x * Math.sin(a) + y * Math.cos(a) + dy] as Pt);

/**
 * A thick line along a path, as an outline: both sides offset by half the width
 * (mitred at the bends) and a round cap at each end.
 */
function stroke(path: Pt[], half: number, cap = 24): Pt[] {
  const n = path.length;
  const side = (sign: number) =>
    path.map((p, i) => {
      const a = path[Math.max(0, i - 1)], b = path[Math.min(n - 1, i + 1)];
      // the normal at a point: the average of its two segments', stretched at a bend so the width holds
      const n1 = norm(i > 0 ? [p[1] - a[1], a[0] - p[0]] : [b[1] - p[1], p[0] - b[0]]);
      const n2 = norm(i < n - 1 ? [b[1] - p[1], p[0] - b[0]] : n1);
      const m = norm([n1[0] + n2[0], n1[1] + n2[1]]);
      const k = half / Math.max(0.35, m[0] * n1[0] + m[1] * n1[1]);
      return [p[0] + sign * m[0] * k, p[1] + sign * m[1] * k] as Pt;
    });
  const left = side(1), right = side(-1).reverse();
  const arc = (c: Pt, from: Pt): Pt[] => {
    const a0 = Math.atan2(from[1] - c[1], from[0] - c[0]);
    return Array.from({ length: cap }, (_, i) => [c[0] + half * Math.cos(a0 + (Math.PI * (i + 1)) / (cap + 1)), c[1] + half * Math.sin(a0 + (Math.PI * (i + 1)) / (cap + 1))] as Pt);
  };
  return [...left, ...arc(path[n - 1], left[n - 1]), ...right, ...arc(path[0], right[n - 1])];
}
const norm = (v: Pt): Pt => {
  const l = Math.hypot(v[0], v[1]) || 1;
  return [v[0] / l, v[1] / l];
};

// Shapes made of parts (a head and ears, petals, a bubble and its tail) are distance
// fields joined smoothly, so every crease between two parts gets a real fillet,
// and the outline is traced along rays from the center.

/** how far a point is outside a shape (negative inside) */
type Field = (x: number, y: number) => number;

const disk = (cx: number, cy: number, r: number): Field => (x, y) => Math.hypot(x - cx, y - cy) - r;

/** a capsule: a segment from (ax, ay) to (bx, by), r around it */
const pill = (ax: number, ay: number, bx: number, by: number, r: number): Field => (x, y) => {
  const ex = bx - ax, ey = by - ay, wx = x - ax, wy = y - ay;
  const t = Math.max(0, Math.min(1, (wx * ex + wy * ey) / (ex * ex + ey * ey)));
  return Math.hypot(wx - ex * t, wy - ey * t) - r;
};

/** a polygon grown by r all round, so its corners are arcs of radius r */
const grown = (v: Pt[], r: number): Field => (x, y) => {
  let d = Infinity, inside = false;
  for (let i = 0, j = v.length - 1; i < v.length; j = i++) {
    const [ax, ay] = v[j], [bx, by] = v[i];
    const ex = bx - ax, ey = by - ay, wx = x - ax, wy = y - ay;
    const t = Math.max(0, Math.min(1, (wx * ex + wy * ey) / (ex * ex + ey * ey)));
    d = Math.min(d, Math.hypot(wx - ex * t, wy - ey * t));
    if (ay > y !== by > y && x < ((bx - ax) * (y - ay)) / (by - ay) + ax) inside = !inside;
  }
  return (inside ? -d : d) - r;
};

/** the parts as one, each crease between two of them rounded over about k */
const joined = (k: number, ...parts: Field[]): Field => (x, y) =>
  parts.reduce((a, f) => {
    const b = f(x, y);
    const h = Math.max(k - Math.abs(a - b), 0) / k;
    return Math.min(a, b) - (h * h * k) / 4;
  }, Infinity);

/** the outline of a field, as seen from the origin: along each ray, the last point inside */
const traced = (f: Field) =>
  polar((a) => {
    const dx = Math.sin(a), dy = -Math.cos(a);
    let r = 1.8;
    while (r > 0 && f(r * dx, r * dy) > 0) r -= 0.01;
    let lo = r, hi = r + 0.01;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (f(mid * dx, mid * dy) > 0) hi = mid;
      else lo = mid;
    }
    return lo;
  }, 1440);

/** the heads of the shapes with ears, where the eyes go */
const catHead = () => ring(0, 0.15, 0.95);
const bunnyHead = () => ring(0, 0.32, 0.82);

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
  // a round head with two pointed ears
  cat: () => traced(joined(0.09, disk(0, 0.15, 0.95), grown([[-0.66, -0.36], [-0.76, -0.94], [-0.26, -0.68]], 0.09), grown([[0.66, -0.36], [0.76, -0.94], [0.26, -0.68]], 0.09))),
  // a round head with two round ears
  bear: () => traced(joined(0.14, disk(0, 0.15, 0.95), disk(-0.68, -0.6, 0.33), disk(0.68, -0.6, 0.33))),
  // a round head with two long ears, leaning out
  bunny: () => traced(joined(0.14, disk(0, 0.32, 0.82), pill(-0.27, -0.16, -0.4, -0.8, 0.18), pill(0.27, -0.16, 0.4, -0.8, 0.18))),
  // six round petals around a round middle
  flower: () => traced(joined(0.1, disk(0, 0, 0.74), ...Array.from({ length: 6 }, (_, i) => disk(0.66 * Math.sin((i * TAU) / 6), -0.66 * Math.cos((i * TAU) / 6), 0.4)))),
  // a speech bubble: a soft square with a tail at the bottom left
  bubble: () => traced(joined(0.14, grown([[-0.52, -0.34], [0.52, -0.34], [0.52, 0.24], [-0.52, 0.24]], 0.48), grown([[-0.7, 0.36], [-0.3, 0.6], [-0.76, 1.04]], 0.06))),
  // an amoeba: a blob with soft uneven lobes
  amoeba: () => polar((a) => 0.93 + 0.075 * Math.cos(2 * a + 0.7) + 0.065 * Math.sin(3 * a + 0.2) + 0.035 * Math.cos(5 * a + 1.3)),
  // a cut gem: flat top, slanted shoulders, a point at the bottom
  gem: () => roundedPolygon([[-0.56, -0.88], [0.56, -0.88], [1.06, -0.3], [0, 1.08], [-1.06, -0.3]], 0.16),
  // four round leaves
  clover: () => traced(joined(0.12, disk(-0.43, -0.43, 0.53), disk(0.43, -0.43, 0.53), disk(0.43, 0.43, 0.53), disk(-0.43, 0.43, 0.53))),
  // a leaf: two arcs meeting in points, leaning to the right
  leaf: () => place([...ring(0.36, 0, 1.11, 720).filter(([x]) => x <= 0.001), ...ring(-0.36, 0, 1.11, 720).filter(([x]) => x >= -0.001)].sort((p, q) => Math.atan2(p[0], -p[1]) - Math.atan2(q[0], -q[1])), 0.55),
  egg: () => polar(series([0.8993, -0.0294, -0.0022, 0.0888, -0.0056, 0.0221, -0.0024, 0.013, -0.0016])),
  // a hexagon standing on a corner
  hexa: () => roundedPolygon(regular(6, 1.0483, -0.0273), 0.3179),
  // the play triangle, pointing up and a little to the right
  play: () => roundedPolygon(regular(3, 1.3965, 0.104).map(([x, y]) => [x, y * 1.0083] as Pt), 0.277),
  // the stem of a "!": round, wider at the top
  stem: () => taper(0.131, 0.085, 0.84),
  // a check mark, thick and round at the ends
  check: () => stroke([[-0.7, -0.02], [-0.22, 0.46], [0.74, -0.52]], 0.21),
  // the hook of a "?": most of a circle, then a short drop
  hook: () => stroke([...Array.from({ length: 28 }, (_, i) => { const a = -2.5 + (i / 27) * 3.6; return [0.4 * Math.cos(a), -0.3 + 0.4 * Math.sin(a)] as Pt; }), [0.02, 0.28]], 0.17),
};

/** where each outline starts: the top, or where it crosses the vertical axis (shapes with two tops) */
const START: Partial<Record<Figure, 'axis'>> = { heart: 'axis' };

/**
 * How much lower than the middle of its box a shape sits, in body radii. The lobes
 * make a heart heavy on top: centered on its box it floats high, and big eyes land
 * low, where it narrows. It sits halfway to its center of area instead.
 */
const DROP: Partial<Record<Figure, number>> = { heart: 0.09 };

/** shapes whose face is only part of them (a head with ears): the eyes fit in that part */
const FACE: Partial<Record<Shape, () => Pt[]>> = { cat: catHead, bear: catHead, bunny: bunnyHead };

/** how big the face is beside the circle's: the eyes are drawn that much smaller, so a small head keeps its eyes in proportion */
const FACE_SIZE: Partial<Record<Shape, number>> = { cat: 0.95, bear: 0.95, bunny: 0.82 };
export const faceSize = (shape: Shape) => FACE_SIZE[shape] ?? 1;

const cache = new Map<Figure, Contour>();
/** how far each outline was moved to center it on its box */
const offsets = new Map<Figure, Pt>();

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
  offsets.set(fig, [cx, cy]);
  return c;
}

/** the part of a shape the eyes fit in, in the shape's own place: the whole shape, or its head */
export function faceContour(shape: Shape): Contour {
  const head = FACE[shape];
  if (!head) return shapeContour(shape);
  shapeContour(shape);
  const [cx, cy] = offsets.get(shape)!;
  const c = resample(head(), BODY_POINTS);
  for (let i = 0; i < BODY_POINTS; i++) {
    c.x[i] -= cx;
    c.y[i] -= cy;
  }
  return c;
}

const RAYS = 128;
const reach = new Map<Shape, Float64Array>();

/** how far the edge of the shape's face is from its center along an angle (0 = up, clockwise), in body radii */
export function edgeAt(shape: Shape, angle: number): number {
  let table = reach.get(shape);
  if (!table) {
    const c = faceContour(shape);
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
