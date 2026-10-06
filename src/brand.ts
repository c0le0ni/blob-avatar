// The "blob" wordmark: b, l and b in 8-bit pixels, and the o is a real little blob
// drawn by the engine. Used in the header (where the o is alive) and exported as a
// static SVG for coleoni.com, the README and social images.

import { DEFAULT_STATE, frame, cloneState, type BlobState } from './engine';
import { toPath } from './engine/contour';

/** pixel size, in wordmark units */
const P = 4;

// rows top to bottom, # = filled pixel
const B = ['#....', '#....', '#....', '####.', '#...#', '#...#', '#...#', '####.'];
const L = ['#', '#', '#', '#', '#', '#', '#', '#'];

/** where the letters and the blob sit, in pixel columns */
export const LAYOUT = { b1: 0, l: 6, blob: { x: 8.6, w: 7.8 }, b2: 17.4, cols: 22.4, rows: 8 };

function pixels(rows: string[], col: number): string {
  let d = '';
  // one rectangle per horizontal run of pixels
  rows.forEach((row, y) => {
    for (const run of row.matchAll(/#+/g)) d += `M${(col + run.index) * P} ${y * P}h${run[0].length * P}v${P}h${-run[0].length * P}Z`;
  });
  return d;
}

/** the letters as one path, in a box of LAYOUT.cols*P by LAYOUT.rows*P */
export const lettersPath = () => pixels(B, LAYOUT.b1) + pixels(L, LAYOUT.l) + pixels(B, LAYOUT.b2);

export const WORDMARK_STATE: BlobState = { ...cloneState(DEFAULT_STATE), shape: 'bean', eyes: 'pixel', expression: 'neutral', seq: [{ anim: 'idle', dur: 3 }], seed: 11 };

/** the mini blob as a transform that fits the engine's 200x200 drawing into the o's box */
export function blobBox() {
  const w = LAYOUT.blob.w * P;
  const x = LAYOUT.blob.x * P;
  // the o sits on the baseline and takes the x-height plus a little
  const h = 5.6 * P;
  const y = LAYOUT.rows * P - h;
  // the engine draws a ~108-unit body centered in 200; scale it to the box width
  const k = w / 118;
  return { x, y, w, h, k, cx: x + w / 2, cy: y + h / 2 };
}

/** a static wordmark SVG (letters + blob at rest) */
export function wordmarkSvg(opt: { letters?: string; blob?: string; eyes?: string; height?: number; live?: boolean } = {}): string {
  const letters = opt.letters ?? '#f5f5f5';
  const s: BlobState = { ...WORDMARK_STATE, color: opt.blob ?? WORDMARK_STATE.color, eyeColor: opt.eyes ?? 'auto' };
  const m = frame(s, 0, { still: true, gaze: [0, 0] });
  const b = blobBox();
  const W = LAYOUT.cols * P;
  const H = LAYOUT.rows * P;
  // sit the blob on the baseline: its lowest point touches the bottom of the letters
  let low = -Infinity;
  for (const y of m.body.c.y) low = Math.max(low, y);
  const tr = `translate(${b.cx} ${H - low * b.k}) scale(${b.k})`;
  const mark = (k: string) => (opt.live ? ` data-${k}` : '');
  const eyes = m.eyes.map((e) => `<path${mark('eye')} d="${toPath(e.c)}" fill="${e.fill}"/>`).join('');
  const h = opt.height ?? 28;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${Math.round((h * W) / H)}" height="${h}" role="img" aria-label="blob"><path d="${lettersPath()}" fill="${letters}"/><g transform="${tr}"><path${mark('body')} d="${toPath(m.body.c)}" fill="${s.color}"/>${eyes}</g></svg>`;
}

/** bring a live wordmark (rendered with live: true) to life: it breathes, blinks and looks around */
export function animateWordmark(host: Element) {
  const body = host.querySelector<SVGPathElement>('[data-body]');
  const eyes = [...host.querySelectorAll<SVGPathElement>('[data-eye]')];
  if (!body || eyes.length !== 2) return (_t: number, _gaze?: [number, number] | null) => {};
  return (t: number, gaze: [number, number] | null = null) => {
    const m = frame(WORDMARK_STATE, t, { gaze });
    body.setAttribute('d', toPath(m.body.c));
    eyes.forEach((e, i) => e.setAttribute('d', toPath(m.eyes[i].c)));
  };
}
