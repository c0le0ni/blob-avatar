import { describe, expect, it } from 'vitest';
import { ANIMS, DEFAULT_STATE, EXPRESSIONS, EYES, frame, loopLength, SHAPES, cloneState, type BlobState } from '../src/engine';
import { fromHash, randomState, toHash } from '../src/engine/codec';
import { toSvgString } from '../src/render/svg';

const state = (p: Partial<BlobState> = {}): BlobState => ({ ...cloneState(DEFAULT_STATE), ...p });
const commands = (d: string) => (d.match(/[MCZ]/g) ?? []).join('');

describe('frame', () => {
  it('is deterministic: same state and time, same SVG', () => {
    for (const s of [state(), randomState(7), randomState(99)]) {
      for (const t of [0, 0.37, 1.9, 5.25]) expect(toSvgString(frame(s, t))).toBe(toSvgString(frame(s, t)));
    }
  });

  it('keeps one path structure for every shape, eye and expression (morphs and SMIL rely on it)', () => {
    const ref = frame(state(), 0);
    const body = commands(toSvgString({ ...ref, holes: [] }).match(/d="([^"]+)"/)![1]);
    for (const shape of SHAPES)
      for (const eyes of EYES)
        for (const expression of EXPRESSIONS) {
          const m = frame(state({ shape, eyes, expression }), 1.3);
          expect(m.body.c.x.length).toBe(ref.body.c.x.length);
          expect(m.eyes[0].c.x.length).toBe(ref.eyes[0].c.x.length);
          expect(m.decor.length).toBe(ref.decor.length);
        }
    expect(body.startsWith('M')).toBe(true);
  });

  it('has no NaN anywhere, in any clip, at any time', () => {
    for (const anim of ANIMS) {
      const s = state({ seq: [{ anim, dur: 1.6 }, { anim: 'idle', dur: 1 }] });
      for (let t = 0; t < 2.6; t += 0.11) expect(toSvgString(frame(s, t))).not.toMatch(/NaN|Infinity/);
    }
  });

  it('loops: the frame at the end of the montage is the frame at the start', () => {
    for (const s of [state(), randomState(3), randomState(42)]) {
      const L = loopLength(s);
      const a = frame(s, 0);
      const b = frame(s, L);
      for (let i = 0; i < a.body.c.x.length; i++) {
        expect(Math.abs(a.body.c.x[i] - b.body.c.x[i])).toBeLessThan(0.05);
        expect(Math.abs(a.body.c.y[i] - b.body.c.y[i])).toBeLessThan(0.05);
      }
    }
  });

  it('a still frame is the rest pose with open eyes', () => {
    const a = toSvgString(frame(state({ seq: [{ anim: 'hop', dur: 1.6 }] }), 0.5, { still: true }));
    const b = toSvgString(frame(state({ seq: [{ anim: 'hop', dur: 1.6 }] }), 2.2, { still: true }));
    expect(a).toBe(b);
  });
});

describe('codec', () => {
  it('round-trips 1000 random avatars through the URL', () => {
    for (let i = 0; i < 1000; i++) {
      const s = randomState(i * 7919 + 1);
      expect(toHash(fromHash(toHash(s)))).toBe(toHash(s));
    }
  });

  it('ignores hostile or broken input and falls back to the defaults', () => {
    const s = fromHash('#shape=<script>&color=red"/><x&eyes=../&expr=__proto__&anim=hop.999,evil.1,spin&bg=solid.zzzzzz&seed=!!&extra=1');
    expect(s.shape).toBe(DEFAULT_STATE.shape);
    expect(s.color).toBe(DEFAULT_STATE.color);
    expect(s.eyes).toBe(DEFAULT_STATE.eyes);
    expect(s.expression).toBe(DEFAULT_STATE.expression);
    expect(s.seq.map((c) => c.anim)).toEqual(['hop', 'spin']);
    expect(s.seq[0].dur).toBe(10);
    expect(s.bg.kind).toBe('none');
    expect(s.seed).toBe(DEFAULT_STATE.seed);
    expect(toSvgString(frame(s, 1))).not.toMatch(/script|<x|\.\.\//);
  });
});
