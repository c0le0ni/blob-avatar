// The avatar as a short, readable link hash, and back. The same keys are the
// <blob-avatar> attributes. Parsing never trusts its input: unknown keys are ignored,
// every value is checked against a list or a pattern, and anything wrong falls back
// to the default, so nothing from a link can reach the SVG unchecked.

import { ANIMS, DEFAULT_DUR, type Anim } from './animations';
import { isHex } from './color';
import { EXPRESSIONS } from './face';
import { pick, rng } from './prng';
import { SHAPES } from './shapes';
import { cloneState, DEFAULT_STATE, MAX_CLIPS, PALETTE, type BlobState, type Clip } from './state';

const oneOf = <T extends string>(list: readonly T[], v: string | null | undefined, fallback: T): T => (v && (list as readonly string[]).includes(v) ? (v as T) : fallback);
const hex = (v: string | null | undefined, fallback: string) => (v && isHex(v) ? `#${v.replace('#', '').toLowerCase()}` : fallback);
const clampDur = (v: number) => Math.min(10, Math.max(0.4, Math.round(v * 10) / 10));

/**
 * Names from the first version of the links, so old links still open close to what
 * they showed: shapes that were renamed, and expressions that are gone, each to the
 * nearest one now. The rest of the old names (ghost, star, wink...) are still names.
 */
const OLD_SHAPES: Record<string, string> = { orb: 'circle', bean: 'pebble', block: 'squircle', pill: 'capsule', tri: 'triangle', hex: 'hexagon', puff: 'cloud', drop: 'droplet' };
const OLD_EXPRESSIONS: Record<string, string> = { joy: 'laughing', love: 'happy', starry: 'excited', dizzy: 'confused' };
const renamed = (old: Record<string, string>, v: string | null | undefined) => (v && Object.prototype.hasOwnProperty.call(old, v) ? old[v] : v);

export function parseCycle(v: string | null | undefined): Clip[] | null {
  if (!v) return null;
  const clips: Clip[] = [];
  for (const part of v.split(',').slice(0, MAX_CLIPS)) {
    const m = part.match(/^([a-z]+)(?:\.(\d+(?:\.\d)?))?$/);
    if (!m || !(ANIMS as readonly string[]).includes(m[1])) continue;
    const anim = m[1] as Anim;
    clips.push({ anim, dur: m[2] ? clampDur(Number(m[2])) : DEFAULT_DUR[anim] });
  }
  return clips.length ? clips : null;
}

export const cycleToString = (cycle: Clip[]) => cycle.map((c) => `${c.anim}.${clampDur(c.dur)}`).join(',');

const seedOf = (v: string | null | undefined, fallback: number) => (v && /^[0-9a-z]{1,6}$/.test(v) ? parseInt(v, 36) : fallback);

/** read a state from key/value pairs (link hash, element attributes) */
export function fromParams(get: (k: string) => string | null | undefined, base: BlobState = DEFAULT_STATE): BlobState {
  const s = cloneState(base);
  s.shape = oneOf(SHAPES, renamed(OLD_SHAPES, get('shape')), s.shape);
  s.color = hex(get('color'), s.color);
  s.expression = oneOf(EXPRESSIONS, renamed(OLD_EXPRESSIONS, get('expr') ?? get('expression')), s.expression);
  s.cycle = parseCycle(get('anim') ?? get('animation')) ?? s.cycle;
  s.seed = seedOf(get('seed'), s.seed);
  return s;
}

/** the canonical hash: fixed key order, lowercase, no defaults dropped (links stay stable) */
export function toHash(s: BlobState): string {
  return ['v=2', `shape=${s.shape}`, `color=${s.color.slice(1)}`, `expr=${s.expression}`, `anim=${cycleToString(s.cycle)}`, `seed=${s.seed.toString(36)}`].join('&');
}

export function fromHash(hash: string, base: BlobState = DEFAULT_STATE): BlobState {
  const p = new URLSearchParams(hash.replace(/^#/, ''));
  return fromParams((k) => p.get(k), base);
}

/** a random avatar from the swatches, with a short random cycle (tests and demos) */
export function randomState(seed: number): BlobState {
  const r = rng(seed);
  const s = cloneState(DEFAULT_STATE);
  s.shape = pick(r, SHAPES);
  s.color = pick(r, PALETTE).hex;
  s.expression = pick(r, EXPRESSIONS);
  const a = pick(r, ANIMS);
  const b = pick(r, ANIMS);
  s.cycle = [{ anim: 'idle', dur: 2.4 }, { anim: a, dur: DEFAULT_DUR[a] }, { anim: b, dur: DEFAULT_DUR[b] }];
  s.seed = Math.floor(r() * 36 ** 4);
  return s;
}
