// A contour is a closed outline with a fixed number of points. Every body and every
// eye in the engine is one, so any two of them can be blended point by point (that's
// how shapes and faces morph) and every frame has the same path structure (that's
// what makes animated SVG and GIF export simple).

export interface Contour {
  x: Float64Array;
  y: Float64Array;
}

export type Pt = [number, number];

export const make = (n: number): Contour => ({ x: new Float64Array(n), y: new Float64Array(n) });

export const size = (c: Contour) => c.x.length;

/**
 * Turn a dense closed polyline into a contour of n points evenly spaced along its
 * length, starting at the top (the highest point nearest the vertical axis) and going
 * clockwise on screen. Even spacing keeps morphs from bunching up.
 */
export function resample(poly: Pt[], n: number): Contour {
  // orientation: make it clockwise on screen (y down) = positive signed area
  let area = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i + 1) % poly.length];
    area += x1 * y2 - x2 * y1;
  }
  const pts = area < 0 ? [...poly].reverse() : poly;
  // start at the top: lowest y, then smallest |x|
  let start = 0;
  for (let i = 1; i < pts.length; i++) {
    const [x, y] = pts[i];
    const [sx, sy] = pts[start];
    if (y < sy - 1e-6 || (Math.abs(y - sy) <= 1e-6 && Math.abs(x) < Math.abs(sx))) start = i;
  }
  const ring = [...pts.slice(start), ...pts.slice(0, start)];
  const lens = [0];
  for (let i = 1; i <= ring.length; i++) {
    const [ax, ay] = ring[i - 1];
    const [bx, by] = ring[i % ring.length];
    lens.push(lens[i - 1] + Math.hypot(bx - ax, by - ay));
  }
  const total = lens[ring.length];
  const out = make(n);
  let j = 0;
  for (let k = 0; k < n; k++) {
    const d = (k / n) * total;
    while (j < ring.length - 1 && lens[j + 1] < d) j++;
    const [ax, ay] = ring[j];
    const [bx, by] = ring[(j + 1) % ring.length];
    const seg = lens[j + 1] - lens[j] || 1;
    const t = (d - lens[j]) / seg;
    out.x[k] = ax + (bx - ax) * t;
    out.y[k] = ay + (by - ay) * t;
  }
  return out;
}

export function clone(c: Contour): Contour {
  return { x: new Float64Array(c.x), y: new Float64Array(c.y) };
}

/** blend a into b by t (both must have the same size) */
export function blend(a: Contour, b: Contour, t: number, out = make(size(a))): Contour {
  for (let i = 0; i < out.x.length; i++) {
    out.x[i] = a.x[i] + (b.x[i] - a.x[i]) * t;
    out.y[i] = a.y[i] + (b.y[i] - a.y[i]) * t;
  }
  return out;
}

export function polygonArea(c: Contour): number {
  let a = 0;
  const n = size(c);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    a += c.x[i] * c.y[j] - c.x[j] * c.y[i];
  }
  return Math.abs(a) / 2;
}

export function bounds(c: Contour) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < size(c); i++) {
    x0 = Math.min(x0, c.x[i]);
    x1 = Math.max(x1, c.x[i]);
    y0 = Math.min(y0, c.y[i]);
    y1 = Math.max(y1, c.y[i]);
  }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
}

/** scale and move in place: p' = p * (sx, sy) + (tx, ty) */
export function affine(c: Contour, sx: number, sy: number, tx: number, ty: number): Contour {
  for (let i = 0; i < size(c); i++) {
    c.x[i] = c.x[i] * sx + tx;
    c.y[i] = c.y[i] * sy + ty;
  }
  return c;
}

/** rotate in place around (cx, cy), angle in radians */
export function rotate(c: Contour, a: number, cx = 0, cy = 0): Contour {
  if (!a) return c;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  for (let i = 0; i < size(c); i++) {
    const dx = c.x[i] - cx;
    const dy = c.y[i] - cy;
    c.x[i] = cx + dx * cos - dy * sin;
    c.y[i] = cy + dx * sin + dy * cos;
  }
  return c;
}

/** a number with at most one decimal, without trailing zeros or "-0" */
export const num = (v: number) => {
  const r = Math.round(v * 10) / 10;
  return (Object.is(r, -0) ? 0 : r).toString();
};

/**
 * The SVG path of a contour as smooth cubic curves through every point
 * (Catmull-Rom tangents). Always "M + n C + Z", whatever the shape.
 */
export function toPath(c: Contour, tension = 1): string {
  const n = size(c);
  const { x, y } = c;
  const k = tension / 6;
  let d = `M${num(x[0])} ${num(y[0])}`;
  for (let i = 0; i < n; i++) {
    const p0 = (i - 1 + n) % n;
    const p2 = (i + 1) % n;
    const p3 = (i + 2) % n;
    const c1x = x[i] + (x[p2] - x[p0]) * k;
    const c1y = y[i] + (y[p2] - y[p0]) * k;
    const c2x = x[p2] - (x[p3] - x[i]) * k;
    const c2y = y[p2] - (y[p3] - y[i]) * k;
    d += `C${num(c1x)} ${num(c1y)} ${num(c2x)} ${num(c2y)} ${num(x[p2])} ${num(y[p2])}`;
  }
  return d + 'Z';
}

/** the same curves, drawn on a canvas path */
export function toCanvas(c: Contour, ctx: { moveTo(x: number, y: number): void; bezierCurveTo(a: number, b: number, c: number, d: number, e: number, f: number): void; closePath(): void }, tension = 1) {
  const n = size(c);
  const { x, y } = c;
  const k = tension / 6;
  ctx.moveTo(x[0], y[0]);
  for (let i = 0; i < n; i++) {
    const p0 = (i - 1 + n) % n;
    const p2 = (i + 1) % n;
    const p3 = (i + 2) % n;
    ctx.bezierCurveTo(x[i] + (x[p2] - x[p0]) * k, y[i] + (y[p2] - y[p0]) * k, x[p2] - (x[p3] - x[i]) * k, y[p2] - (y[p3] - y[i]) * k, x[p2], y[p2]);
  }
  ctx.closePath();
}
