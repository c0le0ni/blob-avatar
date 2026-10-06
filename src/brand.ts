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

/** the mini blob alone, in a square box (favicon, avatars of the project itself) */
export function markSvg(opt: { color?: string; size?: number } = {}): string {
  const s: BlobState = { ...WORDMARK_STATE, color: opt.color ?? WORDMARK_STATE.color };
  const m = frame(s, 0, { still: true, gaze: [0, 0] });
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < m.body.c.x.length; i++) {
    x0 = Math.min(x0, m.body.c.x[i]);
    x1 = Math.max(x1, m.body.c.x[i]);
    y0 = Math.min(y0, m.body.c.y[i]);
    y1 = Math.max(y1, m.body.c.y[i]);
  }
  const side = Math.max(x1 - x0, y1 - y0);
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const vb = [cx - side / 2, cy - side / 2, side, side].map((v) => Math.round(v * 10) / 10).join(' ');
  const eyes = m.eyes.map((e) => `<path d="${toPath(e.c)}" fill="${e.fill}"/>`).join('');
  const size = opt.size ?? 512;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="${size}" height="${size}"><path d="${toPath(m.body.c)}" fill="${s.color}"/>${eyes}</svg>`;
}

/** a row of still blobs, for product cards (coleoni.com) and the README */
export function stripSvg(height = 64): string {
  const looks: Partial<BlobState>[] = [
    { shape: 'bean', color: '#aefa0e', eyes: 'block', expression: 'neutral' },
    { shape: 'ghost', color: '#8a6cff', eyes: 'pixel', expression: 'happy' },
    { shape: 'star', color: '#ffd23f', eyes: 'dot', expression: 'starry' },
    { shape: 'orb', color: '#ff6a5c', eyes: 'pill', expression: 'smug' },
    { shape: 'puff', color: '#4ea3ff', eyes: 'oval', expression: 'sleepy' },
    { shape: 'block', color: '#f3eee4', eyes: 'block', expression: 'love' },
  ];
  const cell = 130;
  const parts = looks.map((l, i) => {
    const m = frame({ ...WORDMARK_STATE, eyes: 'block', ...l }, 0, { still: true, gaze: [0, 0] });
    const layers = [`<path d="${toPath(m.body.c)}" fill="${m.body.fill}"/>`, ...[...m.cheeks, ...m.eyes].filter((c) => c.alpha > 0).map((c) => `<path d="${toPath(c.c)}" fill="${c.fill}"${c.alpha < 0.999 ? ` fill-opacity="${Math.round(c.alpha * 100) / 100}"` : ''}/>`)];
    return `<g transform="translate(${i * cell + cell / 2} 58)">${layers.join('')}</g>`;
  });
  const w = looks.length * cell;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} 130" width="${Math.round((height * w) / 130)}" height="${height}" role="img" aria-label="Six blob avatars">${parts.join('')}</svg>`;
}
