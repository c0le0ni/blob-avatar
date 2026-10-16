// The storyboard's geometry, as plain numbers: which clip a time falls in, where a
// dragged card lands, how the others make room, and how fast the row scrolls by
// itself near its edges. Nothing here touches the page, so all of it is tested on
// its own. A card is one unit wide: `pps` pixels, after `pad`.

/** a pointer's x on the row as a place in cards, and back; `pad` is the room before the first */
export const tOf = (x: number, pps: number, pad = 0) => Math.max(0, (x - pad) / pps);

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
 * middle comes before `t` (the pointer, on the row as it was before the drag).
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

/** how a card moves, in cards, while another goes from `from` to `to`: out of the way of the place it takes */
export function makeRoom(i: number, from: number, to: number): -1 | 0 | 1 {
  if (i === from || from === to) return 0;
  if (from < to && i > from && i <= to) return -1;
  if (to < from && i >= to && i < from) return 1;
  return 0;
}

/** how fast the row scrolls by itself while a card is dragged near an edge, in px per frame (negative: to the left) */
export function edgeSpeed(x: number, left: number, right: number, zone = 40, max = 14): number {
  if (right - left < zone * 3) zone = (right - left) / 3;
  if (x < left + zone) return -max * Math.min(1, (left + zone - x) / zone);
  if (x > right - zone) return max * Math.min(1, (x - (right - zone)) / zone);
  return 0;
}
