// <blob-avatar>: the avatar on any page, from one script tag.
//
//   <script src="https://blob.coleoni.com/v2/embed.js" defer></script>
//   <blob-avatar shape="circle" color="#aefa0e" expression="happy"
//                animation="idle.2.4,wink.1.6" size="160" gaze></blob-avatar>
//
// Attributes are the keys of the share link (shape, color, expression, animation,
// seed), or `state` with a whole link hash. `gaze`
// makes it follow the cursor, `paused` holds it still. Works under a strict CSP:
// no inline styles, no eval. One animation loop drives every avatar on the page
// (driver.ts), and only the ones on screen are drawn.

import { DEFAULT_STATE } from '../engine';
import { fromHash, fromParams } from '../engine/codec';
import { LiveSvg } from '../render/svg';
import { drive, type Driver } from './driver';

const ATTRS = ['shape', 'color', 'expression', 'expr', 'animation', 'anim', 'seed', 'size', 'gaze', 'paused', 'state'];
const CSS = ':host{display:inline-block;width:160px;height:160px;line-height:0;vertical-align:middle}:host([hidden]){display:none}svg{width:100%;height:100%;overflow:visible}';

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

export class BlobAvatarElement extends HTMLElement {
  static observedAttributes = ATTRS;
  private declare driver: Driver;

  constructor() {
    super();
    const root = this.attachShadow({ mode: 'open' });
    styles(root);
    const svg = new LiveSvg(document);
    root.appendChild(svg.el);
    this.driver = drive(this, svg);
  }

  connectedCallback() {
    if (!this.hasAttribute('role')) this.setAttribute('role', 'img');
    if (!this.hasAttribute('aria-label') && !this.hasAttribute('aria-labelledby')) this.setAttribute('aria-label', 'Blob avatar');
    this.read();
    this.driver.start();
  }

  disconnectedCallback() {
    this.driver.stop();
  }

  attributeChangedCallback() {
    if (this.isConnected) this.read();
  }

  private read() {
    const base = this.getAttribute('state') ? fromHash(this.getAttribute('state')!) : DEFAULT_STATE;
    const size = Number(this.getAttribute('size'));
    if (size > 0 && size <= 4096) this.style.width = this.style.height = `${size}px`;
    this.driver.set({ state: fromParams((k) => this.getAttribute(k), base), gaze: this.hasAttribute('gaze'), paused: this.hasAttribute('paused') });
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('blob-avatar')) customElements.define('blob-avatar', BlobAvatarElement);
