import { describe, expect, it } from 'vitest';
import { ANIMS, DEFAULT_CYCLE, DEFAULT_DUR, DEFAULT_STATE, EXPRESSIONS, POKE, SHAPES, envelope, frame, loopLength, cloneState, type BlobState, type RenderModel } from 'blob-avatar/engine';
import { fromHash, fromParams, randomLook, randomState, toHash } from 'blob-avatar/engine/codec';
import { springGaze, type Gaze } from 'blob-avatar/engine/gaze';
import { bounds, polygonArea, resample, type Contour, type Pt } from 'blob-avatar/engine/contour';
import { shapeContour } from 'blob-avatar/engine/shapes';
import { toSvgString } from 'blob-avatar/render/svg';

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

/** whether (x, y) is inside a closed outline (even-odd) */
function inside(c: Contour, x: number, y: number): boolean {
  let hit = false;
  for (let i = 0, j = c.x.length - 1; i < c.x.length; j = i++) {
    if (c.y[i] > y !== c.y[j] > y && x < ((c.x[j] - c.x[i]) * (y - c.y[i])) / (c.y[j] - c.y[i]) + c.x[i]) hit = !hit;
  }
  return hit;
}

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

  it('keeps both eyes inside the body at rest, and apart from each other, for every shape and expression', () => {
    for (const shape of SHAPES) {
      for (const expression of EXPRESSIONS) {
        const rest = frame(state({ shape, expression }), 0, { still: true });
        for (const e of rest.eyes) for (let i = 0; i < e.c.x.length; i++) expect(inside(rest.body.c, e.c.x[i], e.c.y[i]), `${shape} ${expression}`).toBe(true);
        // a glance turns the head (on a circle an eye can go round the rim), and the eyes still keep apart
        for (const gaze of [null, [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6], [-0.6, -0.6]] as const) {
          const [a, b] = (gaze ? frame(state({ shape, expression }), 0, { gaze: [...gaze] }) : rest).eyes;
          for (let i = 0; i < a.c.x.length; i++) expect(inside(b.c, a.c.x[i], a.c.y[i]) || inside(a.c, b.c.x[i], b.c.y[i]), `${shape} ${expression} ${gaze}`).toBe(false);
        }
      }
    }
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

  it("opens the first version's names: the ones that came back as they are, the gone expressions as the nearest ones", () => {
    for (const shape of ['ghost', 'star']) expect(fromHash(`#shape=${shape}`).shape).toBe(shape);
    for (const expr of ['wink', 'worried', 'focused', 'smug']) expect(fromHash(`#expr=${expr}`).expression).toBe(expr);
    const nearest = { joy: 'laughing', love: 'happy', starry: 'excited', dizzy: 'confused' };
    for (const [old, now] of Object.entries(nearest)) {
      expect(fromHash(`#expr=${old}`).expression).toBe(now);
      expect(fromParams((k) => (k === 'expression' ? old : null)).expression).toBe(now);
    }
    // nothing an object inherits passes for an old name
    const s = fromHash('#shape=constructor&expr=toString');
    expect([s.shape, s.expression]).toEqual([DEFAULT_STATE.shape, DEFAULT_STATE.expression]);
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

describe('random look', () => {
  it('changes the look and never the cycle', () => {
    const cycle = [{ anim: 'wink' as const, dur: 1.6 }, { anim: 'orbit' as const, dur: 3.4 }];
    for (let i = 0; i < 500; i++) {
      const from = i % 2 ? randomState(i) : state({ cycle });
      const next = randomLook(from, i * 131 + 7);
      expect(next.cycle).toEqual(from.cycle);
      expect(next.cycle).not.toBe(from.cycle);
      expect(next.shape !== from.shape || next.color !== from.color || next.expression !== from.expression).toBe(true);
      expect(toHash(fromHash(toHash(next)))).toBe(toHash(next));
    }
  });

  it('is the same roll for the same seed', () => {
    expect(toHash(randomLook(state(), 42))).toBe(toHash(randomLook(state(), 42)));
  });
});

describe('gaze', () => {
  it('eases the eyes onto the target and stays there', () => {
    let g: Gaze = [0, 0, 0, 0];
    for (let i = 0; i < 120; i++) g = springGaze(g, [0.8, -0.5], 1 / 60);
    expect(g[0]).toBeCloseTo(0.8, 2);
    expect(g[1]).toBeCloseTo(-0.5, 2);
  });
});

describe('poke and reaction', () => {
  const top = (m: RenderModel) => Math.min(...m.body.c.y);
  const apart = (a: RenderModel, b: RenderModel) => Math.max(...a.body.c.y.map((y, i) => Math.hypot(a.body.c.x[i] - b.body.c.x[i], y - b.body.c.y[i])));

  it('a poke has no NaN, hops, and is back at rest at 1', () => {
    for (const s of [state(), randomState(7), state({ shape: 'heart', cycle: [{ anim: 'notification', dur: 2.2 }] })]) {
      const rest = frame(s, 0.9);
      expect(toSvgString(frame(s, 0.9, { poke: 0 }))).toBe(toSvgString(rest));
      expect(toSvgString(frame(s, 0.9, { poke: 1 }))).toBe(toSvgString(rest));
      for (let u = 0.01; u < 1; u += 0.03) expect(toSvgString(frame(s, 0.9, { poke: u }))).not.toMatch(/NaN|Infinity/);
      expect(top(frame(s, 0.9, { poke: 0.42 }))).toBeLessThan(top(rest) - 10);
      // it lands where it took off: just before the end, the body is all but back
      expect(apart(frame(s, 0.9, { poke: 0.995 }), rest)).toBeLessThan(2);
      expect(apart(frame(s, 0.9, { poke: 0.005 }), rest)).toBeLessThan(2);
    }
  });

  it('a reaction shows nothing at either end of its length, and all of it in between', () => {
    for (const dur of [0.8, ...Object.values(DEFAULT_DUR)]) {
      expect(envelope(0, dur)).toBe(0);
      expect(envelope(dur, dur)).toBe(0);
      expect(envelope(dur / 2, dur)).toBe(1);
    }
  });

  it('a reaction is the cycle at both ends, with no NaN in between, for every animation', () => {
    const s = state();
    const plain = toSvgString(frame(s, 3));
    for (const anim of ANIMS) {
      const dur = DEFAULT_DUR[anim];
      expect(toSvgString(frame(s, 3, { react: { anim, t: 0, dur } })), anim).toBe(plain);
      expect(toSvgString(frame(s, 3, { react: { anim, t: dur, dur } })), anim).toBe(plain);
      for (let t = 0.05; t < dur; t += 0.1) expect(toSvgString(frame(s, 3, { react: { anim, t, dur }, poke: t / dur }))).not.toMatch(/NaN|Infinity/);
    }
    // over the idle loop, the wink shuts the right eye into a line while it shows
    const idle = state({ cycle: [{ anim: 'idle', dur: 4.8 }] });
    const wink = frame(idle, 1, { react: { anim: 'wink', t: 0.4, dur: 0.8 }, gaze: [0, 0] });
    const open = frame(idle, 1, { gaze: [0, 0] });
    const height = (m: RenderModel, i: 0 | 1) => Math.max(...m.eyes[i].c.y) - Math.min(...m.eyes[i].c.y);
    expect(height(wink, 1)).toBeLessThan(height(open, 1) / 2);
  });

  it('the default reaction hops as it goes, and a still blob shows it as a pose, without the hop', () => {
    const s = state();
    expect(toSvgString(frame(s, 3, { react: { ...POKE, t: 0.336 } }))).toBe(toSvgString(frame(s, 3, { react: { anim: 'wink', dur: 0.8, t: 0.336 }, poke: 0.42 })));
    const pose = frame(s, 0, { still: true, react: { ...POKE, t: 0.4 } });
    expect(toSvgString(pose)).not.toBe(toSvgString(frame(s, 0, { still: true })));
    expect(toSvgString(pose)).toBe(toSvgString(frame(s, 5, { still: true, react: { anim: 'wink', dur: 0.8, t: 0.4 } })));
  });
});
