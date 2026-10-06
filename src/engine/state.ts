// What an avatar is: everything a person picks, and nothing else. The whole avatar
// fits in a short URL (see codec.ts) and the same state always draws the same blob.

import { EXPRESSIONS, type Expression } from './face';
import { EYES, type Eye } from './glyphs';
import { SHAPES, type Shape } from './shapes';
import { ANIMS, type Anim } from './animations';

export { SHAPES, EYES, EXPRESSIONS, ANIMS };
export type { Shape, Eye, Expression, Anim };

export interface Clip {
  anim: Anim;
  /** seconds */
  dur: number;
}

export interface Background {
  kind: 'none' | 'solid' | 'linear';
  c1: string;
  c2: string;
  /** degrees, for linear */
  angle: number;
}

export interface BlobState {
  v: 1;
  shape: Shape;
  /** body color, #rrggbb */
  color: string;
  eyes: Eye;
  /** eyes drawn on top of the body, or cut out of it */
  eyeMode: 'ink' | 'hole';
  /** #rrggbb, or 'auto' to read on any body */
  eyeColor: string;
  expression: Expression;
  seq: Clip[];
  bg: Background;
  seed: number;
}

/** the swatches offered in the app; any other color works too */
export const PALETTE = [
  { id: 'lime', hex: '#aefa0e' },
  { id: 'ink', hex: '#161616' },
  { id: 'cream', hex: '#f3eee4' },
  { id: 'coral', hex: '#ff6a5c' },
  { id: 'tangerine', hex: '#ff9a3c' },
  { id: 'sun', hex: '#ffd23f' },
  { id: 'mint', hex: '#3ddc97' },
  { id: 'teal', hex: '#17b3a3' },
  { id: 'sky', hex: '#4ea3ff' },
  { id: 'violet', hex: '#8a6cff' },
  { id: 'pink', hex: '#ff7ac4' },
  { id: 'stone', hex: '#9b9a93' },
] as const;

export const MAX_CLIPS = 8;

export const DEFAULT_STATE: BlobState = {
  v: 1,
  shape: 'bean',
  color: '#aefa0e',
  eyes: 'block',
  eyeMode: 'ink',
  eyeColor: 'auto',
  expression: 'neutral',
  seq: [
    { anim: 'idle', dur: 3 },
    { anim: 'hop', dur: 1.6 },
    { anim: 'idle', dur: 2.4 },
    { anim: 'jelly', dur: 1.4 },
  ],
  bg: { kind: 'none', c1: '#0a0a0a', c2: '#1f1f1f', angle: 135 },
  seed: 1,
};

export const cloneState = (s: BlobState): BlobState => ({ ...s, seq: s.seq.map((c) => ({ ...c })), bg: { ...s.bg } });

export const loopLength = (s: BlobState) => s.seq.reduce((n, c) => n + c.dur, 0);
