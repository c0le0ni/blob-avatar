// Times as the timeline writes them, in the page's language: "1.6 s", and the clock.

import type { Strings } from '../../i18n/strings';

/** tenths of a second, as "1.6 s" (or "1,6 s") */
export const secs = (S: Strings, v: number) => S.seconds(S.num(v.toFixed(1)));

/** a time on the clock: seconds under a minute ("4.2"), minutes past it ("1:04.2") */
export function clockTime(S: Strings, t: number, long: boolean) {
  if (!long) return S.num(t.toFixed(1));
  const m = Math.floor(t / 60);
  return `${m}:${S.num((t - m * 60).toFixed(1).padStart(4, '0'))}`;
}

/** the clock: where the playhead is, out of the cycle's length */
export const clock = (S: Strings, t: number, length: number) => {
  const long = length >= 60;
  return `${clockTime(S, t, long)} / ${clockTime(S, length, long)}${long ? '' : ' s'}`;
};

/** frames a GIF of this length takes (the export draws one every 50 ms) */
export const gifFrames = (length: number) => Math.max(2, Math.round(length / 0.05));

/** past this many seconds, a GIF gets heavy and the page says so */
export const GIF_LONG = 10;
