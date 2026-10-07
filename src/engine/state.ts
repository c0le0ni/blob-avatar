// What an avatar is: everything a person picks, and nothing else. The whole avatar
// fits in a short link (see codec.ts) and the same state always draws the same blob.

import { ANIMS, DEFAULT_DUR, type Anim } from './animations';
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
  { id: 'ink', hex: '#18181b' },
  { id: 'brown', hex: '#8a5a3c' },
  { id: 'red', hex: '#ef4444' },
  { id: 'orange', hex: '#f28c28' },
  { id: 'amber', hex: '#f5b400' },
  { id: 'lime', hex: '#aefa0e' },
  { id: 'turquoise', hex: '#14b8a6' },
  { id: 'blue', hex: '#3b82f6' },
  { id: 'purple', hex: '#8b5cf6' },
  { id: 'pink', hex: '#ec4899' },
  { id: 'grey', hex: '#a1a1aa' },
  { id: 'cream', hex: '#f1efe7' },
] as const;

export const MAX_CLIPS = 24;

/** every animation once, in the order of the list */
export const DEFAULT_CYCLE: Clip[] = ANIMS.map((anim) => ({ anim, dur: DEFAULT_DUR[anim] }));

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
