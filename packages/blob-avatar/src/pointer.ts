// Where the pointer is on the page, for eyes that follow it: one set of listeners
// for every avatar and the editor's stage. A mouse is looked at while it moves and
// for a while after it rests; a finger while it touches and a moment after it
// lifts; a pointer that leaves the page, or a page that loses focus, at once lets
// the eyes go back to wandering.

/** seconds a resting mouse keeps the eyes, and a lifted finger */
export const REST = 3;
export const LIFTED = 0.9;

interface Spot {
  x: number;
  y: number;
  /** when it last moved, or lifted (performance.now()) */
  at: number;
  touch: boolean;
  down: boolean;
}

export interface Pointer {
  /** where the pointer is (client pixels) while the eyes should look at it, or null */
  at(now?: number): [number, number] | null;
  /** removes the listeners */
  stop(): void;
}

type Win = Pick<Window, 'addEventListener' | 'removeEventListener'>;

/** watches the pointer on a window; `moved` runs on every move (to wake an animation loop) */
export function watchPointer(win: Win = window, moved: () => void = () => {}): Pointer {
  let spot: Spot | null = null;
  const clock = () => performance.now();
  const touchy = (e: PointerEvent) => e.pointerType === 'touch';
  const move = (e: PointerEvent) => {
    // a hovering finger does not exist: a touch counts while it is down
    if (touchy(e) && e.type === 'pointermove' && !spot?.down) return;
    spot = { x: e.clientX, y: e.clientY, at: clock(), touch: touchy(e), down: e.type === 'pointerdown' || (touchy(e) && !!spot?.down) };
    moved();
  };
  const lift = (e: PointerEvent) => {
    if (spot && touchy(e)) spot = { ...spot, at: clock(), down: false };
  };
  const out = (e: PointerEvent) => {
    // only a mouse leaving the window (a finger lifting is handled above)
    if (!e.relatedTarget && !touchy(e)) spot = null;
  };
  const leave = (e: Event) => {
    // the window's own blur, not a field's on its way through
    if (e.target === win) spot = null;
  };
  const on: [string, EventListener][] = [
    ['pointermove', move as EventListener],
    ['pointerdown', move as EventListener],
    ['pointerup', lift as EventListener],
    ['pointercancel', lift as EventListener],
    ['pointerout', out as EventListener],
    ['blur', leave],
  ];
  for (const [type, f] of on) win.addEventListener(type, f, { passive: true, capture: true });
  return {
    at(now = clock()) {
      if (!spot) return null;
      if (spot.touch ? !spot.down && now - spot.at > LIFTED * 1000 : now - spot.at > REST * 1000) return null;
      return [spot.x, spot.y];
    },
    stop() {
      for (const [type, f] of on) win.removeEventListener(type, f, { capture: true });
      spot = null;
    },
  };
}
