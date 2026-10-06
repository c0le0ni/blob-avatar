// A small GIF89a encoder: a palette built from the frames (median cut), LZW
// compression and the file format. No dependencies; runs in a Worker.

/** pixels at or above this alpha are drawn; below it they are transparent */
const ALPHA_CUT = 128;
const bin = (r: number, g: number, b: number) => ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);

// ---------------------------------------------------------------- palette

/** colors seen in sample frames, in 15-bit bins */
export class Histogram {
  readonly count = new Float64Array(32768);
  readonly sum = new Float64Array(32768 * 3);
  add(rgba: Uint8Array | Uint8ClampedArray) {
    for (let i = 0; i < rgba.length; i += 4) {
      if (rgba[i + 3] < ALPHA_CUT) continue;
      const k = bin(rgba[i], rgba[i + 1], rgba[i + 2]);
      this.count[k]++;
      this.sum[k * 3] += rgba[i];
      this.sum[k * 3 + 1] += rgba[i + 1];
      this.sum[k * 3 + 2] += rgba[i + 2];
    }
  }
}

export interface Palette {
  /** 256 colors, rgb */
  rgb: Uint8Array;
  /** the index kept for transparent pixels (always 255) */
  clear: number;
  /** bin -> palette index, filled on demand */
  lookup: Int16Array;
  colors: number;
}

const channel = (k: number, c: number) => (k >> (10 - 5 * c)) & 31;

/** median cut over the bins: split the most spread box at its median until there are enough colors */
export function makePalette(h: Histogram, max = 255): Palette {
  const bins: number[] = [];
  for (let k = 0; k < 32768; k++) if (h.count[k] > 0) bins.push(k);
  type Box = { bins: number[]; pop: number; spread: number; axis: number };
  const box = (list: number[]): Box => {
    let pop = 0, spread = -1, axis = 0;
    const lo = [31, 31, 31], hi = [0, 0, 0];
    for (const k of list) {
      pop += h.count[k];
      for (let c = 0; c < 3; c++) {
        const v = channel(k, c);
        if (v < lo[c]) lo[c] = v;
        if (v > hi[c]) hi[c] = v;
      }
    }
    for (let c = 0; c < 3; c++) if (hi[c] - lo[c] > spread) [spread, axis] = [hi[c] - lo[c], c];
    return { bins: list, pop, spread, axis };
  };
  const boxes: Box[] = bins.length ? [box(bins)] : [];
  while (boxes.length < max) {
    // the box that most needs splitting: wide and well populated
    let best = -1, score = 0;
    boxes.forEach((b, i) => {
      const s = b.spread * Math.sqrt(b.pop);
      if (b.bins.length > 1 && s > score) [best, score] = [i, s];
    });
    if (best < 0) break;
    const b = boxes[best];
    const sorted = [...b.bins].sort((x, y) => channel(x, b.axis) - channel(y, b.axis));
    let acc = 0, cut = 1;
    for (let i = 0; i < sorted.length - 1; i++) {
      acc += h.count[sorted[i]];
      cut = i + 1;
      if (acc >= b.pop / 2) break;
    }
    boxes.splice(best, 1, box(sorted.slice(0, cut)), box(sorted.slice(cut)));
  }
  const rgb = new Uint8Array(768);
  boxes.forEach((b, i) => {
    let n = 0, r = 0, g = 0, bl = 0;
    for (const k of b.bins) {
      n += h.count[k];
      r += h.sum[k * 3];
      g += h.sum[k * 3 + 1];
      bl += h.sum[k * 3 + 2];
    }
    rgb[i * 3] = Math.round(r / n);
    rgb[i * 3 + 1] = Math.round(g / n);
    rgb[i * 3 + 2] = Math.round(bl / n);
  });
  return { rgb, clear: 255, lookup: new Int16Array(32768).fill(-1), colors: Math.max(1, boxes.length) };
}

function nearest(p: Palette, k: number): number {
  const r = (channel(k, 0) << 3) + 4, g = (channel(k, 1) << 3) + 4, b = (channel(k, 2) << 3) + 4;
  let best = 0, dist = Infinity;
  for (let i = 0; i < p.colors; i++) {
    const dr = r - p.rgb[i * 3], dg = g - p.rgb[i * 3 + 1], db = b - p.rgb[i * 3 + 2];
    // green counts most, blue least, close to how the eye weighs them
    const d = 2 * dr * dr + 4 * dg * dg + 3 * db * db;
    if (d < dist) [best, dist] = [i, d];
  }
  return best;
}

/** rgba pixels -> palette indices */
export function indexPixels(rgba: Uint8Array | Uint8ClampedArray, p: Palette, out = new Uint8Array(rgba.length / 4)): Uint8Array {
  for (let i = 0, j = 0; i < rgba.length; i += 4, j++) {
    if (rgba[i + 3] < ALPHA_CUT) {
      out[j] = p.clear;
      continue;
    }
    const k = bin(rgba[i], rgba[i + 1], rgba[i + 2]);
    let v = p.lookup[k];
    if (v < 0) v = p.lookup[k] = nearest(p, k);
    out[j] = v;
  }
  return out;
}

// ---------------------------------------------------------------- bytes

class Bytes {
  buf = new Uint8Array(1 << 16);
  n = 0;
  byte(v: number) {
    if (this.n === this.buf.length) {
      const next = new Uint8Array(this.buf.length * 2);
      next.set(this.buf);
      this.buf = next;
    }
    this.buf[this.n++] = v;
  }
  u16(v: number) {
    this.byte(v & 255);
    this.byte((v >> 8) & 255);
  }
  all(list: ArrayLike<number>) {
    for (let i = 0; i < list.length; i++) this.byte(list[i]);
  }
  text(s: string) {
    for (const c of s) this.byte(c.charCodeAt(0));
  }
  done = () => this.buf.slice(0, this.n);
}

// ---------------------------------------------------------------- LZW

/**
 * GIF's LZW: variable-width codes from minCode+1 up to 12 bits, packed
 * least-significant bit first. The dictionary lives in a hashed table whose
 * entries are stamped with a generation, so a clear is O(1).
 */
export function lzw(indices: Uint8Array, minCode = 8): Uint8Array {
  const out = new Bytes();
  const CLEAR = 1 << minCode, END = CLEAR + 1;
  const SIZE = 1 << 20; // 4096 prefixes x 256 symbols
  const codes = new Int16Array(SIZE);
  const stamp = new Uint32Array(SIZE);
  let gen = 1;
  let width = minCode + 1;
  let next = END + 1;
  let acc = 0, bits = 0;
  const emit = (code: number) => {
    acc |= code << bits;
    bits += width;
    while (bits >= 8) {
      out.byte(acc & 255);
      acc >>>= 8;
      bits -= 8;
    }
  };
  emit(CLEAR);
  if (indices.length === 0) {
    emit(END);
    if (bits > 0) out.byte(acc & 255);
    return out.done();
  }
  let prefix = indices[0];
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i];
    const key = (prefix << 8) | k;
    if (stamp[key] === gen) {
      prefix = codes[key];
      continue;
    }
    emit(prefix);
    if (next === 4096) {
      emit(CLEAR);
      gen++;
      width = minCode + 1;
      next = END + 1;
    } else {
      if (next >= 1 << width) width++;
      codes[key] = next++;
      stamp[key] = gen;
    }
    prefix = k;
  }
  emit(prefix);
  emit(END);
  if (bits > 0) out.byte(acc & 255);
  return out.done();
}

// ---------------------------------------------------------------- file

export interface FrameRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export class GifWriter {
  private b = new Bytes();
  constructor(
    readonly width: number,
    readonly height: number,
    palette: Uint8Array,
  ) {
    const b = this.b;
    b.text('GIF89a');
    b.u16(width);
    b.u16(height);
    b.byte(0xf7); // global color table, 8 bits per channel, 256 entries
    b.byte(0); // background color index
    b.byte(0); // square pixels
    const table = new Uint8Array(768);
    table.set(palette.subarray(0, 768));
    b.all(table);
    // loop forever
    b.byte(0x21); b.byte(0xff); b.byte(11);
    b.text('NETSCAPE2.0');
    b.byte(3); b.byte(1); b.u16(0); b.byte(0);
  }

  /**
   * one frame. disposal 1 keeps it under the next frame (for opaque GIFs that
   * only redraw what changed), 2 clears it (for transparent GIFs).
   */
  frame(indices: Uint8Array, delayCs: number, opt: { clear?: number; disposal?: 1 | 2; rect?: FrameRect } = {}) {
    const b = this.b;
    const r = opt.rect ?? { x: 0, y: 0, w: this.width, h: this.height };
    const hasClear = opt.clear !== undefined && opt.clear >= 0;
    b.byte(0x21); b.byte(0xf9); b.byte(4);
    b.byte(((opt.disposal ?? 1) << 2) | (hasClear ? 1 : 0));
    b.u16(Math.max(2, Math.round(delayCs)));
    b.byte(hasClear ? opt.clear! : 0);
    b.byte(0);
    b.byte(0x2c);
    b.u16(r.x); b.u16(r.y); b.u16(r.w); b.u16(r.h);
    b.byte(0); // no local color table, not interlaced
    b.byte(8);
    const data = lzw(indices, 8);
    for (let i = 0; i < data.length; i += 255) {
      const n = Math.min(255, data.length - i);
      b.byte(n);
      b.all(data.subarray(i, i + n));
    }
    b.byte(0);
  }

  finish(): Uint8Array {
    this.b.byte(0x3b);
    return this.b.done();
  }
}

/**
 * The part of `cur` that differs from `prev`, with unchanged pixels inside it set
 * to the clear index so they compress to almost nothing. Null when nothing changed.
 */
export function diffFrame(prev: Uint8Array, cur: Uint8Array, w: number, h: number, clear: number): { rect: FrameRect; indices: Uint8Array } | null {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      if (prev[row + x] === cur[row + x]) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) return null;
  const rect = { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  const indices = new Uint8Array(rect.w * rect.h);
  for (let y = 0; y < rect.h; y++) {
    for (let x = 0; x < rect.w; x++) {
      const i = (y + y0) * w + x + x0;
      indices[y * rect.w + x] = prev[i] === cur[i] ? clear : cur[i];
    }
  }
  return { rect, indices };
}
