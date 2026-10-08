// The "blob" wordmark: b, l and b in 8-bit pixels, and the o is a little blob with
// two pixel eyes. The logo keeps its own drawing (it does not follow the editor's
// shapes and faces), so it never changes when the product does. Used in the corner
// of the app (where the o breathes and blinks) and exported as static SVG files for
// coleoni.com, the README and social images.

import { DEFAULT_STATE, frame, cloneState, type BlobState } from './engine';
import { bounds, make, polygonArea, resample, toPath, type Contour, type Pt } from './engine/contour';
import { blink } from './engine/motion';
import { layersMarkup } from './render/svg';

/** pixel size, in wordmark units */
const P = 4;

// rows top to bottom, # = filled pixel
const B = ['#....', '#....', '#....', '####.', '#...#', '#...#', '#...#', '####.'];
const L = ['#', '#', '#', '#', '#', '#', '#', '#'];

/**
 * where the letters and the blob sit, in pixel columns: one column between the
 * letters, and the o as wide as the bowl of the b (five columns, the x-height)
 */
export const LAYOUT = { b1: 0, l: 6, blob: { x: 8, w: 5 }, b2: 14, cols: 19, rows: 8 };

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

// ---------------------------------------------------------------- the o

const LOGO_COLOR = '#aefa0e';
const LOGO_EYES = '#141416';
const R = 54;

/** the o's body: a plain circle (200-unit drawing) */
const logoBody: Contour = (() => {
  const pts: Pt[] = Array.from({ length: 360 }, (_, i) => {
    const a = (i / 360) * Math.PI * 2;
    return [Math.sin(a), -Math.cos(a)];
  });
  const c = resample(pts, 48);
  const b = bounds(c);
  const k = Math.sqrt(Math.PI / polygonArea(c));
  for (let i = 0; i < 48; i++) {
    c.x[i] = (c.x[i] - (b.x0 + b.x1) / 2) * k * R;
    c.y[i] = (c.y[i] - (b.y0 + b.y1) / 2) * k * R + 8;
  }
  return c;
})();

/** the body's width in the 200-unit drawing */
const BODY_W = Math.max(...logoBody.x) - Math.min(...logoBody.x);

/** a pixel eye, one pixel of the wordmark: a square with barely rounded corners, squashed by a blink (open 1..0) */
function pixelEye(cx: number, open: number): Contour {
  const s = BODY_W / LAYOUT.blob.w, r = 0.06 * 0.4 * R;
  const h = Math.max(s * 0.12, s * open);
  const cy = 0.06 * -R + 8 + (s - h) * 0.3;
  const c = make(16);
  const corners: [number, number, number][] = [[s / 2 - r, -h / 2 + r, -Math.PI / 2], [s / 2 - r, h / 2 - r, 0], [-s / 2 + r, h / 2 - r, Math.PI / 2], [-s / 2 + r, -h / 2 + r, Math.PI]];
  corners.forEach(([x, y, a0], k) => {
    for (let i = 0; i < 4; i++) {
      const a = a0 + (Math.PI / 2) * (i / 3);
      c.x[k * 4 + i] = cx + x + r * Math.cos(a);
      c.y[k * 4 + i] = cy + y + r * Math.sin(a);
    }
  });
  return c;
}

/** body, eyes, at time t (breathing and blinking), in the 200-unit drawing */
function logoAt(t: number | null) {
  const b = t === null ? 0 : Math.sin((2 * Math.PI * t) / 3.2);
  const br = { sx: 1 - 0.012 * b, sy: 1 + 0.018 * b };
  const open = t === null ? 1 : blink(t, 11, 6.4);
  const bottom = Math.max(...logoBody.y);
  const body = make(48);
  for (let i = 0; i < 48; i++) {
    body.x[i] = logoBody.x[i] * br.sx;
    body.y[i] = bottom + (logoBody.y[i] - bottom) * br.sy;
  }
  const lift = (1 - br.sy) * 30;
  const eyes = [-1, 1].map((side) => pixelEye(side * 0.36 * R, open));
  for (const e of eyes) for (let i = 0; i < e.y.length; i++) e.y[i] += lift;
  return { body, eyes };
}

/** the mini blob as a transform that fits the 200-unit drawing into the o's box */
export function blobBox() {
  const w = LAYOUT.blob.w * P;
  const x = LAYOUT.blob.x * P;
  const k = w / BODY_W;
  return { x, w, k, cx: x + w / 2 };
}

/** a static wordmark SVG (letters + the o at rest) */
export function wordmarkSvg(opt: { letters?: string; height?: number; live?: boolean } = {}): string {
  const letters = opt.letters ?? '#f5f5f5';
  const m = logoAt(null);
  const b = blobBox();
  const W = LAYOUT.cols * P;
  const H = LAYOUT.rows * P;
  // the o sits on the baseline: its lowest point touches the bottom of the letters
  const low = Math.max(...m.body.y);
  const tr = `translate(${b.cx} ${H - low * b.k}) scale(${b.k})`;
  const mark = (k: string) => (opt.live ? ` data-${k}` : '');
  const eyes = m.eyes.map((e) => `<path${mark('eye')} d="${toPath(e)}" fill="${LOGO_EYES}"/>`).join('');
  const h = opt.height ?? 28;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${Math.round((h * W) / H)}" height="${h}" role="img" aria-label="blob"><path${mark('letters')} d="${lettersPath()}" fill="${letters}"/><g transform="${tr}"><path${mark('body')} d="${toPath(m.body)}" fill="${LOGO_COLOR}"/>${eyes}</g></svg>`;
}

/** bring a live wordmark (rendered with live: true) to life: it breathes and blinks */
export function animateWordmark(host: Element) {
  const body = host.querySelector<SVGPathElement>('[data-body]');
  const eyes = [...host.querySelectorAll<SVGPathElement>('[data-eye]')];
  if (!body || eyes.length !== 2) return (_t: number) => {};
  return (t: number) => {
    const m = logoAt(t);
    body.setAttribute('d', toPath(m.body));
    eyes.forEach((e, i) => e.setAttribute('d', toPath(m.eyes[i])));
  };
}

/** the o alone, in a square box (favicon, the project's own avatar) */
export function markSvg(opt: { size?: number } = {}): string {
  const m = logoAt(null);
  const b = { x0: Math.min(...m.body.x), x1: Math.max(...m.body.x), y0: Math.min(...m.body.y), y1: Math.max(...m.body.y) };
  const side = Math.max(b.x1 - b.x0, b.y1 - b.y0);
  const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
  const vb = [cx - side / 2, cy - side / 2, side, side].map((v) => Math.round(v * 10) / 10).join(' ');
  const eyes = m.eyes.map((e) => `<path d="${toPath(e)}" fill="${LOGO_EYES}"/>`).join('');
  const size = opt.size ?? 512;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="${size}" height="${size}"><path d="${toPath(m.body)}" fill="${LOGO_COLOR}"/>${eyes}</svg>`;
}

/** a row of still blobs made with the editor, for product cards (coleoni.com) and the README */
export function stripSvg(height = 64): string {
  const looks: Partial<BlobState>[] = [
    { shape: 'circle', color: '#aefa0e', expression: 'neutral' },
    { shape: 'pebble', color: '#8b5cf6', expression: 'happy' },
    { shape: 'squircle', color: '#3b82f6', expression: 'attentive' },
    { shape: 'triangle', color: '#f5b400', expression: 'excited' },
    { shape: 'cloud', color: '#ec4899', expression: 'laughing' },
    { shape: 'droplet', color: '#14b8a6', expression: 'curious' },
  ];
  const cell = 130;
  const parts = looks.map((l, i) => `<g transform="translate(${i * cell + cell / 2} 65)">${layersMarkup(frame({ ...cloneState(DEFAULT_STATE), ...l }, 0, { still: true })).body}</g>`);
  const w = looks.length * cell;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} 130" width="${Math.round((height * w) / 130)}" height="${height}" role="img" aria-label="Six blob avatars">${parts.join('')}</svg>`;
}
