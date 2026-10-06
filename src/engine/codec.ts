// The avatar as a short, readable URL hash, and back. The same keys are the
// <blob-avatar> attributes. Parsing never trusts its input: unknown keys are ignored,
// every value is checked against a list or a pattern, and anything wrong falls back
// to the default, so nothing from a link can reach the SVG unchecked.

import { ANIMS, DEFAULT_DUR, type Anim } from './animations';
import { isHex } from './color';
import { EXPRESSIONS } from './face';
import { EYES } from './glyphs';
import { rng, pick } from './prng';
import { SHAPES } from './shapes';
import { cloneState, DEFAULT_STATE, MAX_CLIPS, PALETTE, type Background, type BlobState, type Clip } from './state';

const oneOf = <T extends string>(list: readonly T[], v: string | null | undefined, fallback: T): T => (v && (list as readonly string[]).includes(v) ? (v as T) : fallback);
const hex = (v: string | null | undefined, fallback: string) => (v && isHex(v) ? `#${v.replace('#', '').toLowerCase()}` : fallback);
const clampDur = (v: number) => Math.min(10, Math.max(0.4, Math.round(v * 10) / 10));

export function parseSeq(v: string | null | undefined): Clip[] | null {
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

export const seqToString = (seq: Clip[]) => seq.map((c) => `${c.anim}.${clampDur(c.dur)}`).join(',');

function parseBg(v: string | null | undefined): Background {
  const d = DEFAULT_STATE.bg;
  if (!v || v === 'none') return { ...d, kind: 'none' };
  const [kind, c1, c2, angle] = v.split('.');
  if (kind === 'solid' && isHex(c1)) return { ...d, kind: 'solid', c1: hex(c1, d.c1) };
  if (kind === 'linear' && isHex(c1) && isHex(c2)) return { kind: 'linear', c1: hex(c1, d.c1), c2: hex(c2, d.c2), angle: Math.round(Math.min(360, Math.max(0, Number(angle) || 135))) };
  return { ...d, kind: 'none' };
}

const bgToString = (bg: Background) => (bg.kind === 'solid' ? `solid.${bg.c1.slice(1)}` : bg.kind === 'linear' ? `linear.${bg.c1.slice(1)}.${bg.c2.slice(1)}.${Math.round(bg.angle)}` : 'none');

const seedOf = (v: string | null | undefined, fallback: number) => (v && /^[0-9a-z]{1,6}$/.test(v) ? parseInt(v, 36) : fallback);

/** read a state from key/value pairs (URL hash, element attributes) */
export function fromParams(get: (k: string) => string | null | undefined, base: BlobState = DEFAULT_STATE): BlobState {
  const s = cloneState(base);
  s.shape = oneOf(SHAPES, get('shape'), s.shape);
  s.color = hex(get('color'), s.color);
  s.eyes = oneOf(EYES, get('eyes'), s.eyes);
  s.eyeMode = oneOf(['ink', 'hole'] as const, get('mode'), s.eyeMode);
  const ec = get('eyec');
  s.eyeColor = ec === 'auto' ? 'auto' : hex(ec, s.eyeColor);
  s.expression = oneOf(EXPRESSIONS, get('expr') ?? get('expression'), s.expression);
  s.seq = parseSeq(get('anim') ?? get('animation')) ?? s.seq;
  if (get('bg') != null) s.bg = parseBg(get('bg'));
  s.seed = seedOf(get('seed'), s.seed);
  return s;
}

/** the canonical hash: fixed key order, lowercase, no defaults dropped (links stay stable) */
export function toHash(s: BlobState): string {
  return [
    'v=1',
    `shape=${s.shape}`,
    `color=${s.color.slice(1)}`,
    `eyes=${s.eyes}`,
    `mode=${s.eyeMode}`,
    `eyec=${s.eyeColor === 'auto' ? 'auto' : s.eyeColor.slice(1)}`,
    `expr=${s.expression}`,
    `anim=${seqToString(s.seq)}`,
    `bg=${bgToString(s.bg)}`,
    `seed=${s.seed.toString(36)}`,
  ].join('&');
}

export function fromHash(hash: string, base: BlobState = DEFAULT_STATE): BlobState {
  const p = new URLSearchParams(hash.replace(/^#/, ''));
  return fromParams((k) => p.get(k), base);
}

/** a random avatar that still looks good: colors from the palette, sensible eyes */
export function randomState(seed: number): BlobState {
  const r = rng(seed);
  const s = cloneState(DEFAULT_STATE);
  s.shape = pick(r, SHAPES);
  s.color = pick(r, PALETTE).hex;
  s.eyes = pick(r, ['block', 'block', 'dot', 'oval', 'pill', 'pixel'] as const);
  s.eyeMode = r() < 0.25 ? 'hole' : 'ink';
  s.expression = pick(r, ['neutral', 'neutral', 'happy', 'joy', 'surprised', 'smug', 'shy', 'focused', 'sleepy', 'wink', 'love', 'starry'] as const);
  const moves = ['hop', 'jelly', 'bounce', 'float', 'spin', 'nod', 'lean', 'peek', 'love', 'excited', 'pop', 'dizzy', 'shake'] as const;
  const a = pick(r, moves);
  const b = pick(r, moves);
  s.seq = [
    { anim: 'idle', dur: 2.4 },
    { anim: a, dur: DEFAULT_DUR[a] },
    { anim: 'idle', dur: 1.8 },
    { anim: b, dur: DEFAULT_DUR[b] },
  ];
  s.seed = Math.floor(r() * 36 ** 4);
  return s;
}
