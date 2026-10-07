// The eye: one capsule (a stadium), drawn at any width-to-height ratio. Tall and
// narrow is the resting eye; as wide as tall it is a round eye; wider than tall it
// is a flat bar. Expressions only change the numbers, so eyes always morph cleanly.

import { make, type Contour } from './contour';

export const EYE_POINTS = 28;

const cache = new Map<number, Contour>();

/**
 * A capsule `w` wide and 1 tall, centered, with EYE_POINTS points evenly spaced
 * along its outline, starting at the top middle and going clockwise on screen.
 */
export function capsule(w: number): Contour {
  const key = Math.round(w * 200) / 200;
  const hit = cache.get(key);
  if (hit) return hit;
  const W = Math.max(0.05, key), H = 1;
  const r = Math.min(W, H) / 2;
  const sx = W / 2 - r, sy = H / 2 - r; // half lengths of the straight parts
  // the outline as segments: top, right cap, right side, bottom, left cap, left side
  const arcLen = (Math.PI / 2) * r;
  const parts = [sx, arcLen, 2 * sy, arcLen, 2 * sx, arcLen, 2 * sy, arcLen, sx];
  const total = parts.reduce((a, b) => a + b, 0);
  const at = (d: number): [number, number] => {
    let s = d;
    // top edge, from the middle to the right
    if (s <= parts[0]) return [s, -H / 2];
    s -= parts[0];
    const corner = (cx: number, cy: number, a0: number, u: number): [number, number] => {
      const a = a0 + u / r;
      return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
    };
    if (s <= parts[1]) return corner(sx, -sy, -Math.PI / 2, s);
    s -= parts[1];
    if (s <= parts[2]) return [W / 2, -sy + s];
    s -= parts[2];
    if (s <= parts[3]) return corner(sx, sy, 0, s);
    s -= parts[3];
    if (s <= parts[4]) return [sx - s, H / 2];
    s -= parts[4];
    if (s <= parts[5]) return corner(-sx, sy, Math.PI / 2, s);
    s -= parts[5];
    if (s <= parts[6]) return [-W / 2, sy - s];
    s -= parts[6];
    if (s <= parts[7]) return corner(-sx, -sy, Math.PI, s);
    s -= parts[7];
    return [-sx + s, -H / 2];
  };
  const c = make(EYE_POINTS);
  for (let i = 0; i < EYE_POINTS; i++) [c.x[i], c.y[i]] = at((i / EYE_POINTS) * total);
  cache.set(key, c);
  return c;
}

/** a circle of radius 1 with EYE_POINTS points: the dots some animations draw */
export const disc = (() => {
  const c = make(EYE_POINTS);
  for (let i = 0; i < EYE_POINTS; i++) {
    const a = (i / EYE_POINTS) * Math.PI * 2;
    c.x[i] = Math.sin(a);
    c.y[i] = -Math.cos(a);
  }
  return c;
})();
