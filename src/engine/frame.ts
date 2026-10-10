// frame(state, t): everything the renderers need to draw the blob at time t.
// Pure: the same state, time and input always give the same frame.

import { clipPose, PART_SLOTS, TRAIL_POINTS, TRAIL_SLOTS, type Anim } from './animations';
import { autoEyeColor, mixHex } from './color';
import { blend, clone, make, size, type Contour, type Pt } from './contour';
import { blendFace, eyeOutline, FACES, turnEye, type EyePose } from './face';
import { disc, EYE_POINTS } from './glyphs';
import { clamp, lerp, smooth } from './math';
import { blink, breath, mixMotion, sequenceAt, toMotion, wander } from './motion';
import { edgeAt, shapeContour } from './shapes';
import { loopLength, type BlobState } from './state';

/** the drawing area: viewBox -100 -100 200 200 */
export const VIEW = 200;
/** body radius in that area */
export const RADIUS = 62;

export interface Layer {
  c: Contour;
  fill: string;
  alpha: number;
}

/** an open stroked line with a gradient along it, TRAIL_POINTS points */
export interface Trail {
  x: Float64Array;
  y: Float64Array;
  colors: [string, string, string];
  width: number;
  alpha: number;
}

/**
 * What a frame is made of, always the same pieces in the same order (so morphs,
 * animated SVG and GIF all work point by point), back to front: the lines behind,
 * the body (with a round gap, empty when unused), the extra dots, the eyes, and the
 * lines in front.
 */
export interface RenderModel {
  back: Trail[];
  body: Layer;
  hole: Contour;
  parts: Layer[];
  eyes: [Layer, Layer];
  front: Trail[];
}

export interface FrameInput {
  /** where the eyes look, -1..1 (the pointer); null lets the head wander by itself */
  gaze?: [number, number] | null;
  /** the rest pose, eyes open: still pictures and reduced motion */
  still?: boolean;
  /** how open the eyes are, 0..1, on top of the blinks (the intro opens them) */
  open?: number;
  /** a squash and a hop (a click), 0..1 of the way through; 0 and 1 are the blob at rest */
  poke?: number;
  /** an animation played over the cycle, which keeps running underneath: t is its own time, 0..dur */
  react?: { anim: Anim; t: number; dur: number } | null;
}

/** how much of a reaction shows at its time t: in over 0.12 s, out over its last 0.2 s, nothing at either end */
export const envelope = (t: number, dur: number) => smooth(Math.min(t / 0.12, (dur - t) / 0.2));

/** the hop of a poke: up to a quarter of the body, in the air from 0.2 to 0.65 of the way */
const air = (u: number) => clamp((u - 0.2) / 0.45, 0, 1);
const wave = (v: number) => Math.sin(Math.PI * clamp(v, 0, 1));

/** a circle in the drawing, from body units */
const dot = (x: number, y: number, r: number) => {
  const out = make(EYE_POINTS);
  for (let k = 0; k < EYE_POINTS; k++) [out.x[k], out.y[k]] = [(x + disc.x[k] * r) * RADIUS, (y + disc.y[k] * r) * RADIUS];
  return out;
};

/** an eye fitted on the body, in body units: its outline, its center and how much it shows */
interface Fitted {
  c: Contour;
  x: number;
  y: number;
  alpha: number;
}

/** the space kept between the eyes, in body radii */
const EYE_GAP = 0.03;

/** whether two eyes, each shrunk by s around its center, keep EYE_GAP between them */
function clear(a: Fitted, b: Fitted, s: number): boolean {
  const at = (e: Fitted, i: number): Pt => [e.x + (e.c.x[i] - e.x) * s, e.y + (e.c.y[i] - e.y) * s];
  for (const [p, q] of [[a, b], [b, a]]) {
    for (let i = 0; i < EYE_POINTS; i++) {
      // how far the point is outside q: eyes are convex, so the farthest it is past any side
      const [x, y] = at(p, i);
      let out = -Infinity;
      for (let j = 0, k = EYE_POINTS - 1; j < EYE_POINTS; k = j++) {
        const [x1, y1] = at(q, k), [x2, y2] = at(q, j);
        const side = (u: number, v: number) => ((u - x1) * (y2 - y1) - (v - y1) * (x2 - x1)) / (Math.hypot(x2 - x1, y2 - y1) || 1);
        out = Math.max(out, side(x, y) * -Math.sign(side(q.x, q.y)));
      }
      if (out < EYE_GAP) return false;
    }
  }
  return true;
}

/**
 * On a shape that narrows, each eye is pulled toward the center on its own, and the
 * two can meet. When they come closer than EYE_GAP, both shrink around their centers
 * just enough to keep it (down to 60%); a hidden eye counts less. Eyes that keep
 * their distance are left exactly as they are.
 */
function apart(a: Fitted, b: Fitted) {
  const weight = Math.min(a.alpha, b.alpha);
  if (weight <= 0 || clear(a, b, 1)) return;
  let lo = 0.6, hi = 1;
  for (let i = 0; i < 7; i++) {
    const mid = (lo + hi) / 2;
    if (clear(a, b, mid)) lo = mid;
    else hi = mid;
  }
  const s = 1 - (1 - lo) * weight;
  for (const e of [a, b]) for (let i = 0; i < EYE_POINTS; i++) [e.c.x[i], e.c.y[i]] = [e.x + (e.c.x[i] - e.x) * s, e.y + (e.c.y[i] - e.y) * s];
}

export function frame(state: BlobState, t: number, input: FrameInput = {}): RenderModel {
  const L = loopLength(state) || 2.4;
  const still = !!input.still;
  let m = sequenceAt(state, still ? 0 : t);
  if (still) {
    Object.assign(m, { tx: 0, ty: 0, sx: 1, sy: 1, scale: 1, rot: 0, yaw: 0, pitch: 0, eyeAlpha: 1, shut: 0, holeR: 0 });
    m.exprs = [];
    m.figs = [];
    m.faces = [];
    m.parts = [];
    m.trails = [];
  }
  // a reaction comes in over the cycle and goes, the way the cycle turns from clip to clip
  const r = input.react;
  if (r) m = mixMotion(m, toMotion(clipPose(r.anim, r.t, r.dur, state.seed)), envelope(r.t, r.dur));
  // a poke squashes the blob on the ground, hops and lands with a smaller squash; the dots, lines and gap go along
  const u = input.poke ?? 0;
  let hy = 0;
  if (u > 0 && u < 1) {
    const a = air(u);
    const e = 0.08 * wave(a) - 0.16 * wave(u / 0.22) - 0.09 * wave((u - 0.65) / 0.35);
    hy = a * (a - 1);
    m.sx *= 1 - 0.7 * e;
    m.sy *= 1 + e;
    m.ty += hy;
    m.anchor = 1;
  }

  // ---------------------------------------------------------------- body
  const body = clone(shapeContour(state.shape));
  let figured = 0;
  for (const { fig, w } of m.figs) {
    if (w <= 0.001) continue;
    blend(body, shapeContour(fig), Math.min(1, w), body);
    figured = Math.min(1, figured + w);
  }
  let bottom = 0;
  for (let i = 0; i < size(body); i++) bottom = Math.max(bottom, body.y[i]);
  const ay = bottom * m.anchor;
  const sx = m.sx * m.scale;
  const sy = m.sy * m.scale * (still ? 1 : breath(t, L));
  const cos = Math.cos(m.rot), sin = Math.sin(m.rot);
  // squash around the anchor, turn around the center, then move; in body units
  const place = (x: number, y: number): [number, number] => {
    const qx = x * sx;
    const qy = ay * m.scale + (y - ay) * sy;
    return [(qx * cos - qy * sin + m.tx) * RADIUS, (qx * sin + qy * cos + m.ty) * RADIUS];
  };
  for (let i = 0; i < size(body); i++) [body.x[i], body.y[i]] = place(body.x[i], body.y[i]);

  // ---------------------------------------------------------------- eyes
  let face = FACES[state.expression];
  for (const { expr, w } of m.exprs) if (w > 0.001) face = blendFace(face, FACES[expr], w);
  for (const { face: f, w } of m.faces) if (w > 0.001) face = blendFace(face, f, Math.min(1, w));
  const [wy, wp] = still ? [0, 0] : input.gaze ? [input.gaze[0] * 0.32, input.gaze[1] * 0.26] : wander(t, state.seed, L);
  const yaw = wy + m.yaw, pitch = wp + m.pitch;
  const open = (still ? 1 : blink(t, state.seed, L)) * (1 - clamp(m.shut, 0, 1)) * clamp(input.open ?? 1, 0, 1);
  const eyeFill = autoEyeColor(state.color);

  const fitted = (p: EyePose): Fitted => {
    const { pose, z } = turnEye(p, yaw, pitch);
    // on other shapes the face spreads to their edge: the eye keeps its direction from
    // the center and its distance follows the edge; figures already place their eyes
    const r = Math.hypot(pose.x, pose.y);
    let k = r > 1e-6 ? lerp(edgeAt(state.shape, Math.atan2(pose.x, -pose.y)), 1, figured) : 1;
    let c = eyeOutline(pose, open, pose.x * k, pose.y * k);
    // and it never sticks out: pull it toward the center until it fits inside, with a margin
    if (state.shape !== 'circle' && figured < 0.5) {
      for (let pass = 0; pass < 4; pass++) {
        let over = 0;
        for (let i = 0; i < EYE_POINTS; i++) over = Math.max(over, Math.hypot(c.x[i], c.y[i]) / (0.9 * edgeAt(state.shape, Math.atan2(c.x[i], -c.y[i]))));
        if (over <= 1) break;
        k *= 1 - Math.min(0.5, (over - 1) * 1.1);
        c = eyeOutline(pose, open, pose.x * k, pose.y * k);
      }
    }
    return { c, x: pose.x * k, y: pose.y * k, alpha: clamp(m.eyeAlpha, 0, 1) * smooth(z / 0.12) };
  };
  const pair = [fitted(face.left), fitted(face.right)] as const;
  if (state.shape !== 'circle' && figured < 0.5) apart(pair[0], pair[1]);
  const eyes = pair.map(({ c, alpha }): Layer => {
    for (let i = 0; i < EYE_POINTS; i++) [c.x[i], c.y[i]] = place(c.x[i], c.y[i]);
    return { c, fill: eyeFill, alpha };
  }) as [Layer, Layer];

  // ---------------------------------------------------------------- dots, gap and lines (not squashed)
  const parts: Layer[] = [];
  for (let i = 0; i < PART_SLOTS; i++) {
    const p = m.parts[i];
    const live = p && p.alpha > 0.002 && p.r > 0.001;
    parts.push({ c: dot(p?.x ?? 0, (p?.y ?? 0) + hy, live ? p.r : 0), fill: p?.color ?? state.color, alpha: live ? Math.min(1, p.alpha) : 0 });
  }
  const hole = dot(m.holeX, m.holeY + hy, Math.max(0, m.holeR));
  const back: Trail[] = [], front: Trail[] = [];
  for (let i = 0; i < TRAIL_SLOTS; i++) {
    const tr = m.trails[i];
    const x = new Float64Array(TRAIL_POINTS), y = new Float64Array(TRAIL_POINTS);
    if (tr && tr.alpha > 0.002) for (let k = 0; k < TRAIL_POINTS; k++) [x[k], y[k]] = [tr.pts[k][0] * RADIUS, (tr.pts[k][1] + hy) * RADIUS];
    (i % 2 ? front : back).push({ x, y, colors: tr?.colors ?? [state.color, state.color, state.color], width: (tr?.width ?? 0.05) * RADIUS, alpha: tr ? Math.min(1, tr.alpha) : 0 });
  }

  return {
    back,
    body: { c: body, fill: state.color, alpha: 1 },
    hole,
    parts,
    eyes,
    front,
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
    return { x, y, colors: w < 0.5 ? p.colors : q.colors, width: lerp(p.width, q.width, w), alpha: lerp(p.alpha, q.alpha, w) };
  };
  return {
    back: a.back.map((t, i) => trail(t, b.back[i])),
    body: layer(a.body, b.body),
    hole: blend(a.hole, b.hole, w),
    parts: a.parts.map((p, i) => layer(p, b.parts[i])),
    eyes: [layer(a.eyes[0], b.eyes[0]), layer(a.eyes[1], b.eyes[1])],
    front: a.front.map((t, i) => trail(t, b.front[i])),
  };
}
