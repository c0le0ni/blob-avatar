// Canvas output: the same render model, drawn with Path2D. Used for PNG and GIF.

import { toPath } from '../engine/contour';
import { VIEW, type RenderModel } from '../engine/frame';
import type { Background } from '../engine/state';
import { bodyPath } from './svg';

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export interface CanvasOptions {
  bg?: Background;
  circle?: boolean;
}

/** draw a frame filling a px-by-px canvas */
export function drawModel(ctx: Ctx, m: RenderModel, px: number, opt: CanvasOptions = {}) {
  const half = VIEW / 2;
  const k = px / VIEW;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, px, px);
  ctx.setTransform(k, 0, 0, k, px / 2, px / 2);
  ctx.save();
  if (opt.circle) {
    ctx.beginPath();
    ctx.arc(0, 0, half, 0, Math.PI * 2);
    ctx.clip();
  }
  const bg = opt.bg ?? m.bg;
  if (bg.kind === 'solid') {
    ctx.fillStyle = bg.c1;
    ctx.fillRect(-half, -half, VIEW, VIEW);
  } else if (bg.kind === 'linear') {
    const a = ((bg.angle - 90) * Math.PI) / 180;
    const x = Math.cos(a) * half, y = Math.sin(a) * half;
    const g = ctx.createLinearGradient(-x, -y, x, y);
    g.addColorStop(0, bg.c1);
    g.addColorStop(1, bg.c2);
    ctx.fillStyle = g;
    ctx.fillRect(-half, -half, VIEW, VIEW);
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = m.body.fill;
  ctx.fill(new Path2D(bodyPath(m)), m.holes.length ? 'evenodd' : 'nonzero');
  for (const l of [...m.cheeks, ...m.eyes, ...m.decor]) {
    if (l.alpha <= 0) continue;
    ctx.globalAlpha = l.alpha;
    ctx.fillStyle = l.fill;
    ctx.fill(new Path2D(toPath(l.c)));
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}
