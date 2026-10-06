// SVG output: a string for exports, and a live element that is updated in place.

import { num, toPath } from '../engine/contour';
import { VIEW, type RenderModel } from '../engine/frame';
import type { Background } from '../engine/state';

const NS = 'http://www.w3.org/2000/svg';

export interface SvgOptions {
  /** pixel size of the square output (width = height) */
  size?: number;
  /** override the state's background */
  bg?: Background;
  /** clip everything to a circle (profile pictures) */
  circle?: boolean;
}

export function bgMarkup(bg: Background, id = 'bg'): { defs: string; rect: string } {
  const half = VIEW / 2;
  if (bg.kind === 'solid') return { defs: '', rect: `<rect x="${-half}" y="${-half}" width="${VIEW}" height="${VIEW}" fill="${bg.c1}"/>` };
  if (bg.kind === 'linear') {
    const a = ((bg.angle - 90) * Math.PI) / 180;
    const x = Math.cos(a) / 2, y = Math.sin(a) / 2;
    return {
      defs: `<linearGradient id="${id}" x1="${num(0.5 - x)}" y1="${num(0.5 - y)}" x2="${num(0.5 + x)}" y2="${num(0.5 + y)}"><stop offset="0" stop-color="${bg.c1}"/><stop offset="1" stop-color="${bg.c2}"/></linearGradient>`,
      rect: `<rect x="${-half}" y="${-half}" width="${VIEW}" height="${VIEW}" fill="url(#${id})"/>`,
    };
  }
  return { defs: '', rect: '' };
}

/** the body path, with the eyes cut out when they are holes */
export const bodyPath = (m: RenderModel) => toPath(m.body.c) + m.holes.map((h) => toPath(h)).join('');

/** one frame as a standalone SVG document */
export function toSvgString(m: RenderModel, opt: SvgOptions = {}): string {
  const half = VIEW / 2;
  const s = opt.size ?? 512;
  const bg = bgMarkup(opt.bg ?? m.bg);
  const clip = opt.circle ? `<clipPath id="round"><circle r="${half}"/></clipPath>` : '';
  const layer = (d: string, fill: string, alpha: number, extra = '') => (alpha <= 0 ? '' : `<path d="${d}" fill="${fill}"${alpha < 0.999 ? ` fill-opacity="${Math.round(alpha * 1000) / 1000}"` : ''}${extra}/>`);
  const parts = [
    bg.rect,
    layer(bodyPath(m), m.body.fill, 1, m.holes.length ? ' fill-rule="evenodd"' : ''),
    ...m.cheeks.map((c) => layer(toPath(c.c), c.fill, c.alpha)),
    ...m.eyes.map((e) => layer(toPath(e.c), e.fill, e.alpha)),
    ...m.decor.map((d) => layer(toPath(d.c), d.fill, d.alpha)),
  ].join('');
  const defs = bg.defs || clip ? `<defs>${bg.defs}${clip}</defs>` : '';
  const body = opt.circle ? `<g clip-path="url(#round)">${parts}</g>` : parts;
  return `<svg xmlns="${NS}" viewBox="${-half} ${-half} ${VIEW} ${VIEW}" width="${s}" height="${s}">${defs}${body}</svg>`;
}

/**
 * A live SVG: build it once, then call update(model) every frame. Only path data,
 * fills and opacities change, so the DOM never churns.
 */
export class LiveSvg {
  readonly el: SVGSVGElement;
  private bgRect: SVGRectElement;
  private grad: SVGLinearGradientElement;
  private stops: SVGStopElement[];
  private paths: SVGPathElement[] = [];
  private lastBg = '';

  constructor(doc: Document = document, gradId = `g${Math.random().toString(36).slice(2, 8)}`) {
    const half = VIEW / 2;
    const el = doc.createElementNS(NS, 'svg');
    el.setAttribute('viewBox', `${-half} ${-half} ${VIEW} ${VIEW}`);
    el.setAttribute('aria-hidden', 'true');
    el.style.overflow = 'visible';
    const defs = doc.createElementNS(NS, 'defs');
    this.grad = doc.createElementNS(NS, 'linearGradient');
    this.grad.id = gradId;
    this.stops = [0, 1].map((o) => {
      const s = doc.createElementNS(NS, 'stop');
      s.setAttribute('offset', String(o));
      this.grad.appendChild(s);
      return s;
    });
    defs.appendChild(this.grad);
    el.appendChild(defs);
    this.bgRect = doc.createElementNS(NS, 'rect');
    for (const [k, v] of [['x', -half], ['y', -half], ['width', VIEW], ['height', VIEW]] as const) this.bgRect.setAttribute(k, String(v));
    el.appendChild(this.bgRect);
    // body, 2 cheeks, 2 eyes, 6 decor
    for (let i = 0; i < 11; i++) {
      const p = doc.createElementNS(NS, 'path');
      el.appendChild(p);
      this.paths.push(p);
    }
    this.el = el;
  }

  update(m: RenderModel, bgOverride?: Background) {
    const bg = bgOverride ?? m.bg;
    const key = `${bg.kind}${bg.c1}${bg.c2}${bg.angle}`;
    if (key !== this.lastBg) {
      this.lastBg = key;
      if (bg.kind === 'none') this.bgRect.setAttribute('fill', 'none');
      else if (bg.kind === 'solid') this.bgRect.setAttribute('fill', bg.c1);
      else {
        const a = ((bg.angle - 90) * Math.PI) / 180;
        const x = Math.cos(a) / 2, y = Math.sin(a) / 2;
        this.grad.setAttribute('x1', String(0.5 - x));
        this.grad.setAttribute('y1', String(0.5 - y));
        this.grad.setAttribute('x2', String(0.5 + x));
        this.grad.setAttribute('y2', String(0.5 + y));
        this.stops[0].setAttribute('stop-color', bg.c1);
        this.stops[1].setAttribute('stop-color', bg.c2);
        this.bgRect.setAttribute('fill', `url(#${this.grad.id})`);
      }
    }
    const layers = [{ d: bodyPath(m), fill: m.body.fill, alpha: 1 }, ...m.cheeks.map((c) => ({ d: toPath(c.c), fill: c.fill, alpha: c.alpha })), ...m.eyes.map((e) => ({ d: toPath(e.c), fill: e.fill, alpha: e.alpha })), ...m.decor.map((d) => ({ d: toPath(d.c), fill: d.fill, alpha: d.alpha }))];
    layers.forEach((l, i) => {
      const p = this.paths[i];
      if (l.alpha <= 0) {
        p.setAttribute('d', '');
        return;
      }
      p.setAttribute('d', l.d);
      p.setAttribute('fill', l.fill);
      p.setAttribute('fill-opacity', String(Math.round(l.alpha * 1000) / 1000));
      if (i === 0) p.setAttribute('fill-rule', m.holes.length ? 'evenodd' : 'nonzero');
    });
  }
}
