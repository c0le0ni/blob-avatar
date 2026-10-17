// What an avatar is: everything a person picks, and nothing else. The whole avatar
// fits in a short link (see codec.ts) and the same state always draws the same blob.

import { ANIMS, CLASSIC_ANIMS, DEFAULT_DUR, type Anim } from './animations';
import { EXPRESSIONS, type Expression } from './face';
import { SHAPES, type Shape } from './shapes';

export { SHAPES, EXPRESSIONS, ANIMS };
export type { Shape, Expression, Anim };

export interface Clip {
  anim: Anim;
  /** seconds */
  dur: number;
}

export interface BlobState {
  v: 2;
  shape: Shape;
  /** body color, #rrggbb */
  color: string;
  expression: Expression;
  /** the animations, in order: the cycle */
  cycle: Clip[];
  seed: number;
}

/** the swatches offered in the app; any other color works too */
export const PALETTE = [
  { id: 'ink', hex: '#0a0a0c' },
  { id: 'brown', hex: '#8b5e3c' },
  { id: 'red', hex: '#e8483f' },
  { id: 'orange', hex: '#f08a24' },
  { id: 'amber', hex: '#f0b429' },
  { id: 'lime', hex: '#aefa0e' },
  { id: 'turquoise', hex: '#2fbfa0' },
  { id: 'blue', hex: '#3b93f0' },
  { id: 'purple', hex: '#8b5cf6' },
  { id: 'pink', hex: '#e152b0' },
  { id: 'grey', hex: '#a3a3a3' },
  { id: 'cream', hex: '#f1efe9' },
  { id: 'coral', hex: '#ff7f6a' },
  { id: 'sand', hex: '#e8c99b' },
  { id: 'forest', hex: '#2f7d4f' },
  { id: 'mint', hex: '#7ee0b5' },
  { id: 'sky', hex: '#8fd3ff' },
  { id: 'lavender', hex: '#c7b2ff' },
] as const;

export const MAX_CLIPS = 24;

/**
 * What an avatar plays when it names no animation (the embed, the React component,
 * a new editor): the fourteen classic animations once, in their order. It stays
 * those fourteen as animations are added, so an avatar already on a page keeps
 * moving the way it did.
 */
export const DEFAULT_CYCLE: Clip[] = CLASSIC_ANIMS.map((anim) => ({ anim, dur: DEFAULT_DUR[anim] }));

/** what the editor plays while you customize: just breathing and looking around */
export const IDLE_CYCLE: Clip[] = [{ anim: 'idle', dur: 4.8 }];

export const DEFAULT_STATE: BlobState = {
  v: 2,
  shape: 'circle',
  color: '#aefa0e',
  expression: 'neutral',
  cycle: DEFAULT_CYCLE,
  seed: 1,
};

export const cloneState = (s: BlobState): BlobState => ({ ...s, cycle: s.cycle.map((c) => ({ ...c })) });

export const loopLength = (s: Pick<BlobState, 'cycle'>) => s.cycle.reduce((n, c) => n + c.dur, 0);
