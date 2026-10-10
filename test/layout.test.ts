import { describe, expect, it } from 'vitest';
import { DEFAULT_CYCLE } from '../src/engine';
import { LABEL_GAP, MIN_CHIP, ZOOMS, clipAt, dropAt, dropIndex, edgeSpeed, pxPerSec, startsOf, tOf, tickStep, ticks, xOf, zoomStep } from '../src/ui/animate/layout';

const all = DEFAULT_CYCLE.map((c) => c.dur);

describe('timeline layout', () => {
  it('fits the whole cycle in the width at zoom 1, and zooms from there', () => {
    const pps = pxPerSec(all, 900);
    expect(all.reduce((a, b) => a + b, 0) * pps).toBeCloseTo(900);
    expect(pxPerSec(all, 900, 2)).toBeCloseTo(pps * 2);
    // a zoom under 1 never shrinks it past what fits
    expect(pxPerSec(all, 900, 0.5)).toBeCloseTo(pps);
  });

  it(`never draws a clip narrower than ${MIN_CHIP}px, even when that makes the track scroll`, () => {
    for (const width of [120, 358, 600, 1200]) {
      for (const durs of [all, [0.4, 10, 10, 10], [0.4], Array.from({ length: 24 }, () => 0.4)]) {
        const pps = pxPerSec(durs, width);
        expect(Math.min(...durs) * pps).toBeGreaterThanOrEqual(MIN_CHIP - 1e-9);
      }
    }
    // a short cycle on a wide track just fits
    expect(pxPerSec([1, 2], 900)).toBe(300);
    // degenerate input still gives a usable scale
    expect(pxPerSec([], 900)).toBeGreaterThan(0);
    expect(pxPerSec([2], 0)).toBe(MIN_CHIP / 2);
  });

  it('maps a time to x and back', () => {
    for (const pps of [3.3, 28, 52.7, 400]) {
      for (const pad of [0, 8]) {
        for (const t of [0, 0.1, 1.6, 31.2, 240]) expect(tOf(xOf(t, pps, pad), pps, pad)).toBeCloseTo(t, 9);
      }
    }
    expect(xOf(2, 50, 8)).toBe(108);
    // left of 0 is 0
    expect(tOf(-30, 50, 8)).toBe(0);
  });

  it(`picks ruler steps whose labels are at least ${LABEL_GAP}px apart, and the finest that is`, () => {
    for (let pps = 1; pps < 600; pps *= 1.13) {
      const step = tickStep(pps);
      expect(step * pps).toBeGreaterThanOrEqual(LABEL_GAP);
      const finer = [0.5, 1, 2, 5, 10, 30, 60].filter((s) => s < step);
      for (const s of finer) expect(s * pps).toBeLessThan(LABEL_GAP);
    }
    expect(tickStep(52)).toBe(1);
    expect(tickStep(100)).toBe(0.5);
    expect(tickStep(20)).toBe(5);
  });

  it('lays out marks from 0 to the end, labelled every step, with short ones halfway', () => {
    const pps = 52;
    const marks = ticks(7.4, pps);
    expect(marks[0]).toEqual({ t: 0, label: true });
    expect(marks.filter((m) => m.label).map((m) => m.t)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(marks.filter((m) => !m.label).map((m) => m.t)).toEqual([0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5]);
    const labels = marks.filter((m) => m.label);
    for (let i = 1; i < labels.length; i++) expect((labels[i].t - labels[i - 1].t) * pps).toBeGreaterThanOrEqual(LABEL_GAP);
    // a long cycle on a narrow track still labels whole steps only
    expect(ticks(240, 3).filter((m) => m.label).every((m) => m.t % 30 === 0)).toBe(true);
  });

  it('finds the clip under a time', () => {
    const durs = [2, 1, 3];
    expect(startsOf(durs)).toEqual([0, 2, 3]);
    expect(clipAt(durs, 0)).toBe(0);
    expect(clipAt(durs, 1.99)).toBe(0);
    expect(clipAt(durs, 2)).toBe(1);
    expect(clipAt(durs, 5.9)).toBe(2);
    expect(clipAt(durs, 99)).toBe(2);
  });

  it('drops a dragged clip where the pointer passes the middle of the others', () => {
    const durs = [1, 1, 1, 1];
    // picked up and put back
    expect(dropIndex(durs, 0, 0.5)).toBe(0);
    expect(dropIndex(durs, 0, 1.4)).toBe(0);
    expect(dropIndex(durs, 0, 1.6)).toBe(1);
    expect(dropIndex(durs, 0, 3.9)).toBe(3);
    expect(dropIndex(durs, 3, 0.2)).toBe(0);
    expect(dropIndex(durs, 3, 99)).toBe(3);
    expect(dropIndex(durs, 2, -5)).toBe(0);
    // a wide neighbour is passed at its middle
    expect(dropIndex([6, 1], 1, 3.1)).toBe(1);
    expect(dropIndex([6, 1], 1, 2.9)).toBe(0);
    expect(dropIndex([6, 1], 1, 3.5)).toBe(1);
  });

  it('puts the drop line between the clips it lands between', () => {
    const durs = [1, 2, 3];
    // moving right lands after the clip it passes, moving left before it
    expect(dropAt(durs, 0, 1)).toBe(3);
    expect(dropAt(durs, 0, 2)).toBe(6);
    expect(dropAt(durs, 2, 0)).toBe(0);
    expect(dropAt(durs, 2, 1)).toBe(1);
    expect(dropAt(durs, 1, 1)).toBe(1);
  });

  it('scrolls by itself near the edges, faster closer in', () => {
    expect(edgeSpeed(500, 0, 1000)).toBe(0);
    expect(edgeSpeed(30, 0, 1000)).toBeLessThan(0);
    expect(edgeSpeed(0, 0, 1000)).toBeLessThan(edgeSpeed(30, 0, 1000));
    expect(edgeSpeed(990, 0, 1000)).toBeGreaterThan(edgeSpeed(970, 0, 1000));
    expect(edgeSpeed(-200, 0, 1000)).toBe(-14);
  });

  it('steps through the zoom levels and stops at both ends', () => {
    expect(zoomStep(1, 1)).toBe(1.5);
    expect(zoomStep(1, -1)).toBe(1);
    expect(zoomStep(ZOOMS[ZOOMS.length - 1], 1)).toBe(ZOOMS[ZOOMS.length - 1]);
    expect(zoomStep(2.5, -1)).toBe(2);
  });
});
