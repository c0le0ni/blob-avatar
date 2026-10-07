// <blob-avatar>: the avatar on any page, from one script tag.
//
//   <script src="https://blob.coleoni.com/embed.js" defer></script>
//   <blob-avatar shape="circle" color="#aefa0e" expression="happy"
//                animation="idle.2.4,wink.1.6" size="160" gaze></blob-avatar>
//
// Attributes are the keys of the share link (shape, color, expression, animation,
// seed), or `state` with a whole link hash. `gaze`
// makes it follow the cursor, `paused` holds it still. Works under a strict CSP:
// no inline styles, no eval. One animation loop drives every avatar on the page,
// and only the ones on screen are drawn.

import { DEFAULT_STATE, frame, loopLength, type BlobState } from '../engine';
import { fromHash, fromParams } from '../engine/codec';
import { LiveSvg } from '../render/svg';

const ATTRS = ['shape', 'color', 'expression', 'expr', 'animation', 'anim', 'seed', 'size', 'gaze', 'paused', 'state'];
const CSS = ':host{display:inline-block;width:160px;height:160px;line-height:0;vertical-align:middle}:host([hidden]){display:none}svg{width:100%;height:100%;overflow:visible}';
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

let sheet: CSSStyleSheet | null = null;
function styles(root: ShadowRoot) {
  // a constructed sheet is not an inline style, so a strict CSP allows it
  try {
    if (!sheet) {
      sheet = new CSSStyleSheet();
      sheet.replaceSync(CSS);
    }
    root.adoptedStyleSheets = [sheet];
  } catch {
    const s = document.createElement('style');
    s.textContent = CSS;
    root.appendChild(s);
  }
}

// ---------------------------------------------------------------- the shared loop

const live = new Set<BlobAvatarElement>();
let running = false;
let last = 0;
let pointer: [number, number] | null = null;
let pointerNear = false;

function loop(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  let any = false;
  for (const el of live) any = el.step(dt) || any;
  if (any) requestAnimationFrame(loop);
  else running = false;
}

function wake() {
  if (running || typeof requestAnimationFrame !== 'function') return;
  running = true;
  last = performance.now();
  requestAnimationFrame(loop);
}

const seen = typeof IntersectionObserver === 'function'
  ? new IntersectionObserver((entries) => {
      for (const e of entries) (e.target as BlobAvatarElement).onScreen = e.isIntersecting;
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

// ---------------------------------------------------------------- the element

export class BlobAvatarElement extends HTMLElement {
  static observedAttributes = ATTRS;
  onScreen = !seen;
  private svg: LiveSvg;
  private state: BlobState = DEFAULT_STATE;
  private t = 0;
  private gaze = { x: 0, y: 0, vx: 0, vy: 0 };

  constructor() {
    super();
    const root = this.attachShadow({ mode: 'open' });
    styles(root);
    this.svg = new LiveSvg(document);
    root.appendChild(this.svg.el);
  }

  connectedCallback() {
    if (!this.hasAttribute('role')) this.setAttribute('role', 'img');
    if (!this.hasAttribute('aria-label') && !this.hasAttribute('aria-labelledby')) this.setAttribute('aria-label', 'Blob avatar');
    this.read();
    this.draw();
    live.add(this);
    seen?.observe(this);
    if (this.hasAttribute('gaze')) listen();
    wake();
  }

  disconnectedCallback() {
    live.delete(this);
    seen?.unobserve(this);
  }

  attributeChangedCallback() {
    if (!this.isConnected) return;
    this.read();
    if (this.hasAttribute('gaze')) listen();
    this.draw();
    wake();
  }

  private read() {
    const base = this.getAttribute('state') ? fromHash(this.getAttribute('state')!) : DEFAULT_STATE;
    this.state = fromParams((k) => this.getAttribute(k), base);
    const size = Number(this.getAttribute('size'));
    if (size > 0 && size <= 4096) this.style.width = this.style.height = `${size}px`;
  }

  private still() {
    return this.hasAttribute('paused') || reduced();
  }

  private draw() {
    const still = this.still();
    const follow = pointerNear && this.hasAttribute('gaze');
    this.svg.update(frame(this.state, this.t, still ? { still: true } : follow ? { gaze: [this.gaze.x, this.gaze.y] } : {}));
  }

  /** advance one frame; returns whether it wants more frames */
  step(dt: number): boolean {
    if (this.still() || !this.onScreen || document.hidden) return false;
    const L = loopLength(this.state) || 2.4;
    this.t = (this.t + dt) % L;
    if (pointer && this.hasAttribute('gaze')) {
      const r = this.getBoundingClientRect();
      const k = (v: number) => Math.max(-1, Math.min(1, v));
      const target = [k((pointer[0] - r.left - r.width / 2) / (innerWidth * 0.4)), k((pointer[1] - r.top - r.height / 2) / (innerHeight * 0.4))];
      // the eyes ease toward the cursor on a spring
      const w = 12, g = this.gaze;
      g.vx += ((target[0] - g.x) * w * w - 2 * w * g.vx) * dt;
      g.vy += ((target[1] - g.y) * w * w - 2 * w * g.vy) * dt;
      g.x += g.vx * dt;
      g.y += g.vy * dt;
    }
    this.draw();
    return true;
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('blob-avatar')) customElements.define('blob-avatar', BlobAvatarElement);
