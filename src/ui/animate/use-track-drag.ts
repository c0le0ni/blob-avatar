// The track's gestures. A mouse picks a clip up as soon as it moves; a finger
// scrolls the track, and picks a clip up after holding still for 350 ms or from its
// grip. The right edge of the selected clip stretches it in tenths of a second.
// Near an edge the track scrolls by itself while something is held.

import { useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react';
import { clampDur } from '../cycles';
import { gestureKey } from '../history';
import { dropIndex, edgeSpeed, tOf } from './layout';

/** a finger held this long on a clip picks it up */
export const LONG_PRESS = 350;

export interface Drag {
  from: number;
  to: number;
  /** how far the clip has followed the pointer, in px */
  dx: number;
}

export interface Resize {
  i: number;
  dur: number;
}

interface Options {
  scroller: RefObject<HTMLDivElement | null>;
  durs: number[];
  pps: number;
  pad: number;
  /** a click or a tap on a clip */
  onPick: (i: number) => void;
  /** a clip is picked up */
  onLift: (i: number) => void;
  onDrop: (from: number, to: number) => void;
  /** every step of a stretch; the key makes the whole stretch one undo step */
  onResize: (i: number, dur: number, key: string) => void;
  /** a stretch begins (true) and ends (false): the scale holds still meanwhile */
  onResizing: (on: boolean) => void;
}

export function useTrackDrag(o: Options) {
  const [drag, setDrag] = useState<Drag | null>(null);
  const [resize, setResize] = useState<Resize | null>(null);
  // the handlers outlive a render: they read the latest values from here
  const live = useRef(o);
  live.current = o;

  /** a pointer's x on the track's content, scroll included */
  const contentX = (clientX: number) => {
    const sc = live.current.scroller.current!;
    return clientX - sc.getBoundingClientRect().left + sc.scrollLeft;
  };

  /** follow a pointer until it lets go, scrolling the track near its edges */
  function follow(id: number, onMove: (clientX: number) => void, onEnd: (ok: boolean) => void) {
    let lastX: number | null = null;
    let raf = 0;
    const tick = () => {
      const sc = live.current.scroller.current;
      if (sc && lastX !== null) {
        const r = sc.getBoundingClientRect();
        const v = edgeSpeed(lastX, r.left, r.right);
        const before = sc.scrollLeft;
        if (v) sc.scrollLeft += v;
        if (sc.scrollLeft !== before) onMove(lastX);
      }
      raf = requestAnimationFrame(tick);
    };
    const move = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      lastX = e.clientX;
      onMove(e.clientX);
    };
    const end = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      stop();
      onEnd(e.type === 'pointerup');
    };
    // a finger that picked something up must not scroll the page as well
    const block = (e: TouchEvent) => e.cancelable && e.preventDefault();
    const stop = () => {
      cancelAnimationFrame(raf);
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', end);
      removeEventListener('pointercancel', end);
      document.removeEventListener('touchmove', block);
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', end);
    addEventListener('pointercancel', end);
    document.addEventListener('touchmove', block, { passive: false });
    raf = requestAnimationFrame(tick);
  }

  /** press on a clip, or on its grip (which picks it up at once, even under a finger) */
  function onClipDown(e: ReactPointerEvent<HTMLElement>, i: number, grip = false) {
    if (e.button !== 0 || !live.current.scroller.current) return;
    if (grip) e.stopPropagation();
    const touch = e.pointerType === 'touch';
    const now = grip || !touch;
    const id = e.pointerId;
    const x0 = e.clientX;
    const y0 = e.clientY;
    const start = contentX(x0);
    // the track as it was when the clip was picked up
    const durs = [...live.current.durs];
    const { pps, pad } = live.current;
    let lifted = false;
    let current: Drag = { from: i, to: i, dx: 0 };

    const update = (clientX: number) => {
      const x = contentX(clientX);
      current = { from: i, to: dropIndex(durs, i, tOf(x, pps, pad)), dx: x - start };
      setDrag(current);
    };
    const lift = () => {
      if (lifted) return;
      lifted = true;
      clearTimeout(timer);
      removeEventListener('pointermove', pending);
      removeEventListener('pointerup', settle);
      removeEventListener('pointercancel', settle);
      live.current.onLift(i);
      if (touch) navigator.vibrate?.(8);
      update(x0);
      follow(id, update, (ok) => {
        setDrag(null);
        if (ok && current.to !== current.from) live.current.onDrop(current.from, current.to);
      });
    };
    // before it is picked up: a mouse lifts it by moving, a finger that moves is scrolling
    const pending = (ev: PointerEvent) => {
      if (ev.pointerId !== id) return;
      const d = Math.hypot(ev.clientX - x0, ev.clientY - y0);
      if (now ? d > 4 : d > 10) {
        if (now) lift();
        else settle(ev);
      }
    };
    const settle = (ev: PointerEvent) => {
      if (ev.pointerId !== id || lifted) return;
      clearTimeout(timer);
      removeEventListener('pointermove', pending);
      removeEventListener('pointerup', settle);
      removeEventListener('pointercancel', settle);
      if (ev.type === 'pointerup' && Math.hypot(ev.clientX - x0, ev.clientY - y0) <= 10) live.current.onPick(i);
    };
    const timer = window.setTimeout(() => !now && lift(), LONG_PRESS);
    addEventListener('pointermove', pending);
    addEventListener('pointerup', settle);
    addEventListener('pointercancel', settle);
    if (grip) lift();
  }

  /** press on the right edge of the selected clip: stretch it */
  function onEdgeDown(e: ReactPointerEvent<HTMLElement>, i: number) {
    if (e.button !== 0 || !live.current.scroller.current) return;
    e.stopPropagation();
    e.preventDefault();
    const start = contentX(e.clientX);
    const d0 = live.current.durs[i];
    // the scale is held for the whole stretch, so the edge stays under the pointer
    const pps = live.current.pps;
    const key = gestureKey('resize');
    live.current.onResizing(true);
    setResize({ i, dur: d0 });
    follow(
      e.pointerId,
      (clientX) => {
        const dur = clampDur(d0 + (contentX(clientX) - start) / pps);
        setResize({ i, dur });
        live.current.onResize(i, dur, key);
      },
      () => {
        setResize(null);
        live.current.onResizing(false);
      },
    );
  }

  return { drag, resize, onClipDown, onEdgeDown };
}
