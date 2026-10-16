import { describe, expect, it } from 'vitest';
import { clipAt, dropIndex, edgeSpeed, makeRoom, tOf } from '../src/ui/animate/layout';

describe('storyboard layout', () => {
  it('reads a pointer on the row as a place in cards', () => {
    expect(tOf(8 + 80 * 2.5, 80, 8)).toBeCloseTo(2.5, 9);
    // left of the first card is the first card
    expect(tOf(-30, 80, 8)).toBe(0);
  });

  it('finds the clip under a time', () => {
    const durs = [2, 1, 3];
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

  it('moves the other cards out of the way of a dragged one, and only those', () => {
    // 1 goes to 3: 2 and 3 step back
    expect([0, 1, 2, 3, 4].map((i) => makeRoom(i, 1, 3))).toEqual([0, 0, -1, -1, 0]);
    // 3 goes to 0: 0, 1 and 2 step forward
    expect([0, 1, 2, 3, 4].map((i) => makeRoom(i, 3, 0))).toEqual([1, 1, 1, 0, 0]);
    // held in place, nothing moves
    expect([0, 1, 2].map((i) => makeRoom(i, 1, 1))).toEqual([0, 0, 0]);
  });

  it('scrolls by itself near the edges, faster closer in', () => {
    expect(edgeSpeed(500, 0, 1000)).toBe(0);
    expect(edgeSpeed(30, 0, 1000)).toBeLessThan(0);
    expect(edgeSpeed(0, 0, 1000)).toBeLessThan(edgeSpeed(30, 0, 1000));
    expect(edgeSpeed(990, 0, 1000)).toBeGreaterThan(edgeSpeed(970, 0, 1000));
    expect(edgeSpeed(-200, 0, 1000)).toBe(-14);
  });
});
