// frame(state, t): everything the renderers need to draw the blob at time t.
// Pure: the same state, time and input always give the same frame.

import { PART_SLOTS, TRAIL_POINTS, TRAIL_SLOTS } from './animations';
import { autoEyeColor, mixHex } from './color';
import { blend, clone, make, size, type Contour } from './contour';
import { blendFace, FACES, shapeEye, type EyeParams } from './face';
import { disc, EYE_POINTS } from './glyphs';
import { lerp } from './math';
import { blink, breath, idleGaze, sequenceAt } from './motion';
import { FACE, shapeContour } from './shapes';
import { loopLength, type BlobState } from './state';

/** the drawing area: viewBox -100 -100 200 200 */
export const VIEW = 200;
/** body radius in that area */
export const RADIUS = 56;

export interface Layer {
  c: Contour;
  fill: string;
  alpha: number;
}

/** an open stroked line, TRAIL_POINTS points */
export interface Trail {
  x: Float64Array;
  y: Float64Array;
  color: string;
  width: number;
  alpha: number;
}

/**
 * What a frame is made of, always the same pieces in the same order (so morphs,
 * animated SVG and GIF all work point by point): trails behind, the body, extra
 * dots, then the eyes.
 */
export interface RenderModel {
  trails: Trail[];
  body: Layer;
  parts: Layer[];
  eyes: [Layer, Layer];
}

export interface FrameInput {
  /** pointer gaze, -1..1; null lets the blob look around by itself */
  gaze?: [number, number] | null;
  /** the rest pose, eyes open: still pictures and reduced motion */
  still?: boolean;
}

const bottomOf = new Map<string, number>();

export function frame(state: BlobState, t: number, input: FrameInput = {}): RenderModel {
  const L = loopLength(state) || 2.4;
  const still = !!input.still;
  const m = sequenceAt(state, still ? 0 : t);
  if (still) {
    Object.assign(m, { tx: 0, ty: 0, sx: 1, sy: 1, scale: 1, rot: 0, wob: 0, lookW: 0, open: 1, openL: 1, openR: 1, eyeScale: 1, eyeAlpha: 1 });
    m.exprs = [];
    m.figs = [];
    m.parts = [];
    m.trails = [];
  }

  // ---------------------------------------------------------------- body
  const base = shapeContour(state.shape);
  let bottom = bottomOf.get(state.shape);
  if (bottom === undefined) {
    bottom = 0;
    for (let i = 0; i < size(base); i++) bottom = Math.max(bottom, base.y[i]);
    bottomOf.set(state.shape, bottom);
  }
  const body = clone(base);
  for (const { fig, w } of m.figs) if (w > 0.001) blend(body, shapeContour(fig), Math.min(1, w), body);

  const br = still ? { sx: 1, sy: 1 } : breath(t, L);
  const sx = m.sx * br.sx * m.scale;
  const sy = m.sy * br.sy * m.scale;
  const ay = bottom * m.anchor;
  const cos = Math.cos(m.rot), sin = Math.sin(m.rot);
  // squash around the anchor, turn around the center, then move; in body units
  const place = (x: number, y: number): [number, number] => {
    const qx = x * sx;
    const qy = ay * m.scale + (y - ay) * sy;
    return [(qx * cos - qy * sin + m.tx) * RADIUS, (qx * sin + qy * cos + m.ty) * RADIUS];
  };
  for (let i = 0; i < size(body); i++) {
    let x = body.x[i], y = body.y[i];
    if (m.wob) {
      const k = 1 + m.wob * Math.sin(m.wobK * Math.atan2(x, -y) + m.wobP);
      x *= k;
      y *= k;
    }
    [body.x[i], body.y[i]] = place(x, y);
  }

  // ---------------------------------------------------------------- eyes
  let face = FACES[state.expression];
  for (const { expr, w } of m.exprs) if (w > 0.001) face = blendFace(face, FACES[expr], w);
  const gazeIn = input.gaze ?? (still ? [0, 0] : idleGaze(t, state.seed, L));
  const gx = lerp(gazeIn[0], m.lookX, m.lookW);
  const gy = lerp(gazeIn[1], m.lookY, m.lookW);
  const open = (still ? 1 : blink(t, state.seed, L)) * m.open;
  const spot = FACE[state.shape];

  const eyeAt = (side: -1 | 1, p: EyeParams, openness: number): Contour => {
    const e = shapeEye(p, openness, side);
    const h = p.h * spot.s * m.eyeScale;
    const cx = spot.x + p.x * spot.s + gx * 0.12;
    const cy = spot.y + p.y * spot.s + gy * 0.1;
    const ct = Math.cos(p.tilt), st = Math.sin(p.tilt);
    const out = make(EYE_POINTS);
    for (let i = 0; i < EYE_POINTS; i++) {
      const lx = e.x[i] * h, ly = e.y[i] * h;
      [out.x[i], out.y[i]] = place(cx + lx * ct - ly * st, cy + lx * st + ly * ct);
    }
    return out;
  };
  const eyeFill = autoEyeColor(state.color);
  const eyeAlpha = Math.max(0, Math.min(1, m.eyeAlpha));

  // ---------------------------------------------------------------- dots and trails (not squashed)
  const parts: Layer[] = [];
  for (let i = 0; i < PART_SLOTS; i++) {
    const p = m.parts[i];
    const c = make(EYE_POINTS);
    if (!p || p.alpha <= 0.002 || p.r <= 0.001) {
      for (let k = 0; k < EYE_POINTS; k++) [c.x[k], c.y[k]] = [(p?.x ?? 0) * RADIUS, (p?.y ?? 0) * RADIUS];
      parts.push({ c, fill: state.color, alpha: 0 });
      continue;
    }
    for (let k = 0; k < EYE_POINTS; k++) [c.x[k], c.y[k]] = [(p.x + disc.x[k] * p.r) * RADIUS, (p.y + disc.y[k] * p.r) * RADIUS];
    parts.push({ c, fill: p.color ?? state.color, alpha: Math.min(1, p.alpha) });
  }
  const trails: Trail[] = [];
  for (let i = 0; i < TRAIL_SLOTS; i++) {
    const tr = m.trails[i];
    const x = new Float64Array(TRAIL_POINTS), y = new Float64Array(TRAIL_POINTS);
    if (tr && tr.alpha > 0.002) for (let k = 0; k < TRAIL_POINTS; k++) [x[k], y[k]] = [tr.pts[k][0] * RADIUS, tr.pts[k][1] * RADIUS];
    trails.push({ x, y, color: tr?.color ?? state.color, width: (tr?.width ?? 0.1) * RADIUS, alpha: tr ? Math.min(1, tr.alpha) : 0 });
  }

  return {
    trails,
    body: { c: body, fill: state.color, alpha: 1 },
    parts,
    eyes: [
      { c: eyeAt(-1, face.left, open * m.openL), fill: eyeFill, alpha: eyeAlpha },
      { c: eyeAt(1, face.right, open * m.openR), fill: eyeFill, alpha: eyeAlpha },
    ],
  };
}

/** one frame between two others: shapes, colors and fades blend, for smooth changes in the editor */
export function mixModels(a: RenderModel, b: RenderModel, w: number): RenderModel {
  if (w >= 1) return b;
  if (w <= 0) return a;
  const layer = (p: Layer, q: Layer): Layer => ({ c: blend(p.c, q.c, w), fill: mixHex(p.fill, q.fill, w), alpha: lerp(p.alpha, q.alpha, w) });
  const trail = (p: Trail, q: Trail): Trail => {
    const x = new Float64Array(TRAIL_POINTS), y = new Float64Array(TRAIL_POINTS);
    for (let k = 0; k < TRAIL_POINTS; k++) [x[k], y[k]] = [lerp(p.x[k], q.x[k], w), lerp(p.y[k], q.y[k], w)];
    return { x, y, color: w < 0.5 ? p.color : q.color, width: lerp(p.width, q.width, w), alpha: lerp(p.alpha, q.alpha, w) };
  };
  return {
    trails: a.trails.map((t, i) => trail(t, b.trails[i])),
    body: layer(a.body, b.body),
    parts: a.parts.map((p, i) => layer(p, b.parts[i])),
    eyes: [layer(a.eyes[0], b.eyes[0]), layer(a.eyes[1], b.eyes[1])],
  };
}
