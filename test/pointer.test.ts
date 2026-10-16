import { afterEach, describe, expect, it, vi } from 'vitest';
import { LIFTED, REST, watchPointer } from 'blob-avatar/pointer';

/** a pointer event as the listeners read it */
const ev = (type: string, x: number, y: number, pointerType = 'mouse', relatedTarget: object | null = null) => Object.assign(new Event(type), { clientX: x, clientY: y, pointerType, relatedTarget });

describe('the pointer the eyes follow', () => {
  let clock = 1000;
  vi.spyOn(performance, 'now').mockImplementation(() => clock);
  afterEach(() => void (clock = 1000));

  it('a mouse: while it moves and for a while after it rests; leaving the window or the page losing focus lets go at once', () => {
    const win = new EventTarget();
    let woke = 0;
    const p = watchPointer(win as never, () => woke++);
    expect(p.at()).toBeNull();
    win.dispatchEvent(ev('pointermove', 40, 60));
    expect(p.at()).toEqual([40, 60]);
    expect(woke).toBe(1);
    clock += REST * 1000 - 1;
    expect(p.at()).toEqual([40, 60]);
    clock += 2;
    expect(p.at()).toBeNull();
    win.dispatchEvent(ev('pointermove', 50, 60));
    win.dispatchEvent(ev('pointerout', 50, 60, 'mouse', {}));
    expect(p.at()).toEqual([50, 60]);
    win.dispatchEvent(ev('pointerout', 50, 60));
    expect(p.at()).toBeNull();
    win.dispatchEvent(ev('pointermove', 50, 60));
    win.dispatchEvent(new Event('blur'));
    expect(p.at()).toBeNull();
    p.stop();
    win.dispatchEvent(ev('pointermove', 70, 80));
    expect(p.at()).toBeNull();
  });

  it('a finger: while it touches, and a moment after it lifts or the page takes the scroll', () => {
    const win = new EventTarget();
    const p = watchPointer(win as never);
    win.dispatchEvent(ev('pointermove', 10, 10, 'touch'));
    expect(p.at()).toBeNull();
    win.dispatchEvent(ev('pointerdown', 10, 20, 'touch'));
    clock += 10_000;
    expect(p.at()).toEqual([10, 20]);
    win.dispatchEvent(ev('pointermove', 30, 20, 'touch'));
    win.dispatchEvent(ev('pointerup', 30, 20, 'touch'));
    // the pointerout a lifted finger sends is not a mouse leaving
    win.dispatchEvent(ev('pointerout', 30, 20, 'touch'));
    clock += LIFTED * 1000 - 1;
    expect(p.at()).toEqual([30, 20]);
    clock += 2;
    expect(p.at()).toBeNull();
    win.dispatchEvent(ev('pointerdown', 5, 5, 'touch'));
    win.dispatchEvent(ev('pointercancel', 5, 5, 'touch'));
    clock += LIFTED * 1000 + 1;
    expect(p.at()).toBeNull();
  });
});
