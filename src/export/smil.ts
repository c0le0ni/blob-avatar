// Animated SVG: every path keeps one structure, so the whole loop is a list of
// keyframes per path that the browser interpolates (SMIL <animate values>). Frames
// that a straight line between their neighbors already explains are dropped.

import type { Contour } from '../engine/contour';
import { frame, VIEW, type RenderModel } from '../engine/frame';
import { loopLength, type BlobState } from '../engine/state';
import { bgMarkup } from '../render/svg';

export interface AnimatedSvgOptions {
  /** pixel size of the square output */
  size?: number;
  circle?: boolean;
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
  fill: string[];
  alpha: number[];
  rule?: string;
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

function tracks(models: RenderModel[]): Track[] {
  const layer = (get: (m: RenderModel) => { cs: Contour[]; fill: string; alpha: number }, rule?: string): Track => {
    const first = get(models[0]);
    const t: Track = { pts: [], shape: first.cs.map((c) => c.x.length), fill: [], alpha: [], rule };
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
  const hole = models[0].holes.length > 0;
  return [
    layer((m) => ({ cs: [m.body.c, ...m.holes], fill: m.body.fill, alpha: 1 }), hole ? 'evenodd' : undefined),
    ...[0, 1].map((i) => layer((m) => ({ cs: [m.cheeks[i].c], fill: m.cheeks[i].fill, alpha: m.cheeks[i].alpha }))),
    ...[0, 1].map((i) => layer((m) => ({ cs: [m.eyes[i].c], fill: m.eyes[i].fill, alpha: m.eyes[i].alpha }))),
    ...models[0].decor.map((_, i) => layer((m) => ({ cs: [m.decor[i].c], fill: m.decor[i].fill, alpha: m.decor[i].alpha }))),
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

/** the avatar's whole montage as one looping SVG */
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
    const d = keep.map((i) => pathOf(t.pts[i], t.shape));
    const fills = keep.map((i) => t.fill[i]);
    const alphas = keep.map((i) => t.alpha[i]);
    const fillConst = fills.every((f) => f === fills[0]);
    const alphaConst = alphas.every((a) => a === alphas[0]);
    const attrs = [`d="${d[0]}"`, `fill="${fills[0]}"`, t.rule ? `fill-rule="${t.rule}"` : '', !alphaConst || alphas[0] < 0.999 ? `fill-opacity="${alphas[0]}"` : ''].filter(Boolean).join(' ');
    const anims = [anim('d', d), fillConst ? '' : anim('fill', fills, true), alphaConst ? '' : anim('fill-opacity', alphas.map(String))].join('');
    return `<path ${attrs}>${anims}</path>`;
  });

  const half = VIEW / 2;
  const s = opt.size ?? 512;
  const bg = bgMarkup(state.bg, 'bg');
  const clip = opt.circle ? `<clipPath id="round"><circle r="${half}"/></clipPath>` : '';
  const defs = bg.defs || clip ? `<defs>${bg.defs}${clip}</defs>` : '';
  const body = bg.rect + paths.join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-half} ${-half} ${VIEW} ${VIEW}" width="${s}" height="${s}">${defs}${opt.circle ? `<g clip-path="url(#round)">${body}</g>` : body}</svg>`;
}

const num4 = (v: number) => String(Math.round(v * 10000) / 10000);
