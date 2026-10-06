// Encodes a GIF off the main thread. The page sends sample frames (for the
// palette), then every frame in order; each frame is acknowledged so the page
// never queues more than a few.

import { diffFrame, GifWriter, Histogram, indexPixels, makePalette, type FrameRect, type Palette } from './gif';

type Msg =
  | { type: 'init'; size: number; delay: number; transparent: boolean }
  | { type: 'sample'; buf: ArrayBuffer }
  | { type: 'frame'; buf: ArrayBuffer }
  | { type: 'end' };

interface Held {
  indices: Uint8Array;
  disposal: 1 | 2;
  rect?: FrameRect;
}

let size = 0, delay = 5, transparent = false;
let hist = new Histogram();
let pal: Palette | null = null;
let gif: GifWriter | null = null;
let prev: Uint8Array | null = null;
// a frame is written only when the next different one arrives, so a frame that
// does not change just stays on screen longer
let held: Held | null = null;
let heldDelay = 0;

const post = (m: unknown, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage(m, transfer);

function flush() {
  if (held && gif && pal) gif.frame(held.indices, heldDelay, { clear: pal.clear, disposal: held.disposal, rect: held.rect });
  held = null;
}

self.onmessage = (e: MessageEvent<Msg>) => {
  const m = e.data;
  if (m.type === 'init') {
    ({ size, delay, transparent } = m);
    hist = new Histogram();
    pal = gif = prev = held = null;
  } else if (m.type === 'sample') {
    hist.add(new Uint8Array(m.buf));
  } else if (m.type === 'frame') {
    if (!pal || !gif) {
      pal = makePalette(hist, 255);
      gif = new GifWriter(size, size, pal.rgb);
    }
    const cur = indexPixels(new Uint8Array(m.buf), pal);
    const d = prev ? diffFrame(prev, cur, size, size, pal.clear) : null;
    let next: Held | null = null;
    // transparent GIFs redraw the whole frame and clear it after; opaque ones only redraw what moved
    if (!prev || (d && transparent)) next = { indices: cur, disposal: transparent ? 2 : 1 };
    else if (d) next = { indices: d.indices, disposal: 1, rect: d.rect };
    if (next) {
      flush();
      held = next;
      heldDelay = delay;
    } else heldDelay += delay;
    prev = cur;
    post({ type: 'ack' });
  } else if (m.type === 'end') {
    flush();
    const bytes = gif ? gif.finish() : new Uint8Array();
    post({ type: 'done', buf: bytes.buffer }, [bytes.buffer]);
  }
};
