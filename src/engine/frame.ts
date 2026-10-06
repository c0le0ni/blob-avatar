// frame(state, t): everything the renderers need to draw the blob at time t.
// Pure: the same state, time and input always give the same frame.

import { autoEyeColor, mixHex } from './color';
import { blend, bounds, clone, make, resample, size, type Contour } from './contour';
import { DECOR_COLORS, DECOR_SLOTS, decorContour } from './decor';
import { blendFace, FACES, isFixed, shapeEye, type EyeParams } from './face';
import { EYE_POINTS, eyeContour, type Eye } from './glyphs';
import { lerp, TAU } from './math';
import { blink, breath, idleGaze, sequenceAt } from './motion';
import { FACE, shapeContour } from './shapes';
import { loopLength, type Background, type BlobState } from './state';

/** the drawing area: viewBox -100 -100 200 200 */
export const VIEW = 200;
/** body radius and center in that area */
export const RADIUS = 54;
export const CENTER_Y = 8;

export interface Layer {
  c: Contour;
  fill: string;
  alpha: number;
}

export interface RenderModel {
  bg: Background;
  body: Layer;
  /** eyes cut out of the body (hole mode); empty in ink mode */
  holes: Contour[];
  /** eyes drawn on top (ink mode); alpha 0 in hole mode */
  eyes: [Layer, Layer];
  cheeks: [Layer, Layer];
  decor: Layer[];
}

export interface FrameInput {
  /** pointer gaze, -1..1; null lets the blob look around by itself */
  gaze?: [number, number] | null;
  /** freeze motion (reduced motion, static exports): rest pose, eyes open */
  still?: boolean;
}

const cheekShape = (() => {
  const pts: [number, number][] = Array.from({ length: 64 }, (_, i) => [0.5 * Math.sin((i / 64) * TAU), -0.28 * Math.cos((i / 64) * TAU)]);
  return resample(pts, EYE_POINTS);
})();

const bottomOf = new Map<string, number>();

export function frame(state: BlobState, t: number, input: FrameInput = {}): RenderModel {
  const L = loopLength(state) || 3;
  const still = !!input.still;
  const m = sequenceAt(state, still ? 0 : t);
  if (still) {
    Object.assign(m, { tx: 0, ty: 0, sx: 1, sy: 1, rot: 0, wob: 0, lookW: 0, open: 1, eyeScale: 1 });
    m.exprs = [];
    m.decor = [];
  }

  // ---------------------------------------------------------------- body
  const base = shapeContour(state.shape);
  let bottom = bottomOf.get(state.shape);
  if (bottom === undefined) bottomOf.set(state.shape, (bottom = bounds(base).y1));
  const br = still ? { sx: 1, sy: 1 } : breath(t, L);
  const sx = m.sx * br.sx;
  const sy = m.sy * br.sy;
  const ay = bottom * m.anchor;
  const cos = Math.cos(m.rot), sin = Math.sin(m.rot);
  // squash around the anchor, turn around the center, then move; in body units
  const place = (x: number, y: number): [number, number] => {
    const qx = x * sx;
    const qy = ay + (y - ay) * sy;
    const rx = qx * cos - qy * sin;
    const ry = qx * sin + qy * cos;
    return [(rx + m.tx) * RADIUS, (ry + m.ty) * RADIUS + CENTER_Y];
  };
  const body = clone(base);
  for (let i = 0; i < size(body); i++) {
    let x = body.x[i], y = body.y[i];
    if (m.wob) {
      const a = Math.atan2(x, -y);
      const k = 1 + m.wob * Math.sin(m.wobK * a + m.wobP);
      x *= k;
      y *= k;
    }
    [body.x[i], body.y[i]] = place(x, y);
  }

  // ---------------------------------------------------------------- face
  let face = FACES[state.expression];
  let glyphL: Contour = eyeContour(face.left.glyph ?? state.eyes);
  let glyphR: Contour = eyeContour(face.right.glyph ?? state.eyes);
  let domL: Eye = face.left.glyph ?? state.eyes;
  let domR: Eye = face.right.glyph ?? state.eyes;
  for (const { expr, w } of m.exprs) {
    if (w <= 0.001) continue;
    const f = FACES[expr];
    const gl = eyeContour(f.left.glyph ?? state.eyes);
    const gr = eyeContour(f.right.glyph ?? state.eyes);
    if (gl !== glyphL) glyphL = blend(glyphL, gl, w);
    if (gr !== glyphR) glyphR = blend(glyphR, gr, w);
    if (w >= 0.5) {
      domL = f.left.glyph ?? state.eyes;
      domR = f.right.glyph ?? state.eyes;
    }
    face = blendFace(face, f, w);
  }

  const gazeIn = input.gaze ?? (still ? [0, 0] : idleGaze(t, state.seed, L));
  const gx = lerp(gazeIn[0], m.lookX, m.lookW);
  const gy = lerp(gazeIn[1], m.lookY, m.lookW);
  const open = (still ? 1 : blink(t, state.seed, L)) * m.open;
  const spot = FACE[state.shape];

  const eyeAt = (side: -1 | 1, p: EyeParams, glyph: Contour, dom: Eye): Contour => {
    const e = shapeEye(glyph, p, open, isFixed(dom));
    const h = 0.4 * spot.size * p.scale * m.eyeScale;
    const cx = side * (0.36 * spot.spread + p.dx * h) + gx * 0.13;
    const cy = spot.y + p.dy * h + gy * 0.1;
    const squeeze = 1 - 0.08 * Math.abs(gx);
    const ct = Math.cos(p.tilt), st = Math.sin(p.tilt);
    const out = make(EYE_POINTS);
    for (let i = 0; i < EYE_POINTS; i++) {
      const lx = e.x[i] * p.sx * squeeze;
      const ly = e.y[i] * p.sy;
      const rx = lx * ct - ly * st;
      const ry = lx * st + ly * ct;
      [out.x[i], out.y[i]] = place(cx + side * rx * h, cy + ry * h);
    }
    return out;
  };
  // the left eye is on the left of the screen; its "away from the nose" is -x
  const eyeL = eyeAt(-1, face.left, glyphL, domL);
  const eyeR = eyeAt(1, face.right, glyphR, domR);

  const cheekAt = (side: -1 | 1): Contour => {
    const h = 0.4 * spot.size;
    const cx = side * (0.36 * spot.spread + 0.16) + gx * 0.08;
    const cy = spot.y + 0.62 * h;
    const out = make(EYE_POINTS);
    for (let i = 0; i < EYE_POINTS; i++) [out.x[i], out.y[i]] = place(cx + cheekShape.x[i] * 0.42 * spot.size, cy + cheekShape.y[i] * 0.42 * spot.size);
    return out;
  };

  // ---------------------------------------------------------------- decor (not squashed, just carried along)
  const decor: Layer[] = [];
  for (let i = 0; i < DECOR_SLOTS; i++) {
    const p = m.decor[i];
    if (!p || p.alpha <= 0.003) {
      decor.push({ c: make(EYE_POINTS), fill: '#000000', alpha: 0 });
      continue;
    }
    const src = decorContour(p.kind);
    const c = make(EYE_POINTS);
    const pc = Math.cos(p.rot), ps = Math.sin(p.rot);
    for (let k = 0; k < EYE_POINTS; k++) {
      const x = src.x[k] * p.s, y = src.y[k] * p.s;
      c.x[k] = (p.x + m.tx + x * pc - y * ps) * RADIUS;
      c.y[k] = (p.y + m.ty + x * ps + y * pc) * RADIUS + CENTER_Y;
    }
    decor.push({ c, fill: DECOR_COLORS[p.kind], alpha: Math.min(1, p.alpha) });
  }

  const eyeFill = state.eyeColor === 'auto' ? autoEyeColor(state.color) : state.eyeColor;
  const hole = state.eyeMode === 'hole';
  const cheekFill = mixHex(state.color, '#ff4d6d', 0.55);
  const cheekAlpha = Math.max(0, Math.min(1, face.cheeks)) * 0.75;
  return {
    bg: state.bg,
    body: { c: body, fill: state.color, alpha: 1 },
    holes: hole ? [eyeL, eyeR] : [],
    eyes: [
      { c: eyeL, fill: eyeFill, alpha: hole ? 0 : 1 },
      { c: eyeR, fill: eyeFill, alpha: hole ? 0 : 1 },
    ],
    cheeks: [
      { c: cheekAt(-1), fill: cheekFill, alpha: cheekAlpha },
      { c: cheekAt(1), fill: cheekFill, alpha: cheekAlpha },
    ],
    decor,
  };
}
