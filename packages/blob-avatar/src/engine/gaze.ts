// The eyes following a point (the cursor): where the point is from the blob, as a
// gaze of -1..1 on each axis, and the spring that eases the eyes toward it. The
// embed and the editor's stage share both, so the stage looks the way the embed
// will.

/** where the eyes look and how fast they are moving: [x, y, vx, vy] */
export type Gaze = readonly [number, number, number, number];

/** where a point is from the center of a box, over a reach on each axis, clamped to -1..1 */
export function gazeTarget(px: number, py: number, r: { left: number; top: number; width: number; height: number }, reachX: number, reachY: number): [number, number] {
  const k = (v: number) => Math.max(-1, Math.min(1, v));
  return [k((px - r.left - r.width / 2) / reachX), k((py - r.top - r.height / 2) / reachY)];
}

/** one step of a critically damped spring from the gaze toward the target (the stiffness is 12²) */
export function springGaze(g: Gaze, target: readonly [number, number], dt: number): Gaze {
  const vx = g[2] + ((target[0] - g[0]) * 144 - 24 * g[2]) * dt;
  const vy = g[3] + ((target[1] - g[1]) * 144 - 24 * g[3]) * dt;
  return [g[0] + vx * dt, g[1] + vy * dt, vx, vy];
}
