// The stage's clock and drawing, outside React: one requestAnimationFrame loop that
// draws the blob into a live SVG, morphs from what was on screen when the look
// changes, and tells the timeline where the playhead is. React only hands it the
// state and the mode.

import { IDLE_CYCLE, frame, loopLength, mixModels, type BlobState, type FrameInput, type RenderModel } from '../engine';
import { LiveSvg } from '../render/svg';

export type Mode = 'customize' | 'animate';

/** seconds a change of shape, face or color takes to morph */
const MORPH = 0.32;

type Listener = (t: number, length: number, playing: boolean) => void;

export class Player {
  readonly svg = new LiveSvg();
  private state: BlobState;
  private mode: Mode = 'customize';
  private t = 0;
  private last = 0;
  private raf = 0;
  private playing = true;
  private shown: RenderModel | null = null;
  private from: RenderModel | null = null;
  private fromAt = 0;
  private listeners = new Set<Listener>();
  private extras: ((now: number) => void)[] = [];
  /** the intro drives the eyes for its first second and a half */
  input: FrameInput = {};
  readonly reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  constructor(state: BlobState) {
    this.state = state;
  }

  /** what the stage plays: the cycle while animating, breathing and glances otherwise */
  private get playable(): BlobState {
    return this.mode === 'animate' ? this.state : { ...this.state, cycle: IDLE_CYCLE };
  }

  get length() {
    return loopLength(this.playable) || 2.4;
  }

  get time() {
    return this.t;
  }

  get isPlaying() {
    return this.playing && !this.reduced;
  }

  start() {
    if (this.raf) return;
    this.last = performance.now();
    const loop = (now: number) => {
      this.draw(now);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  /** something else that moves with the stage (the wordmark's o) */
  also(f: (now: number) => void) {
    this.extras.push(f);
  }

  subscribe(f: Listener) {
    this.listeners.add(f);
    f(this.t, this.length, this.isPlaying);
    return () => void this.listeners.delete(f);
  }

  private morph() {
    if (this.shown && !this.reduced) {
      this.from = this.shown;
      this.fromAt = performance.now();
    }
  }

  /** morph from what is on screen to whatever comes next (the end of the intro) */
  blend() {
    this.morph();
  }

  setState(next: BlobState) {
    if (next === this.state) return;
    const prev = this.state;
    // a new look or a new order of animations morphs; a clip's length changing does not
    const order = (s: BlobState) => s.cycle.map((c) => c.anim).join();
    if (prev.shape !== next.shape || prev.color !== next.color || prev.expression !== next.expression || order(prev) !== order(next)) this.morph();
    this.state = next;
    if (this.t > this.length) this.t %= this.length;
    this.redrawIfStill();
  }

  setMode(mode: Mode) {
    if (mode === this.mode) return;
    // the stage switches between the idle loop and the cycle: both start from the top
    this.morph();
    this.mode = mode;
    this.t = 0;
    this.redrawIfStill();
  }

  seek(t: number) {
    this.t = Math.max(0, Math.min(this.length - 1e-3, t));
    this.redrawIfStill(true);
  }

  setPlaying(on: boolean) {
    this.playing = on;
    this.redrawIfStill(true);
  }

  private redrawIfStill(force = false) {
    if (!this.raf || this.reduced || (force && !this.playing)) this.draw(performance.now(), true);
  }

  private draw(now: number, still = false) {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const s = this.playable;
    const L = this.length;
    if (!still && this.isPlaying) this.t += dt;
    if (this.t >= L) this.t %= L;
    let m = frame(s, this.t, this.reduced ? { still: true } : this.input);
    if (this.from) {
      const u = Math.min(1, (now - this.fromAt) / 1000 / MORPH);
      m = mixModels(this.from, m, 1 - (1 - u) ** 3);
      if (u >= 1) this.from = null;
    }
    this.svg.update(m);
    this.shown = m;
    if (!this.reduced) for (const f of this.extras) f(now);
    for (const f of this.listeners) f(this.t, L, this.isPlaying);
  }
}
