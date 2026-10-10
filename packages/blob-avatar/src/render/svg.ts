// SVG output: a string for exports, and a live element that is updated in place.

import { num, toOpenPath, toPath } from '../engine/contour';
import { VIEW, type Layer, type RenderModel, type Trail } from '../engine/frame';

const NS = 'http://www.w3.org/2000/svg';

export interface SvgOptions {
  /** pixel size of the square output (width = height) */
  size?: number;
  /** a solid background, or none (transparent) */
  bg?: string | null;
  /** clip everything to a circle (profile pictures) */
  round?: boolean;
  /** prefix for ids, when several drawings share a page */
  id?: string;
}

const op = (a: number, attr: string) => (a < 0.999 ? ` ${attr}="${Math.round(a * 1000) / 1000}"` : '');

export const bodyPath = (m: RenderModel) => toPath(m.body.c);

/** the area the body may cover: everything but the round gap (an empty circle when unused) */
export const gapClip = (m: RenderModel) => `M${-VIEW} ${-VIEW}h${2 * VIEW}v${2 * VIEW}h${-2 * VIEW}Z${toPath(m.hole)}`;

/** whether the frame cuts a gap at all */
export const hasGap = (m: RenderModel) => {
  let r = 0;
  for (let i = 1; i < m.hole.x.length; i++) r = Math.max(r, Math.abs(m.hole.x[i] - m.hole.x[0]), Math.abs(m.hole.y[i] - m.hole.y[0]));
  return r > 0.05;
};

/** a trail's gradient runs from its first point to its last */
export const gradientEnds = (t: Trail) => [t.x[0], t.y[0], t.x[t.x.length - 1], t.y[t.y.length - 1]].map(num);

function trailMarkup(t: Trail, id: string) {
  if (t.alpha <= 0.002) return { def: '', path: '' };
  const [x1, y1, x2, y2] = gradientEnds(t);
  return {
    def: `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${t.colors.map((c, i) => `<stop offset="${i / 2}" stop-color="${c}"/>`).join('')}</linearGradient>`,
    path: `<path d="${toOpenPath(t.x, t.y)}" fill="none" stroke="url(#${id})" stroke-width="${num(t.width)}" stroke-linecap="round" stroke-linejoin="round"${op(t.alpha, 'stroke-opacity')}/>`,
  };
}

/** the drawing's layers as SVG elements, back to front, and the gradients they use */
export function layersMarkup(m: RenderModel, id = 'b'): { defs: string; body: string } {
  const fill = (l: Layer) => (l.alpha <= 0.002 ? '' : `<path d="${toPath(l.c)}" fill="${l.fill}"${op(l.alpha, 'fill-opacity')}/>`);
  const back = m.back.map((t, i) => trailMarkup(t, `${id}b${i}`));
  const front = m.front.map((t, i) => trailMarkup(t, `${id}f${i}`));
  const gap = hasGap(m);
  return {
    defs: [...back, ...front].map((x) => x.def).join('') + (gap ? `<clipPath id="${id}gap"><path d="${gapClip(m)}" clip-rule="evenodd"/></clipPath>` : ''),
    body: [...back.map((x) => x.path), `<path d="${bodyPath(m)}" fill="${m.body.fill}"${gap ? ` clip-path="url(#${id}gap)"` : ''}/>`, ...m.parts.map(fill), ...m.eyes.map(fill), ...front.map((x) => x.path)].join(''),
  };
}

/** one frame as a standalone SVG document */
export function toSvgString(m: RenderModel, opt: SvgOptions = {}): string {
  const half = VIEW / 2;
  const s = opt.size ?? 512;
  const id = opt.id ?? 'b';
  const { defs, body } = layersMarkup(m, id);
  const bg = opt.bg ? `<rect x="${-half}" y="${-half}" width="${VIEW}" height="${VIEW}" fill="${opt.bg}"/>` : '';
  const clip = opt.round ? `<clipPath id="${id}round"><circle r="${half}"/></clipPath>` : '';
  const inner = bg + body;
  return `<svg xmlns="${NS}" viewBox="${-half} ${-half} ${VIEW} ${VIEW}" width="${s}" height="${s}">${defs || clip ? `<defs>${defs}${clip}</defs>` : ''}${opt.round ? `<g clip-path="url(#${id}round)">${inner}</g>` : inner}</svg>`;
}

/**
 * A live SVG: build it once, then call update(model) every frame. Only path data,
 * colors and opacities change, so the DOM never churns.
 */
export class LiveSvg {
  readonly el: SVGSVGElement;
  private back: { path: SVGPathElement; grad: SVGLinearGradientElement; stops: SVGStopElement[] }[] = [];
  private front: { path: SVGPathElement; grad: SVGLinearGradientElement; stops: SVGStopElement[] }[] = [];
  private body: SVGPathElement;
  private gap: SVGPathElement;
  private fills: SVGPathElement[] = [];

  constructor(doc: Document = document, slots = { trails: 6, parts: 3 }, prefix = `l${Math.random().toString(36).slice(2, 7)}`) {
    const half = VIEW / 2;
    const el = doc.createElementNS(NS, 'svg');
    el.setAttribute('viewBox', `${-half} ${-half} ${VIEW} ${VIEW}`);
    el.setAttribute('aria-hidden', 'true');
    el.style.overflow = 'visible';
    const defs = el.appendChild(doc.createElementNS(NS, 'defs'));
    const trail = (name: string) => {
      const grad = defs.appendChild(doc.createElementNS(NS, 'linearGradient'));
      grad.id = `${prefix}${name}`;
      grad.setAttribute('gradientUnits', 'userSpaceOnUse');
      const stops = [0, 0.5, 1].map((o) => {
        const s = grad.appendChild(doc.createElementNS(NS, 'stop'));
        s.setAttribute('offset', String(o));
        return s;
      });
      const path = el.appendChild(doc.createElementNS(NS, 'path'));
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', `url(#${grad.id})`);
      path.setAttribute('stroke-linecap', 'round');
      path.setAttribute('stroke-linejoin', 'round');
      return { path, grad, stops };
    };
    for (let i = 0; i < slots.trails; i++) this.back.push(trail(`b${i}`));
    const clip = defs.appendChild(doc.createElementNS(NS, 'clipPath'));
    clip.id = `${prefix}gap`;
    this.gap = clip.appendChild(doc.createElementNS(NS, 'path'));
    this.gap.setAttribute('clip-rule', 'evenodd');
    this.body = el.appendChild(doc.createElementNS(NS, 'path'));
    this.body.setAttribute('clip-path', `url(#${clip.id})`);
    // the extra dots, then the two eyes
    for (let i = 0; i < slots.parts + 2; i++) this.fills.push(el.appendChild(doc.createElementNS(NS, 'path')));
    for (let i = 0; i < slots.trails; i++) this.front.push(trail(`f${i}`));
    this.el = el;
  }

  update(m: RenderModel) {
    const trails = (list: Trail[], els: typeof this.back) =>
      list.forEach((t, i) => {
        const e = els[i];
        if (!e) return;
        if (t.alpha <= 0.002) return e.path.setAttribute('d', '');
        const [x1, y1, x2, y2] = gradientEnds(t);
        e.grad.setAttribute('x1', x1);
        e.grad.setAttribute('y1', y1);
        e.grad.setAttribute('x2', x2);
        e.grad.setAttribute('y2', y2);
        t.colors.forEach((c, k) => e.stops[k].setAttribute('stop-color', c));
        e.path.setAttribute('d', toOpenPath(t.x, t.y));
        e.path.setAttribute('stroke-width', num(t.width));
        e.path.setAttribute('stroke-opacity', String(Math.round(t.alpha * 1000) / 1000));
      });
    trails(m.back, this.back);
    this.body.setAttribute('d', bodyPath(m));
    this.gap.setAttribute('d', gapClip(m));
    this.body.setAttribute('fill', m.body.fill);
    [...m.parts, ...m.eyes].forEach((l, i) => {
      const p = this.fills[i];
      if (!p) return;
      if (l.alpha <= 0.002) return p.setAttribute('d', '');
      p.setAttribute('d', toPath(l.c));
      p.setAttribute('fill', l.fill);
      p.setAttribute('fill-opacity', String(Math.round(l.alpha * 1000) / 1000));
    });
    trails(m.front, this.front);
  }
}
