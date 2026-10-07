// Animated SVG: every path keeps one structure, so the whole loop is a list of
// keyframes per path that the browser interpolates (SMIL <animate values>). Frames
// that a straight line between their neighbors already explains are dropped.

import type { Contour } from '../engine/contour';
import { frame, VIEW, type RenderModel } from '../engine/frame';
import { loopLength, type BlobState } from '../engine/state';

export interface AnimatedSvgOptions {
  /** pixel size of the square output */
  size?: number;
  /** a solid background, or none */
  bg?: string | null;
  round?: boolean;
  /** frames sampled per second before pruning */
  fps?: number;
  /** how far (in drawing units, out of 200) a dropped frame may be from the line */
  tolerance?: number;
}

interface Track {
  /** per frame: the contours' points, flattened */
  pts: Float64Array[];
  /** per frame: how many points each contour has, to rebuild the path */
  shape: number[];
  /** fill color, or stroke color for a trail */
  fill: string[];
  alpha: number[];
  /** a trail: an open stroked line of this width */
  stroke?: number;
}

const flat = (cs: Contour[]) => {
  const n = cs.reduce((a, c) => a + c.x.length, 0);
  const out = new Float64Array(n * 2);
  let k = 0;
  for (const c of cs) for (let i = 0; i < c.x.length; i++) [out[k++], out[k++]] = [c.x[i], c.y[i]];
  return out;
};

/** a number in tenths, as short as SVG allows: 5 -> ".5", -12 -> "-1.2", 40 -> "4" */
function tenths(t: number): string {
  if (t === 0) return '0';
  const a = Math.abs(t), i = Math.floor(a / 10), f = a % 10;
  const s = f ? (i ? `${i}.${f}` : `.${f}`) : `${i}`;
  return t < 0 ? `-${s}` : s;
}

function join(nums: number[]): string {
  let out = '';
  for (const v of nums) {
    const s = tenths(v);
    out += out && s[0] !== '-' ? ` ${s}` : s;
  }
  return out;
}

/**
 * The same smooth curves as toPath(), written compactly: relative cubic segments
 * on a grid of tenths. Rounding happens before the differences, so nothing drifts,
 * and every frame keeps the same commands, so SMIL can interpolate them.
 */
function pathOf(p: Float64Array, shape: number[]): string {
  let d = '', k = 0;
  for (const n of shape) {
    const x = new Float64Array(n), y = new Float64Array(n);
    for (let i = 0; i < n; i++) [x[i], y[i]] = [p[k++], p[k++]];
    const r = (v: number) => Math.round(v * 10);
    const nums: number[] = [];
    for (let i = 0; i < n; i++) {
      const a = (i - 1 + n) % n, b = (i + 1) % n, c = (i + 2) % n;
      const sx = r(x[i]), sy = r(y[i]);
      nums.push(r(x[i] + (x[b] - x[a]) / 6) - sx, r(y[i] + (y[b] - y[a]) / 6) - sy, r(x[b] - (x[c] - x[i]) / 6) - sx, r(y[b] - (y[c] - y[i]) / 6) - sy, r(x[b]) - sx, r(y[b]) - sy);
    }
    d += `M${join([r(x[0]), r(y[0])])}c${join(nums)}z`;
  }
  return d;
}

/** an open line through the points, in the same compact form */
function openPathOf(p: Float64Array): string {
  const n = p.length / 2;
  const r = (v: number) => Math.round(v * 10);
  const x = (i: number) => p[2 * Math.max(0, Math.min(n - 1, i))];
  const y = (i: number) => p[2 * Math.max(0, Math.min(n - 1, i)) + 1];
  const nums: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const sx = r(x(i)), sy = r(y(i));
    nums.push(r(x(i) + (x(i + 1) - x(i - 1)) / 6) - sx, r(y(i) + (y(i + 1) - y(i - 1)) / 6) - sy, r(x(i + 1) - (x(i + 2) - x(i)) / 6) - sx, r(y(i + 1) - (y(i + 2) - y(i)) / 6) - sy, r(x(i + 1)) - sx, r(y(i + 1)) - sy);
  }
  return `M${join([r(x(0)), r(y(0))])}c${join(nums)}`;
}

function tracks(models: RenderModel[]): Track[] {
  const layer = (get: (m: RenderModel) => { cs: Contour[]; fill: string; alpha: number }, stroke?: number): Track => {
    const first = get(models[0]);
    const t: Track = { pts: [], shape: first.cs.map((c) => c.x.length), fill: [], alpha: [], stroke };
    for (const m of models) {
      const l = get(m);
      t.pts.push(flat(l.cs));
      t.fill.push(l.fill);
      t.alpha.push(Math.round(l.alpha * 1000) / 1000);
    }
    // an invisible frame takes the points of the nearest visible one (around the
    // loop), so a layer fades in and out in place and only jumps while unseen
    const N = t.pts.length - 1; // the last frame is the first one again
    const vis = t.alpha.slice(0, N).map((a) => a > 0.001);
    if (vis.some(Boolean)) {
      const src = t.pts.slice();
      for (let i = 0; i < N; i++) {
        if (vis[i]) continue;
        for (let d = 1; d < N; d++) {
          const k = vis[(i - d + N) % N] ? (i - d + N) % N : vis[(i + d) % N] ? (i + d) % N : -1;
          if (k < 0) continue;
          t.pts[i] = src[k];
          break;
        }
      }
      t.pts[N] = t.pts[0];
    }
    return t;
  };
  // the widest a trail gets in the loop: SMIL keeps a trail's width fixed
  const width = (i: number) => Math.max(...models.map((m) => (m.trails[i].alpha > 0.002 ? m.trails[i].width : 0)));
  return [
    ...models[0].trails.map((_, i) => layer((m) => ({ cs: [{ x: m.trails[i].x, y: m.trails[i].y }], fill: m.trails[i].color, alpha: m.trails[i].alpha }), width(i))),
    layer((m) => ({ cs: [m.body.c], fill: m.body.fill, alpha: m.body.alpha })),
    ...models[0].parts.map((_, i) => layer((m) => ({ cs: [m.parts[i].c], fill: m.parts[i].fill, alpha: m.parts[i].alpha }))),
    ...[0, 1].map((i) => layer((m) => ({ cs: [m.eyes[i].c], fill: m.eyes[i].fill, alpha: m.eyes[i].alpha }))),
  ].filter((t) => t.alpha.some((a) => a > 0.001));
}

/** frame indices to keep: each dropped frame sits within `tol` of the line between its kept neighbors */
export function keyframes(ts: Track[], tol: number): number[] {
  const n = ts[0].pts.length - 1;
  const fits = (a: number, b: number) => {
    for (let f = a + 1; f < b; f++) {
      const u = (f - a) / (b - a);
      for (const t of ts) {
        const pa = t.pts[a], pb = t.pts[b], pf = t.pts[f];
        for (let i = 0; i < pf.length; i++) if (Math.abs(pa[i] + (pb[i] - pa[i]) * u - pf[i]) > tol) return false;
        if (Math.abs(t.alpha[a] + (t.alpha[b] - t.alpha[a]) * u - t.alpha[f]) > 0.03) return false;
        if (t.fill[f] !== t.fill[a] && t.fill[f] !== t.fill[b]) return false;
      }
    }
    return true;
  };
  const keep = [0];
  let a = 0;
  for (let b = 2; b <= n; b++) {
    if (fits(a, b)) continue;
    a = b - 1;
    keep.push(a);
  }
  if (keep[keep.length - 1] !== n) keep.push(n);
  return keep;
}

/** the avatar's whole cycle as one looping SVG */
export function animatedSvg(state: BlobState, opt: AnimatedSvgOptions = {}): string {
  const L = loopLength(state) || 3;
  const fps = opt.fps ?? 24;
  const n = Math.max(2, Math.round(L * fps));
  // n + 1 frames: the last one is the first again, so the loop closes
  const models = Array.from({ length: n + 1 }, (_, i) => frame(state, (i * L) / n));
  const ts = tracks(models);
  const keep = keyframes(ts, opt.tolerance ?? 0.4);
  const keyTimes = keep.map((i) => num4(i / n)).join(';');
  const dur = `${Math.round(L * 1000) / 1000}s`;
  const anim = (attr: string, values: string[], discrete = false) =>
    `<animate attributeName="${attr}" dur="${dur}" repeatCount="indefinite"${discrete ? ' calcMode="discrete"' : ''} keyTimes="${keyTimes}" values="${values.join(';')}"/>`;

  const paths = ts.map((t) => {
    const d = keep.map((i) => (t.stroke !== undefined ? openPathOf(t.pts[i]) : pathOf(t.pts[i], t.shape)));
    const colors = keep.map((i) => t.fill[i]);
    const alphas = keep.map((i) => t.alpha[i]);
    const colorConst = colors.every((f) => f === colors[0]);
    const alphaConst = alphas.every((a) => a === alphas[0]);
    const paint = t.stroke !== undefined ? 'stroke' : 'fill';
    const look = t.stroke !== undefined ? `fill="none" stroke="${colors[0]}" stroke-width="${Math.round(t.stroke * 10) / 10}" stroke-linecap="round" stroke-linejoin="round"` : `fill="${colors[0]}"`;
    const attrs = [`d="${d[0]}"`, look, !alphaConst || alphas[0] < 0.999 ? `${paint}-opacity="${alphas[0]}"` : ''].filter(Boolean).join(' ');
    const anims = [anim('d', d), colorConst ? '' : anim(paint, colors, true), alphaConst ? '' : anim(`${paint}-opacity`, alphas.map(String))].join('');
    return `<path ${attrs}>${anims}</path>`;
  });

  const half = VIEW / 2;
  const s = opt.size ?? 512;
  const bg = opt.bg ? `<rect x="${-half}" y="${-half}" width="${VIEW}" height="${VIEW}" fill="${opt.bg}"/>` : '';
  const body = bg + paths.join('');
  const round = opt.round ? `<defs><clipPath id="round"><circle r="${half}"/></clipPath></defs><g clip-path="url(#round)">${body}</g>` : body;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-half} ${-half} ${VIEW} ${VIEW}" width="${s}" height="${s}">${round}</svg>`;
}

const num4 = (v: number) => String(Math.round(v * 10000) / 10000);
