// The face. Each eye is a capsule (a stadium) lying on the surface of a sphere the
// size of the body: where it sits, how big it is, and how it is turned on the
// surface. Seen from the front, an eye near the rim is foreshortened, so its
// outline is the capsule through a 2x2 matrix. Turning the head (glances, spins)
// moves the eyes over the sphere and updates that matrix; an eye that goes around
// the back is hidden. Expressions only change the eyes.
//
// Units: body radii, y down. An eye pose is its center (x, y) on the circle shape,
// its capsule (w wide, h tall) and the matrix m = [a, b, c, d] that maps the
// capsule's own axes to the screen at that spot.

import { make, type Contour } from './contour';
import { capsule, EYE_POINTS } from './glyphs';
import { clamp, lerp } from './math';

export const EXPRESSIONS = [
  'neutral', 'attentive', 'focused', 'surprised', 'excited', 'happy', 'laughing', 'wink', 'angry', 'sad',
  'worried', 'scared', 'suspicious', 'confused', 'curious', 'proud', 'smug', 'shy', 'unimpressed', 'sleepy',
] as const;
export type Expression = (typeof EXPRESSIONS)[number];

export interface EyePose {
  x: number;
  y: number;
  w: number;
  h: number;
  m: [number, number, number, number];
}

export interface Face {
  left: EyePose;
  right: EyePose;
}

const E = (x: number, y: number, w: number, h: number, a: number, b: number, c: number, d: number): EyePose => ({ x, y, w, h, m: [a, b, c, d] });

/** one eye open, the other shut in a line: an expression, and the pose of the wink animation */
const WINK: Face = { left: E(-0.345, -0.115, 0.24, 0.46, 0.94, 0.06, -0.1, 0.99), right: E(0.205, -0.065, 0.45, 0.09, 0.97, 0.12, -0.1, 0.99) };

export const FACES: Record<Expression, Face> = {
  // looking up and to the right: the capsules sit high on the sphere, foreshortened
  neutral: { left: E(0.188, -0.406, 0.186, 0.412, 0.889, -0.314, 0.414, 0.857), right: E(0.618, -0.51, 0.186, 0.412, 0.667, -0.061, 0.414, 0.857) },
  attentive: { left: E(-0.212, -0.065, 0.21, 0.44, 0.973, -0.095, 0.08, 0.991), right: E(0.336, -0.106, 0.21, 0.44, 0.937, -0.046, 0.08, 0.991) },
  // a squint straight ahead, the inner ends a touch lower
  focused: { left: E(-0.208, -0.029, 0.28, 0.2, 0.969, 0.133, -0.136, 0.991), right: E(0.305, -0.048, 0.28, 0.2, 0.943, -0.124, 0.133, 0.991) },
  surprised: { left: E(-0.281, 0.047, 0.45, 0.47, 0.958, 0.021, -0.008, 0.998), right: E(0.369, 0.051, 0.45, 0.47, 0.928, -0.012, -0.008, 0.998) },
  excited: { left: E(-0.239, 0.234, 0.4, 0.56, 0.958, -0.091, 0.149, 0.967), right: E(0.425, 0.231, 0.4, 0.56, 0.887, 0.083, -0.176, 0.969) },
  happy: { left: E(-0.203, -0.155, 0.27, 0.17, 0.952, 0.198, -0.227, 0.967), right: E(0.378, -0.152, 0.27, 0.17, 0.894, -0.188, 0.233, 0.969) },
  laughing: { left: E(-0.236, -0.229, 0.34, 0.13, 0.919, 0.257, -0.31, 0.937), right: E(0.379, -0.232, 0.34, 0.13, 0.86, -0.265, 0.338, 0.934) },
  wink: WINK,
  angry: { left: E(-0.241, -0.114, 0.34, 0.15, 0.841, 0.47, -0.481, 0.874), right: E(0.343, -0.112, 0.34, 0.15, 0.81, -0.464, 0.472, 0.878) },
  sad: { left: E(-0.228, 0.214, 0.22, 0.4, 0.862, -0.406, 0.449, 0.887), right: E(0.322, 0.212, 0.22, 0.4, 0.831, 0.401, -0.452, 0.89) },
  // tilted like sad, but higher, looking up
  worried: { left: E(-0.352, -0.112, 0.24, 0.44, 0.9, -0.314, 0.258, 0.943), right: E(0.315, -0.142, 0.24, 0.44, 0.912, 0.318, -0.262, 0.938) },
  scared: { left: E(-0.322, 0.318, 0.4, 0.6, 0.945, 0.12, -0.011, 0.939), right: E(0.377, 0.319, 0.4, 0.6, 0.925, -0.118, -0.011, 0.939) },
  suspicious: { left: E(-0.073, -0.069, 0.21, 0.4, 0.989, -0.129, 0.124, 0.988), right: E(0.462, -0.127, 0.22, 0.15, 0.877, -0.073, 0.124, 0.988) },
  confused: { left: E(-0.508, -0.09, 0.2, 0.44, 0.851, -0.192, 0.122, 0.977), right: E(0.036, -0.01, 0.28, 0.17, 0.922, 0.384, -0.382, 0.923) },
  curious: { left: E(0, 0.22, 0.24, 0.46, 0.94, -0.332, 0.339, 0.916), right: E(0.532, 0.075, 0.2, 0.38, 0.783, -0.419, 0.317, 0.904) },
  proud: { left: E(-0.202, -0.279, 0.3, 0.15, 0.939, 0.214, -0.274, 0.935), right: E(0.379, -0.279, 0.3, 0.15, 0.87, -0.215, 0.313, 0.935) },
  // half shut, a sideways look up and to the right
  smug: { left: E(0.04, -0.12, 0.29, 0.14, 0.984, -0.168, 0.174, 0.979), right: E(0.479, -0.14, 0.27, 0.13, 0.873, -0.027, 0.092, 0.99) },
  shy: { left: E(-0.529, 0.265, 0.17, 0.3, 0.825, -0.054, 0.191, 0.961), right: E(-0.08, 0.209, 0.17, 0.3, 0.977, -0.171, 0.191, 0.961) },
  unimpressed: { left: E(-0.616, -0.036, 0.3, 0.12, 0.785, -0.012, -0.012, 1), right: E(-0.106, -0.037, 0.3, 0.12, 0.994, 0.008, -0.012, 1) },
  // the same eyes as attentive, nearly shut
  sleepy: { left: E(-0.178, 0.163, 0.2, 0.42, 0.983, -0.001, 0.033, 0.448), right: E(0.37, 0.137, 0.2, 0.42, 0.927, -0.041, 0.033, 0.448) },
};

/** eye poses some animations use */
export const STATE_EYES = {
  wink: WINK,
  wide: { left: E(-0.175, 0.28, 0.36, 0.88, 0.96, 0.26, -0.22, 0.93), right: E(0.435, 0.385, 0.36, 0.88, 0.87, 0.05, -0.22, 0.93) },
  notification: { left: E(-0.68, 0.21, 0.5, 0.5, 0.68, -0.13, 0.24, 0.97), right: E(-0.12, 0.09, 0.5, 0.5, 0.96, -0.23, 0.24, 0.97) },
  egg: { left: E(0.16, -0.34, 0.16, 0.39, 0.88, -0.35, 0.44, 0.86), right: E(0.43, -0.41, 0.16, 0.39, 0.76, -0.19, 0.44, 0.86) },
  hexa: { left: E(0.14, -0.285, 0.18, 0.41, 0.92, -0.32, 0.37, 0.9), right: E(0.55, -0.42, 0.18, 0.41, 0.76, -0.15, 0.37, 0.9) },
  play: { left: E(-0.1, 0.13, 0.18, 0.34, 0.99, -0.07, 0.09, 0.99), right: E(0.35, 0.09, 0.18, 0.34, 0.92, -0.13, 0.09, 0.99) },
} satisfies Record<string, Face>;

export function blendEye(a: EyePose, b: EyePose, t: number): EyePose {
  if (t <= 0) return a;
  if (t >= 1) return b;
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), w: lerp(a.w, b.w, t), h: lerp(a.h, b.h, t), m: [lerp(a.m[0], b.m[0], t), lerp(a.m[1], b.m[1], t), lerp(a.m[2], b.m[2], t), lerp(a.m[3], b.m[3], t)] };
}

export const blendFace = (a: Face, b: Face, t: number): Face => (t <= 0 ? a : t >= 1 ? b : { left: blendEye(a.left, b.left, t), right: blendEye(a.right, b.right, t) });

/**
 * Turn the head: rotate the eye's spot and its capsule's axes on the sphere by yaw
 * (around the vertical axis, positive turns the face to the right) and pitch
 * (positive turns it up). Returns the moved pose and how far it faces the viewer
 * (z: 1 straight ahead, 0 at the rim, below 0 behind).
 */
export function turnEye(p: EyePose, yaw: number, pitch: number): { pose: EyePose; z: number } {
  const r2 = p.x * p.x + p.y * p.y;
  const z = Math.sqrt(Math.max(0.0225, 1 - r2));
  if (!yaw && !pitch) return { pose: p, z };
  const [a, b, c, d] = p.m;
  // the capsule's axes as vectors on the sphere's surface (tangent at the spot)
  const t1: V = [a, b, -(a * p.x + b * p.y) / z];
  const t2: V = [c, d, -(c * p.x + d * p.y) / z];
  const pos: V = [p.x, p.y, z];
  const rot = (v: V): V => {
    // yaw around the screen's vertical axis, then pitch around the horizontal one (y points down)
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    const x1 = v[0] * cy + v[2] * sy, z1 = -v[0] * sy + v[2] * cy;
    const y2 = v[1] * cp + z1 * sp, z2 = -v[1] * sp + z1 * cp;
    return [x1, y2, z2];
  };
  const q = rot(pos), u = rot(t1), v = rot(t2);
  return { pose: { ...p, x: q[0], y: q[1], m: [u[0], u[1], v[0], v[1]] }, z: q[2] };
}
type V = [number, number, number];

/**
 * The outline of one eye, in body radii: the capsule, squeezed along its own
 * height by `open` (1 open, a blink goes down to about 0.43), through the pose's
 * matrix, at (cx, cy).
 */
export function eyeOutline(p: EyePose, open: number, cx = p.x, cy = p.y): Contour {
  const g = capsule(p.w / Math.max(0.001, p.h));
  const out = make(EYE_POINTS);
  const s = clamp(open, 0.02, 1);
  const [a, b, c, d] = p.m;
  for (let i = 0; i < EYE_POINTS; i++) {
    const lx = g.x[i] * p.h, ly = g.y[i] * p.h * s;
    out.x[i] = cx + a * lx + c * ly;
    out.y[i] = cy + b * lx + d * ly;
  }
  return out;
}
