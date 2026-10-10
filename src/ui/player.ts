// The stage's clock and drawing, outside React: one requestAnimationFrame loop that
// draws the blob into a live SVG, morphs from what was on screen when the look
// changes, and tells the timeline where the playhead is. React only hands it the
// state, the mode and the settings (follow the cursor, hold still).
//
// A still stage (reduced motion, or the setting) holds the rest pose in Customize.
// In Animate it shows the real pose wherever the playhead is, starts paused, and
// plays when someone asks: pressing Play is a request for motion.

import { IDLE_CYCLE, frame, loopLength, mixModels, type BlobState, type Clip, type FrameInput, type RenderModel } from '../engine';
import { gazeTarget, springGaze, type Gaze } from '../engine/gaze';
import { LiveSvg } from '../render/svg';

export type Mode = 'customize' | 'animate';

/** seconds a change of shape, face or color takes to morph */
const MORPH = 0.32;

/** the breath after an auditioned animation, before it comes round again */
const AUDITION_REST = 0.9;

type Listener = (t: number, length: number, playing: boolean) => void;

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export class Player {
  readonly svg = new LiveSvg();
  private state: BlobState;
  private mode: Mode = 'customize';
  private t = 0;
  private last = 0;
  private raf = 0;
  private playing: boolean;
  private shown: RenderModel | null = null;
  private from: RenderModel | null = null;
  private fromAt = 0;
  private listeners = new Set<Listener>();
  private watchers = new Set<() => void>();
  private extras: ((now: number) => void)[] = [];
  /** the intro drives the eyes while it runs (its first second and a half), then lets go with null */
  input: FrameInput | null = null;
  private holding: boolean;
  private follow = false;
  private pointer: [number, number] | null = null;
  private gaze: Gaze = [0, 0, 0, 0];
  /** the part of the cycle that plays over and over (a looped clip), or all of it */
  private range: [number, number] | null = null;
  /** an animation on its own, playing in place of the cycle, and its own clock */
  private trial: { clip: Clip; t: number } | null = null;
  /** whether it was playing when the playhead was picked up */
  private scrubbedFrom: boolean | null = null;

  constructor(state: BlobState, still = reducedMotion()) {
    this.state = state;
    this.holding = still;
    // the setting follows reduced motion unless the person chose otherwise
    this.playing = !still;
  }

  /** the stage holds the rest pose: no motion, no morphs */
  get still() {
    return this.holding;
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

  /** whether the cycle (or the idle loop) is moving: an audition holds it where it was */
  get isPlaying() {
    return this.playing && !this.trial && (this.mode === 'animate' || !this.holding);
  }

  /** the animation playing on its own, if any */
  get auditioning(): Clip | null {
    return this.trial?.clip ?? null;
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

  /** every frame: where the playhead is, the cycle's length, and whether it plays */
  subscribe(f: Listener) {
    this.listeners.add(f);
    f(this.t, this.length, this.isPlaying);
    return () => void this.listeners.delete(f);
  }

  /** a change in what the stage is doing (an audition starting or ending), for React */
  watch = (f: () => void) => {
    this.watchers.add(f);
    return () => void this.watchers.delete(f);
  };

  private changed() {
    this.watchers.forEach((f) => f());
  }

  private morph() {
    if (this.shown && !this.holding) {
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
    if (prev.shape !== next.shape || prev.color !== next.color || prev.expression !== next.expression || (!this.trial && order(prev) !== order(next))) this.morph();
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
    this.range = null;
    this.scrubbedFrom = null;
    if (this.trial) {
      this.trial = null;
      this.changed();
    }
    // a still stage opens the cycle paused, on its first pose; Customize breathes again
    if (this.holding) this.playing = false;
    else if (mode === 'customize') this.playing = true;
    this.redrawIfStill(true);
  }

  seek(t: number) {
    this.t = Math.max(0, Math.min(this.length - 1e-3, t));
    this.redrawIfStill(true);
  }

  /** play or pause the cycle; playing it ends an audition */
  setPlaying(on: boolean) {
    this.playing = on;
    this.scrubbedFrom = null;
    if (on && this.trial) {
      this.trial = null;
      this.morph();
      this.changed();
    }
    this.redrawIfStill(true);
  }

  /** the playhead is being dragged: the cycle pauses, and plays again after if it was playing */
  scrub(on: boolean) {
    if (on) {
      if (this.scrubbedFrom === null) this.scrubbedFrom = this.playing;
      this.playing = false;
    } else if (this.scrubbedFrom !== null) {
      this.playing = this.scrubbedFrom;
      this.scrubbedFrom = null;
    }
  }

  /** play only [start, end) of the cycle, over and over (a looped clip); null plays all of it */
  setRange(range: [number, number] | null) {
    this.range = range && range[1] - range[0] > 0.05 ? range : null;
    if (this.range && (this.t < this.range[0] || this.t >= this.range[1])) this.seek(this.range[0]);
  }

  /** one animation on its own, over and over in place of the cycle; null goes back to the cycle */
  audition(clip: Clip | null) {
    const was = this.trial?.clip;
    if (!clip && !was) return;
    if (clip && was && clip.anim === was.anim && clip.dur === was.dur) return;
    this.morph();
    this.trial = clip ? { clip: { ...clip }, t: 0 } : null;
    this.changed();
    this.redrawIfStill(true);
  }

  setStill(on: boolean) {
    if (on === this.holding) return;
    this.holding = on;
    this.from = null;
    // holding still pauses; letting go plays again
    this.playing = !on;
    this.redrawIfStill(true);
  }

  private onMove = (e: PointerEvent) => {
    this.pointer = [e.clientX, e.clientY];
  };

  private onOut = (e: PointerEvent) => {
    // the pointer left the page: the eyes go back to wandering
    if (e.relatedTarget || !this.pointer) return;
    this.pointer = null;
    this.morph();
  };

  /** the eyes follow the pointer, as the embed does with its gaze attribute */
  setFollow(on: boolean) {
    if (on === this.follow) return;
    this.follow = on;
    if (on) {
      addEventListener('pointermove', this.onMove, { passive: true });
      addEventListener('pointerout', this.onOut);
    } else {
      removeEventListener('pointermove', this.onMove);
      removeEventListener('pointerout', this.onOut);
      if (this.pointer) this.morph();
      this.pointer = null;
    }
  }

  private redrawIfStill(force = false) {
    if (!this.raf || this.holding || (force && !this.playing)) this.draw(performance.now(), true);
  }

  /** the stage shows the rest pose: a still stage, outside Animate and with nothing auditioned */
  private get rest() {
    return this.holding && this.mode === 'customize' && !this.trial;
  }

  /** what drives the eyes this frame: the rest pose, the intro, the pointer, or nothing (they wander) */
  private inputAt(dt: number): FrameInput {
    if (this.rest) return { still: true };
    if (this.input) return this.input;
    if (!this.follow || !this.pointer) return {};
    // normalized to the stage, and eased on the embed's spring
    const r = this.svg.el.getBoundingClientRect();
    if (!r.width) return {};
    this.gaze = springGaze(this.gaze, gazeTarget(this.pointer[0], this.pointer[1], r, r.width, r.height), dt);
    return { gaze: [this.gaze[0], this.gaze[1]] };
  }

  private draw(now: number, still = false) {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const L = this.length;
    if (!still && this.isPlaying) this.t += dt;
    if (this.range && this.isPlaying && (this.t >= this.range[1] || this.t < this.range[0])) this.t = this.range[0];
    if (this.t >= L) this.t %= L;
    let m: RenderModel;
    if (this.trial) {
      // an audition plays even on a still stage: someone asked to see it
      const s: BlobState = { ...this.state, cycle: [this.trial.clip, { anim: 'idle', dur: AUDITION_REST }] };
      if (!still) this.trial.t = (this.trial.t + dt) % loopLength(s);
      m = frame(s, this.trial.t, this.inputAt(dt));
    } else m = frame(this.playable, this.t, this.inputAt(dt));
    if (this.from) {
      const u = Math.min(1, (now - this.fromAt) / 1000 / MORPH);
      m = mixModels(this.from, m, 1 - (1 - u) ** 3);
      if (u >= 1) this.from = null;
    }
    this.svg.update(m);
    this.shown = m;
    if (!this.holding) for (const f of this.extras) f(now);
    for (const f of this.listeners) f(this.t, L, this.isPlaying);
  }
}
