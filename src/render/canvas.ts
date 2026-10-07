// Canvas output: the same render model, drawn with Path2D. Used for PNG and GIF.

import { toOpenPath, toPath } from '../engine/contour';
import { VIEW, type RenderModel } from '../engine/frame';

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export interface CanvasOptions {
  /** a solid background, or none (transparent) */
  bg?: string | null;
  round?: boolean;
}

/** draw a frame filling a px-by-px canvas */
export function drawModel(ctx: Ctx, m: RenderModel, px: number, opt: CanvasOptions = {}) {
  const half = VIEW / 2;
  const k = px / VIEW;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, px, px);
  ctx.setTransform(k, 0, 0, k, px / 2, px / 2);
  ctx.save();
  if (opt.round) {
    ctx.beginPath();
    ctx.arc(0, 0, half, 0, Math.PI * 2);
    ctx.clip();
  }
  if (opt.bg) {
    ctx.fillStyle = opt.bg;
    ctx.fillRect(-half, -half, VIEW, VIEW);
  }
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const t of m.trails) {
    if (t.alpha <= 0.002) continue;
    ctx.globalAlpha = t.alpha;
    ctx.strokeStyle = t.color;
    ctx.lineWidth = t.width;
    ctx.stroke(new Path2D(toOpenPath(t.x, t.y)));
  }
  for (const l of [m.body, ...m.parts, ...m.eyes]) {
    if (l.alpha <= 0.002) continue;
    ctx.globalAlpha = l.alpha;
    ctx.fillStyle = l.fill;
    ctx.fill(new Path2D(toPath(l.c)));
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}
