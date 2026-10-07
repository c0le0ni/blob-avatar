import { describe, expect, it } from 'vitest';
import { ANIMS, DEFAULT_CYCLE, DEFAULT_DUR, DEFAULT_STATE, EXPRESSIONS, SHAPES, frame, loopLength, cloneState, type BlobState, type RenderModel } from '../src/engine';
import { fromHash, randomState, toHash } from '../src/engine/codec';
import { toSvgString } from '../src/render/svg';

const state = (p: Partial<BlobState> = {}): BlobState => ({ ...cloneState(DEFAULT_STATE), ...p });
const counts = (m: RenderModel) => [m.body.c.x.length, m.eyes[0].c.x.length, m.eyes[1].c.x.length, m.parts.length, ...m.parts.map((p) => p.c.x.length), m.trails.length, ...m.trails.map((t) => t.x.length)].join(',');

describe('frame', () => {
  it('is deterministic: same state and time, same SVG', () => {
    for (const s of [state(), randomState(7), randomState(99)]) {
      for (const t of [0, 0.37, 1.9, 5.25, 17.3]) expect(toSvgString(frame(s, t))).toBe(toSvgString(frame(s, t)));
    }
  });

  it('keeps one structure for every shape, expression and animation (morphs and SMIL rely on it)', () => {
    const ref = counts(frame(state(), 0));
    for (const shape of SHAPES) for (const expression of EXPRESSIONS) expect(counts(frame(state({ shape, expression }), 1.3))).toBe(ref);
    const L = loopLength(state());
    for (let t = 0; t < L; t += 0.17) expect(counts(frame(state(), t))).toBe(ref);
  });

  it('has no NaN anywhere, in any animation, at any time', () => {
    for (const anim of ANIMS) {
      const s = state({ cycle: [{ anim, dur: DEFAULT_DUR[anim] }, { anim: 'idle', dur: 1 }] });
      for (let t = 0; t < DEFAULT_DUR[anim] + 1; t += 0.09) expect(toSvgString(frame(s, t))).not.toMatch(/NaN|Infinity/);
    }
  });

  it('every animation starts and ends as the plain blob', () => {
    for (const anim of ANIMS) {
      const d = DEFAULT_DUR[anim];
      const s = state({ cycle: [{ anim, dur: d }] });
      const plain = frame(state({ cycle: [{ anim: 'idle', dur: d }] }), 0);
      for (const t of [0, d - 1e-6]) {
        const m = frame(s, t);
        const dx = m.body.c.x.map((x, i) => Math.abs(x - plain.body.c.x[i]));
        expect(Math.max(...dx), `${anim} at ${t}`).toBeLessThan(1.5);
        expect(m.parts.every((p) => p.alpha < 0.02)).toBe(true);
        expect(m.trails.every((tr) => tr.alpha < 0.02)).toBe(true);
      }
    }
  });

  it('loops: the frame at the end of the cycle is the frame at the start', () => {
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
    const a = toSvgString(frame(state(), 0.5, { still: true }));
    const b = toSvgString(frame(state(), 7.2, { still: true }));
    expect(a).toBe(b);
  });

  it('the default cycle has every animation once', () => {
    expect(DEFAULT_CYCLE.map((c) => c.anim)).toEqual([...ANIMS]);
  });
});

describe('codec', () => {
  it('round-trips 1000 random avatars through the link', () => {
    for (let i = 0; i < 1000; i++) {
      const s = randomState(i * 7919 + 1);
      expect(toHash(fromHash(toHash(s)))).toBe(toHash(s));
    }
  });

  it('ignores hostile or broken input and falls back to the defaults', () => {
    const s = fromHash('#shape=<script>&color=red"/><x&expr=__proto__&anim=wink.999,evil.1,comet&seed=!!&extra=1');
    expect(s.shape).toBe(DEFAULT_STATE.shape);
    expect(s.color).toBe(DEFAULT_STATE.color);
    expect(s.expression).toBe(DEFAULT_STATE.expression);
    expect(s.cycle.map((c) => c.anim)).toEqual(['wink', 'comet']);
    expect(s.cycle[0].dur).toBe(10);
    expect(s.seed).toBe(DEFAULT_STATE.seed);
    expect(toSvgString(frame(s, 1))).not.toMatch(/script|<x/);
  });

  it('opens a first-version link with what still exists', () => {
    const s = fromHash('#v=1&shape=bean&color=ff6a5c&eyes=pixel&mode=hole&eyec=auto&expr=happy&anim=idle.3,hop.1.6,sleep.4&bg=none&seed=b');
    expect(s.shape).toBe('pebble');
    expect(s.color).toBe('#ff6a5c');
    expect(s.expression).toBe('happy');
    expect(s.cycle.map((c) => c.anim)).toEqual(['idle', 'sleep']);
    expect(s.seed).toBe(11);
  });
});
