// What makes an avatar move on a page: one animation loop for every avatar, which
// draws only the ones on screen, and the eyes easing toward the cursor. drive()
// runs a LiveSvg inside a host element: <blob-avatar> uses it, and so can anything
// else that draws one.

import { DEFAULT_STATE, frame, loopLength, type BlobState } from '../engine';
import { gazeTarget, springGaze, type Gaze } from '../engine/gaze';
import type { LiveSvg } from '../render/svg';

export interface Options {
  state: BlobState;
  /** the eyes follow the cursor */
  gaze: boolean;
  /** holds still */
  paused: boolean;
}

export interface Driver {
  /** what it draws and how; the change shows right away */
  set(o: Partial<Options>): void;
  /** joins the loop: the host is on the page */
  start(): void;
  /** leaves the loop: the host left the page */
  stop(): void;
}

const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------------------------------------------------------------- the shared loop

/** an avatar in the loop: whether it is on screen, and a step that says whether it wants another frame */
interface Live {
  seen: boolean;
  step(dt: number): boolean;
}

const live = new Map<Element, Live>();
let running = false;
let last = 0;
let pointer: [number, number] | null = null;
let pointerNear = false;

function loop(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  let any = false;
  for (const a of live.values()) any = a.step(dt) || any;
  if (any) requestAnimationFrame(loop);
  else running = false;
}

function wake() {
  if (running || typeof requestAnimationFrame !== 'function') return;
  running = true;
  last = performance.now();
  requestAnimationFrame(loop);
}

const watcher = typeof IntersectionObserver === 'function'
  ? new IntersectionObserver((entries) => {
      for (const e of entries) {
        const a = live.get(e.target);
        if (a) a.seen = e.isIntersecting;
      }
      wake();
    })
  : null;

let listening = false;
function listen() {
  if (listening) return;
  listening = true;
  addEventListener('pointermove', (e: PointerEvent) => {
    pointer = [e.clientX, e.clientY];
    pointerNear = true;
    wake();
  }, { passive: true });
  document.addEventListener('pointerleave', () => {
    pointer = null;
    pointerNear = false;
  });
}

if (typeof document !== 'undefined') document.addEventListener('visibilitychange', wake);

// ---------------------------------------------------------------- one avatar

export function drive(host: HTMLElement, svg: LiveSvg): Driver {
  let o: Options = { state: DEFAULT_STATE, gaze: false, paused: false };
  let t = 0;
  let gaze: Gaze = [0, 0, 0, 0];
  const still = () => o.paused || reduced();
  const draw = () => svg.update(frame(o.state, t, still() ? { still: true } : pointerNear && o.gaze ? { gaze: [gaze[0], gaze[1]] } : {}));
  const me: Live = {
    // only the avatars on screen are drawn
    seen: !watcher,
    step(dt) {
      if (still() || !me.seen || document.hidden) return false;
      t = (t + dt) % (loopLength(o.state) || 2.4);
      // the eyes ease toward the cursor on a spring
      if (pointer && o.gaze) gaze = springGaze(gaze, gazeTarget(pointer[0], pointer[1], host.getBoundingClientRect(), innerWidth * 0.4, innerHeight * 0.4), dt);
      draw();
      return true;
    },
  };
  return {
    set(p) {
      o = { ...o, ...p };
      if (o.gaze) listen();
      draw();
      wake();
    },
    start() {
      live.set(host, me);
      watcher?.observe(host);
      wake();
    },
    stop() {
      live.delete(host);
      watcher?.unobserve(host);
    },
  };
}
