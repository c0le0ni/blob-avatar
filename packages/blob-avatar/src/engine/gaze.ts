// The eyes looking at a point (the cursor, a finger). Where the point is from the
// blob becomes a spot to look at, inside a circle the eyes can reach: straight
// ahead when the point is on the blob, toward the rim as it goes away. A spring with
// a little give carries the eyes there, so they lag, pass the spot a touch and
// settle; while the point rests they dart about it now and then, a long turn takes
// a blink, and a second, slower spring hands the head back to wandering when the
// point goes. The embed and the editor's stage share it, so the stage looks the way
// the embed will.

import { RADIUS, VIEW } from './frame';
import { hash } from './prng';

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** what the eyes do this frame: the spot they look at (-1..1, inside the unit circle) and how much it replaces wandering, 0..1 */
export interface Look {
  x: number;
  y: number;
  w: number;
}

/**
 * The spot to look at for a point (client pixels) and the box the blob is drawn in:
 * the point's direction from the blob's center, and a length that grows with its
 * distance and never quite reaches 1, so the eyes keep turning as the point goes
 * away and never pin to a corner.
 */
export function lookTarget(px: number, py: number, box: Box): [number, number] {
  const dx = px - box.left - box.width / 2, dy = py - box.top - box.height / 2;
  const d = Math.hypot(dx, dy);
  if (d < 1e-6) return [0, 0];
  // a little more than two bodies away is most of the turn; a small avatar still turns over a hand's width
  const body = (Math.min(box.width, box.height) * RADIUS) / VIEW;
  const k = Math.tanh(d / Math.max(2.4 * body, 110)) / d;
  return [dx * k, dy * k];
}

/** the eyes' spring: quick, with a little give (they pass the spot by about 4% and settle in a third of a second) */
const EYES = { k: 15 ** 2, c: 2 * 0.72 * 15 };
/** the hand-over between looking and wandering: in over about 0.4 s, out over about 0.8 s, never past */
const HAND_IN = { k: 10 ** 2, c: 2 * 10 };
const HAND_OUT = { k: 5 ** 2, c: 2 * 5 };
/** a turn this long (in spots) takes a blink, at most once in this many seconds, the blink this long */
const BLINK_TURN = 0.75, BLINK_GAP = 1.4, BLINK_DUR = 0.22;

/**
 * One blob's eyes on a point. step() moves them one frame toward a spot (null when
 * there is nothing to look at) and says what to draw; `open` is how open the eyes
 * are from the blink a long turn takes. `seed` picks the darts, so the same seed
 * and the same frames move the same way.
 */
export class Gaze {
  x = 0;
  y = 0;
  private vx = 0;
  private vy = 0;
  w = 0;
  private vw = 0;
  /** how open the eyes are, 0..1 */
  open = 1;
  /** the dart off the spot while the point rests, and the seconds until the next one */
  private dart: [number, number] = [0, 0];
  private next = 1.2;
  private darts = 0;
  /** the spot last frame, to tell a resting point from a moving one, and how long it has rested */
  private last: [number, number] | null = null;
  private rested = 0;
  /** seconds since the last turn's blink began */
  private blinked = BLINK_GAP;
  private seed: number;

  constructor(seed = 1) {
    this.seed = seed;
  }

  step(target: readonly [number, number] | null, dt: number): Look | null {
    if (dt <= 0) return this.look();
    this.blinked += dt;
    let tx = 0, ty = 0;
    if (target) {
      const moved = !this.last || Math.hypot(target[0] - this.last[0], target[1] - this.last[1]) > 0.004;
      // a long turn toward somewhere new blinks on the way, as eyes do
      if (moved && this.w > 0.5 && this.blinked >= BLINK_GAP && Math.hypot(target[0] - this.x, target[1] - this.y) > BLINK_TURN) this.blinked = 0;
      this.rested = moved ? 0 : this.rested + dt;
      this.last = [target[0], target[1]];
      this.darting(dt, moved);
      [tx, ty] = [target[0] + this.dart[0], target[1] + this.dart[1]];
      // the darts never take the spot out of reach
      const r = Math.hypot(tx, ty);
      if (r > 0.98) [tx, ty] = [(tx / r) * 0.98, (ty / r) * 0.98];
    } else {
      this.last = null;
      this.dart = [0, 0];
      this.rested = 0;
    }
    // small steps, so a slow frame never throws the springs
    const n = Math.ceil(dt / (1 / 120));
    const h = dt / n;
    const hand = target ? HAND_IN : HAND_OUT;
    for (let i = 0; i < n; i++) {
      this.vx += ((tx - this.x) * EYES.k - EYES.c * this.vx) * h;
      this.vy += ((ty - this.y) * EYES.k - EYES.c * this.vy) * h;
      this.x += this.vx * h;
      this.y += this.vy * h;
      this.vw += (((target ? 1 : 0) - this.w) * hand.k - hand.c * this.vw) * h;
      this.w = Math.min(1, Math.max(0, this.w + this.vw * h));
    }
    const u = this.blinked / BLINK_DUR;
    this.open = u < 1 ? 1 - 0.6 * Math.sin(Math.PI * u) ** 1.2 : 1;
    // nothing to look at and fully handed back: the head wanders on its own
    if (!target && this.w < 0.001) {
      [this.x, this.y, this.vx, this.vy, this.w, this.vw] = [0, 0, 0, 0, 0, 0];
      return null;
    }
    return this.look();
  }

  private look(): Look | null {
    return this.w > 0 ? { x: this.x, y: this.y, w: this.w } : null;
  }

  /** while the point rests, the eyes dart a little about it and back, every second or two; a moving point has their full attention */
  private darting(dt: number, moved: boolean) {
    if (moved || this.rested < 0.4) {
      this.dart = [0, 0];
      this.next = 0.5 + hash(this.seed, this.darts * 3) * 1.2;
      return;
    }
    if ((this.next -= dt) > 0) return;
    this.darts++;
    const away = this.dart[0] === 0 && this.dart[1] === 0;
    const a = hash(this.seed, this.darts * 3 + 1) * Math.PI * 2;
    const r = 0.05 + hash(this.seed, this.darts * 3 + 2) * 0.06;
    this.dart = away ? [Math.cos(a) * r, Math.sin(a) * r * 0.7] : [0, 0];
    this.next = (away ? 0.35 : 0.9) + hash(this.seed, this.darts * 3) * 1.4;
  }
}
