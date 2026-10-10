import { describe, expect, it } from 'vitest';
import { ANIMS, DEFAULT_CYCLE, DEFAULT_DUR, DEFAULT_STATE, EXPRESSIONS, SHAPES, frame, loopLength, cloneState, type BlobState, type RenderModel } from '../src/engine';
import { fromHash, randomState, toHash } from '../src/engine/codec';
import { bounds, polygonArea, resample, type Pt } from '../src/engine/contour';
import { shapeContour } from '../src/engine/shapes';
import { toSvgString } from '../src/render/svg';

const state = (p: Partial<BlobState> = {}): BlobState => ({ ...cloneState(DEFAULT_STATE), ...p });
const counts = (m: RenderModel) => [m.body.c.x.length, m.hole.x.length, m.eyes[0].c.x.length, m.eyes[1].c.x.length, m.parts.length, ...m.parts.map((p) => p.c.x.length), m.back.length, m.front.length, ...[...m.back, ...m.front].map((t) => t.x.length)].join(',');

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

  it('every animation turns back into the plain blob when idle follows it', () => {
    for (const anim of ANIMS) {
      const d = DEFAULT_DUR[anim];
      const s = state({ cycle: [{ anim, dur: d }, { anim: 'idle', dur: 2 }] });
      const plain = frame(state({ cycle: [{ anim: 'idle', dur: d + 2 }] }), d + 1.5, { gaze: [0, 0] });
      const m = frame(s, d + 1.5, { gaze: [0, 0] });
      const dx = m.body.c.x.map((x, i) => Math.abs(x - plain.body.c.x[i]));
      expect(Math.max(...dx), anim).toBeLessThan(1.5);
      expect(m.parts.every((p) => p.alpha < 0.02)).toBe(true);
      expect([...m.back, ...m.front].every((tr) => tr.alpha < 0.02)).toBe(true);
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

describe('shapes', () => {
  it('twelve shapes, all about the size of the circle, and none reaching far past it', () => {
    expect(SHAPES).toHaveLength(12);
    for (const shape of SHAPES) {
      const c = shapeContour(shape);
      const area = polygonArea(c) / Math.PI;
      expect(area, shape).toBeGreaterThan(0.55);
      expect(area, shape).toBeLessThan(1.1);
      const b = bounds(c);
      expect(Math.max(-b.x0, b.x1, -b.y0, b.y1), shape).toBeLessThan(1.1);
    }
  });

  it('starts every symmetric shape on the vertical axis, at its top, going clockwise', () => {
    for (const shape of ['circle', 'squircle', 'triangle', 'diamond', 'star', 'droplet', 'heart', 'ghost'] as const) {
      const c = shapeContour(shape);
      expect(Math.abs(c.x[0]), shape).toBeLessThan(1e-6);
      expect(c.y[0], shape).toBeLessThan(0);
      expect(c.x[1], shape).toBeGreaterThan(0);
    }
    // the heart starts in the notch between its lobes, not on one of them
    const heart = shapeContour('heart');
    expect(heart.y[0]).toBeGreaterThan(Math.min(...heart.y) + 0.1);
  });

  it("an outline with two tops starts on one of them by default, and between them with start: 'axis'", () => {
    const twoTops: Pt[] = [[-1, -1], [-0.5, -1.2], [0, -0.8], [0.5, -1.2], [1, -1], [1, 1], [-1, 1]];
    expect(Math.abs(resample(twoTops, 24).x[0])).toBeCloseTo(0.5);
    const c = resample(twoTops, 24, { start: 'axis' });
    expect([c.x[0], c.y[0]]).toEqual([0, -0.8]);
    expect(c.x[1]).toBeGreaterThan(0);
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
