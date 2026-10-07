// SVG output: a string for exports, and a live element that is updated in place.

import { toOpenPath, toPath } from '../engine/contour';
import { VIEW, type Layer, type RenderModel, type Trail } from '../engine/frame';

const NS = 'http://www.w3.org/2000/svg';

export interface SvgOptions {
  /** pixel size of the square output (width = height) */
  size?: number;
  /** a solid background, or none (transparent) */
  bg?: string | null;
  /** clip everything to a circle (profile pictures) */
  round?: boolean;
}

const op = (a: number, attr: string) => (a < 0.999 ? ` ${attr}="${Math.round(a * 1000) / 1000}"` : '');

export const trailAttrs = (t: Trail) => `fill="none" stroke="${t.color}" stroke-width="${Math.round(t.width * 10) / 10}" stroke-linecap="round" stroke-linejoin="round"${op(t.alpha, 'stroke-opacity')}`;

/** the drawing's layers as SVG elements, back to front */
export function layersMarkup(m: RenderModel): string {
  const fill = (l: Layer) => (l.alpha <= 0.002 ? '' : `<path d="${toPath(l.c)}" fill="${l.fill}"${op(l.alpha, 'fill-opacity')}/>`);
  return [
    ...m.trails.map((t) => (t.alpha <= 0.002 ? '' : `<path d="${toOpenPath(t.x, t.y)}" ${trailAttrs(t)}/>`)),
    fill(m.body),
    ...m.parts.map(fill),
    ...m.eyes.map(fill),
  ].join('');
}

/** one frame as a standalone SVG document */
export function toSvgString(m: RenderModel, opt: SvgOptions = {}): string {
  const half = VIEW / 2;
  const s = opt.size ?? 512;
  const bg = opt.bg ? `<rect x="${-half}" y="${-half}" width="${VIEW}" height="${VIEW}" fill="${opt.bg}"/>` : '';
  const inner = bg + layersMarkup(m);
  const body = opt.round ? `<defs><clipPath id="round"><circle r="${half}"/></clipPath></defs><g clip-path="url(#round)">${inner}</g>` : inner;
  return `<svg xmlns="${NS}" viewBox="${-half} ${-half} ${VIEW} ${VIEW}" width="${s}" height="${s}">${body}</svg>`;
}

/**
 * A live SVG: build it once, then call update(model) every frame. Only path data,
 * colors and opacities change, so the DOM never churns.
 */
export class LiveSvg {
  readonly el: SVGSVGElement;
  private trails: SVGPathElement[] = [];
  private fills: SVGPathElement[] = [];

  constructor(doc: Document = document, slots = { trails: 5, parts: 3 }) {
    const half = VIEW / 2;
    const el = doc.createElementNS(NS, 'svg');
    el.setAttribute('viewBox', `${-half} ${-half} ${VIEW} ${VIEW}`);
    el.setAttribute('aria-hidden', 'true');
    el.style.overflow = 'visible';
    const path = () => el.appendChild(doc.createElementNS(NS, 'path'));
    for (let i = 0; i < slots.trails; i++) {
      const p = path();
      p.setAttribute('fill', 'none');
      p.setAttribute('stroke-linecap', 'round');
      p.setAttribute('stroke-linejoin', 'round');
      this.trails.push(p);
    }
    // body, the extra dots, two eyes
    for (let i = 0; i < 1 + slots.parts + 2; i++) this.fills.push(path());
    this.el = el;
  }

  update(m: RenderModel) {
    m.trails.forEach((t, i) => {
      const p = this.trails[i];
      if (!p) return;
      if (t.alpha <= 0.002) return p.setAttribute('d', '');
      p.setAttribute('d', toOpenPath(t.x, t.y));
      p.setAttribute('stroke', t.color);
      p.setAttribute('stroke-width', String(Math.round(t.width * 10) / 10));
      p.setAttribute('stroke-opacity', String(Math.round(t.alpha * 1000) / 1000));
    });
    [m.body, ...m.parts, ...m.eyes].forEach((l, i) => {
      const p = this.fills[i];
      if (!p) return;
      if (l.alpha <= 0.002) return p.setAttribute('d', '');
      p.setAttribute('d', toPath(l.c));
      p.setAttribute('fill', l.fill);
      p.setAttribute('fill-opacity', String(Math.round(l.alpha * 1000) / 1000));
    });
  }
}
