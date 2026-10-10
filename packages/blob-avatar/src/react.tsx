// <BlobAvatar>: the avatar in a React app. The first render is the blob as plain
// SVG markup, at its final size, so it renders on the server and nothing moves when
// the page hydrates. After mount a live SVG takes its place, driven by the same loop
// as <blob-avatar> (driver.ts); a change of props redraws it without a remount.

import { useEffect, useId, useRef, useState, type CSSProperties, type HTMLAttributes } from 'react';
import { DEFAULT_STATE, VIEW, frame, type Anim, type BlobState, type Clip, type Expression, type Shape } from './engine';
import { cycleToString, fromHash, fromParams, toHash } from './engine/codec';
import { LiveSvg, layersMarkup } from './render/svg';
import { drive, reactionOf, type Driver } from './driver';

export interface BlobAvatarProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'color' | 'children' | 'dangerouslySetInnerHTML'> {
  /** the outline of the body */
  shape?: Shape;
  /** the body color: a six-digit hex color, with or without `#` */
  color?: string;
  /** the face */
  expression?: Expression;
  /** the cycle, played in order and looped: `"idle.2.4,wink.1.6"` as in the share link, or a list of clips */
  animation?: string | Clip[];
  /** changes when it blinks and where it glances: a whole number, or 1 to 6 characters of `0-9a-z` as in the share link */
  seed?: number | string;
  /** width and height: pixels, or any CSS length */
  size?: number | string;
  /** the eyes follow the cursor */
  gaze?: boolean;
  /** holds still */
  paused?: boolean;
  /** a click makes it wink and hop (`true`), or plays the animation it names, with seconds if you like (`"exclaim"`, `"orbit.2"`); with a `tabIndex`, Enter and Space too */
  reaction?: boolean | Anim | `${Anim}.${number}`;
  /** a whole share-link hash (`"v=2&shape=…"`) or a state; the props above override its parts */
  state?: string | BlobState;
}

type StateProps = Pick<BlobAvatarProps, 'shape' | 'color' | 'expression' | 'animation' | 'seed' | 'state'>;

/** a seed as the link writes it: base 36 */
const seedKey = (v: number | string | undefined) => (typeof v === 'number' ? (Number.isFinite(v) && v >= 0 ? Math.floor(v).toString(36) : undefined) : v);

/** props, or a state, as the keys <blob-avatar> reads */
const keysOf = (p: Pick<StateProps, 'shape' | 'color' | 'expression' | 'animation' | 'seed'>): Record<string, string | undefined> => ({
  shape: p.shape,
  color: p.color,
  expression: p.expression,
  animation: Array.isArray(p.animation) ? cycleToString(p.animation) : p.animation,
  seed: seedKey(p.seed),
});

/**
 * The state the props describe, read the way <blob-avatar> reads its attributes: a
 * value that is not on the lists is ignored, so the default (or the value from
 * `state`) stays. A state object goes through the same checks, so nothing reaches
 * the markup unchecked.
 */
export function stateOf(p: StateProps): BlobState {
  const read = (keys: Record<string, string | undefined>, base: BlobState) => fromParams((k) => keys[k], base);
  const s = p.state;
  const base = typeof s === 'string' ? fromHash(s) : s ? read(keysOf({ ...s, animation: s.cycle }), DEFAULT_STATE) : DEFAULT_STATE;
  return read(keysOf(p), base);
}

const HALF = VIEW / 2;

/** the blob at the start of its cycle (or at rest, held still) as SVG markup */
function markup(s: BlobState, still: boolean, id: string) {
  const { defs, body } = layersMarkup(frame(s, 0, { still }), id);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-HALF} ${-HALF} ${VIEW} ${VIEW}" width="100%" height="100%" overflow="visible" aria-hidden="true">${defs ? `<defs>${defs}</defs>` : ''}${body}</svg>`;
}

/** the animated blob avatar */
export function BlobAvatar({ shape, color, expression, animation, seed, size = 160, gaze = false, paused = false, reaction = false, state, className, style, ...rest }: BlobAvatarProps) {
  const s = stateOf({ shape, color, expression, animation, seed, state });
  const key = toHash(s);
  const re = !reaction ? null : reactionOf(reaction === true ? '' : reaction);
  const reKey = re && `${re.anim}.${re.dur}.${re.hop ? 1 : ''}`;
  const host = useRef<HTMLSpanElement>(null);
  const driver = useRef<Driver | null>(null);
  // ids for the gradients and the clip, the same on the server and in the browser
  const id = `ba${useId().replace(/[^\w-]/g, '')}`;
  // the first picture, kept as it is: React never touches it again, so the live
  // SVG that replaces it after mount stays
  const [first] = useState(() => markup(s, paused, id));

  useEffect(() => {
    const el = host.current!;
    const svg = new LiveSvg(el.ownerDocument);
    svg.el.setAttribute('width', '100%');
    svg.el.setAttribute('height', '100%');
    el.replaceChildren(svg.el);
    const d = drive(el, svg);
    driver.current = d;
    d.start();
    return () => {
      d.set({ reaction: null });
      d.stop();
      driver.current = null;
    };
  }, []);

  useEffect(() => {
    driver.current?.set({ state: s, gaze, paused, reaction: re });
    // s and re are what key and reKey say
  }, [key, gaze, paused, reKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const px = typeof size === 'number' ? `${size}px` : size;
  const box: CSSProperties = { display: 'inline-block', width: px, height: px, lineHeight: 0, verticalAlign: 'middle' };
  if (re) Object.assign(box, { cursor: 'pointer', WebkitTapHighlightColor: 'transparent', userSelect: 'none' });

  return (
    <span
      ref={host}
      role="img"
      aria-label={rest['aria-labelledby'] ? undefined : 'Blob avatar'}
      {...rest}
      className={className}
      style={{ ...box, ...style }}
      dangerouslySetInnerHTML={{ __html: first }}
    />
  );
}
