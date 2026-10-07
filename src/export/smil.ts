// Animated SVG: every path keeps one structure, so the whole loop is a list of
// keyframes per path that the browser interpolates (SMIL <animate values>). Frames
// that a straight line between their neighbors already explains are dropped.

import type { Contour } from '../engine/contour';
import { frame, VIEW, type RenderModel } from '../engine/frame';
import { loopLength, type BlobState } from '../engine/state';
import { hasGap } from '../render/svg';

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
  /** fill color, or a trail's gradient stops joined by commas */
  fill: string[];
  alpha: number[];
  /** a trail: an open stroked line of this width */
  stroke?: number;
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
  const layer = (get: (m: RenderModel) => { cs: Contour[]; fill: string; alpha: number }, stroke?: number, rule?: string): Track => {
    const first = get(models[0]);
    const t: Track = { pts: [], shape: first.cs.map((c) => c.x.length), fill: [], alpha: [], stroke, rule };
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
  const lines = (side: 'back' | 'front') =>
    models[0][side].map((_, i) => {
      const width = Math.max(...models.map((m) => (m[side][i].alpha > 0.002 ? m[side][i].width : 0)));
      return layer((m) => ({ cs: [{ x: m[side][i].x, y: m[side][i].y }], fill: m[side][i].colors.join(','), alpha: m[side][i].alpha }), width);
    });
  return [
    ...lines('back'),
    layer((m) => ({ cs: [m.body.c], fill: m.body.fill, alpha: m.body.alpha }), undefined, 'body'),
    ...models[0].parts.map((_, i) => layer((m) => ({ cs: [m.parts[i].c], fill: m.parts[i].fill, alpha: m.parts[i].alpha }))),
    ...[0, 1].map((i) => layer((m) => ({ cs: [m.eyes[i].c], fill: m.eyes[i].fill, alpha: m.eyes[i].alpha }))),
    ...lines('front'),
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
  // the round gap some animations cut into the body: a clip, animated like the rest
  const gapped = models.some((m) => hasGap(m));
  const holes = gapped ? models.map((m) => [m.hole.x, m.hole.y]) : [];
  const keep = keyframes(ts, opt.tolerance ?? 0.4);
  const keyTimes = keep.map((i) => num4(i / n)).join(';');
  const dur = `${Math.round(L * 1000) / 1000}s`;
  const anim = (attr: string, values: string[], discrete = false) =>
    `<animate attributeName="${attr}" dur="${dur}" repeatCount="indefinite"${discrete ? ' calcMode="discrete"' : ''} keyTimes="${keyTimes}" values="${values.join(';')}"/>`;

  const defs: string[] = [];
  const paths = ts.map((t, k) => {
    const d = keep.map((i) => (t.stroke !== undefined ? openPathOf(t.pts[i]) : pathOf(t.pts[i], t.shape)));
    const colors = keep.map((i) => t.fill[i]);
    const alphas = keep.map((i) => t.alpha[i]);
    const colorConst = colors.every((f) => f === colors[0]);
    const alphaConst = alphas.every((a) => a === alphas[0]);
    const paint = t.stroke !== undefined ? 'stroke' : 'fill';
    let look = `fill="${colors[0]}"${t.rule === 'body' && gapped ? ' clip-path="url(#gap)"' : ''}`;
    if (t.stroke !== undefined) {
      // a gradient that follows the line from its first point to its last
      const ends = (j: number) => { const p = t.pts[keep[j]]; return [p[0], p[1], p[p.length - 2], p[p.length - 1]].map((v) => Math.round(v * 10) / 10); };
      const e = keep.map((_, j) => ends(j));
      const stops = [0, 1, 2].map((s) => {
        const c = colors.map((x) => x.split(',')[s]);
        return `<stop offset="${s / 2}" stop-color="${c[0]}">${c.every((v) => v === c[0]) ? '' : anim('stop-color', c, true)}</stop>`;
      });
      defs.push(`<linearGradient id="g${k}" gradientUnits="userSpaceOnUse" x1="${e[0][0]}" y1="${e[0][1]}" x2="${e[0][2]}" y2="${e[0][3]}">${['x1', 'y1', 'x2', 'y2'].map((a, q) => anim(a, e.map((v) => String(v[q])))).join('')}${stops.join('')}</linearGradient>`);
      look = `fill="none" stroke="url(#g${k})" stroke-width="${Math.round(t.stroke * 10) / 10}" stroke-linecap="round" stroke-linejoin="round"`;
    }
    const attrs = [`d="${d[0]}"`, look, !alphaConst || alphas[0] < 0.999 ? `${paint}-opacity="${alphas[0]}"` : ''].filter(Boolean).join(' ');
    const anims = [anim('d', d), colorConst || t.stroke !== undefined ? '' : anim(paint, colors, true), alphaConst ? '' : anim(`${paint}-opacity`, alphas.map(String))].join('');
    return `<path ${attrs}>${anims}</path>`;
  });

  const half = VIEW / 2;
  const s = opt.size ?? 512;
  const bg = opt.bg ? `<rect x="${-half}" y="${-half}" width="${VIEW}" height="${VIEW}" fill="${opt.bg}"/>` : '';
  const body = bg + paths.join('');
  if (gapped) {
    const rect = `M${-VIEW} ${-VIEW}h${2 * VIEW}v${2 * VIEW}h${-2 * VIEW}Z`;
    const hd = keep.map((i) => rect + pathOf(Float64Array.from([...holes[i][0]].flatMap((x, k) => [x, holes[i][1][k]])), [holes[i][0].length]));
    defs.push(`<clipPath id="gap"><path clip-rule="evenodd" d="${hd[0]}">${anim('d', hd)}</path></clipPath>`);
  }
  if (opt.round) defs.push(`<clipPath id="round"><circle r="${half}"/></clipPath>`);
  const inner = opt.round ? `<g clip-path="url(#round)">${body}</g>` : body;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-half} ${-half} ${VIEW} ${VIEW}" width="${s}" height="${s}">${defs.length ? `<defs>${defs.join('')}</defs>` : ''}${inner}</svg>`;
}

const num4 = (v: number) => String(Math.round(v * 10000) / 10000);
