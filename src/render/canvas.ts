// Canvas output: the same render model, drawn with Path2D. Used for PNG and GIF.

import { toOpenPath, toPath } from '../engine/contour';
import { VIEW, type RenderModel, type Trail } from '../engine/frame';
import { bodyPath, gapClip, hasGap } from './svg';

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
  const trail = (t: Trail) => {
    if (t.alpha <= 0.002) return;
    const n = t.x.length - 1;
    const g = ctx.createLinearGradient(t.x[0], t.y[0], t.x[n], t.y[n]);
    t.colors.forEach((c, i) => g.addColorStop(i / 2, c));
    ctx.globalAlpha = t.alpha;
    ctx.strokeStyle = g;
    ctx.lineWidth = t.width;
    ctx.stroke(new Path2D(toOpenPath(t.x, t.y)));
  };
  m.back.forEach(trail);
  ctx.globalAlpha = 1;
  ctx.fillStyle = m.body.fill;
  ctx.save();
  if (hasGap(m)) ctx.clip(new Path2D(gapClip(m)), 'evenodd');
  ctx.fill(new Path2D(bodyPath(m)));
  ctx.restore();
  for (const l of [...m.parts, ...m.eyes]) {
    if (l.alpha <= 0.002) continue;
    ctx.globalAlpha = l.alpha;
    ctx.fillStyle = l.fill;
    ctx.fill(new Path2D(toPath(l.c)));
  }
  m.front.forEach(trail);
  ctx.restore();
  ctx.globalAlpha = 1;
}
