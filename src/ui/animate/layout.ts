// The timeline's geometry, as plain numbers: how many pixels a second takes, where
// the ruler's marks go, and where a dragged clip lands. Nothing here touches the
// page, so all of it is tested on its own.

/** the narrowest a clip is drawn, so the shortest one still shows its thumbnail and can be picked up */
export const MIN_CHIP = 28;

/** ruler steps, in seconds: the first one whose labels sit far enough apart wins */
export const TICK_STEPS = [0.5, 1, 2, 5, 10, 30, 60] as const;

/** the least room between two labels on the ruler */
export const LABEL_GAP = 48;

/** zoom levels, as times the width that fits */
export const ZOOMS = [1, 1.5, 2, 3, 4, 6, 8] as const;

const sum = (v: readonly number[]) => v.reduce((n, d) => n + d, 0);

/**
 * Pixels per second: the whole cycle fits `width` at zoom 1, unless that makes the
 * shortest clip narrower than MIN_CHIP; then the track scrolls instead.
 */
export function pxPerSec(durs: readonly number[], width: number, zoom = 1): number {
  const length = sum(durs);
  const shortest = durs.length ? Math.min(...durs) : 1;
  const floor = MIN_CHIP / Math.max(0.1, shortest);
  const fit = length > 0 && width > 0 ? width / length : floor;
  return Math.max(fit, floor) * Math.max(1, zoom);
}

/** the ruler's step: the shortest one whose labels are at least LABEL_GAP apart */
export const tickStep = (pps: number): number => TICK_STEPS.find((s) => s * pps >= LABEL_GAP) ?? TICK_STEPS[TICK_STEPS.length - 1];

export interface Tick {
  t: number;
  /** a mark with a label (every step), or a short one between two */
  label: boolean;
}

/** the marks along the ruler from 0 to `length`: a labelled one every step and a short one halfway (at least 24px apart) */
export function ticks(length: number, pps: number): Tick[] {
  const unit = tickStep(pps) / 2;
  const n = Math.floor(length / unit + 1e-6);
  const out: Tick[] = [];
  for (let i = 0; i <= n; i++) out.push({ t: Math.round(i * unit * 1000) / 1000, label: i % 2 === 0 });
  return out;
}

/** a time on the track as x, and back; `pad` is the room before 0 */
export const xOf = (t: number, pps: number, pad = 0) => pad + t * pps;
export const tOf = (x: number, pps: number, pad = 0) => Math.max(0, (x - pad) / pps);

/** the start of each clip, in seconds */
export function startsOf(durs: readonly number[]): number[] {
  const at: number[] = [];
  let t = 0;
  for (const d of durs) {
    at.push(t);
    t += d;
  }
  return at;
}

/** the clip under a time (the last one past the end) */
export function clipAt(durs: readonly number[], t: number): number {
  let end = 0;
  for (let i = 0; i < durs.length; i++) {
    end += durs[i];
    if (t < end) return i;
  }
  return Math.max(0, durs.length - 1);
}

/**
 * Where a dragged clip lands: as many places in as there are other clips whose
 * middle comes before `t` (the pointer, in seconds, on the track as it was before the drag).
 */
export function dropIndex(durs: readonly number[], from: number, t: number): number {
  let at = 0;
  let to = 0;
  durs.forEach((d, j) => {
    if (j !== from && at + d / 2 < t) to++;
    at += d;
  });
  return to;
}

/** the time, on the track as it was before the drag, where the line goes that shows a drop from `from` to `to` */
export function dropAt(durs: readonly number[], from: number, to: number): number {
  const at = startsOf(durs);
  if (!durs.length) return 0;
  return to <= from ? at[Math.max(0, to)] : at[Math.min(to, durs.length - 1)] + durs[Math.min(to, durs.length - 1)];
}

/** how fast the track scrolls by itself while something is dragged near an edge, in px per frame (negative: to the left) */
export function edgeSpeed(x: number, left: number, right: number, zone = 40, max = 14): number {
  if (right - left < zone * 3) zone = (right - left) / 3;
  if (x < left + zone) return -max * Math.min(1, (left + zone - x) / zone);
  if (x > right - zone) return max * Math.min(1, (x - (right - zone)) / zone);
  return 0;
}

/** the next zoom level in or out from `z` */
export function zoomStep(z: number, dir: 1 | -1): number {
  if (dir > 0) return ZOOMS.find((v) => v > z + 1e-6) ?? ZOOMS[ZOOMS.length - 1];
  return [...ZOOMS].reverse().find((v) => v < z - 1e-6) ?? ZOOMS[0];
}
