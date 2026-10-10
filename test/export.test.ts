import { describe, expect, it } from 'vitest';
import { DEFAULT_STATE, cloneState } from 'blob-avatar/engine';
import { randomState } from 'blob-avatar/engine/codec';
import { diffFrame, GifWriter, Histogram, indexPixels, lzw, makePalette } from '../src/export/gif';
import { animatedSvg } from '../src/export/smil';

/** a plain GIF LZW decoder, written separately from the encoder to check it */
function unlzw(data: Uint8Array, minCode: number): number[] {
  const CLEAR = 1 << minCode, END = CLEAR + 1;
  let width = minCode + 1;
  let dict: number[][] = [];
  const reset = () => {
    dict = Array.from({ length: CLEAR + 2 }, (_, i) => [i]);
    width = minCode + 1;
  };
  reset();
  const out: number[] = [];
  let pos = 0;
  const read = () => {
    let v = 0;
    for (let i = 0; i < width; i++, pos++) if (data[pos >> 3] & (1 << (pos & 7))) v |= 1 << i;
    return v;
  };
  let prev: number[] | null = null;
  while (pos + width <= data.length * 8) {
    const code = read();
    if (code === CLEAR) {
      reset();
      prev = null;
      continue;
    }
    if (code === END) break;
    let entry: number[];
    if (code < dict.length) entry = dict[code];
    else if (prev && code === dict.length) entry = [...prev, prev[0]];
    else throw new Error(`bad code ${code}`);
    out.push(...entry);
    if (prev) dict.push([...prev, entry[0]]);
    prev = entry;
    if (dict.length === 1 << width && width < 12) width++;
  }
  return out;
}

const rng = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);

describe('gif', () => {
  it('LZW decodes back to the same indices (runs, noise and enough codes to force clears)', () => {
    const r = rng(9);
    const cases = [
      new Uint8Array(0),
      new Uint8Array(1),
      new Uint8Array(5000),
      Uint8Array.from({ length: 30000 }, () => Math.floor(r() * 255)),
      Uint8Array.from({ length: 60000 }, (_, i) => (i >> 5) % 7),
      Uint8Array.from({ length: 200 * 200 }, (_, i) => (Math.hypot((i % 200) - 100, Math.floor(i / 200) - 100) < 60 ? 3 : 255)),
    ];
    for (const c of cases) expect(unlzw(lzw(c, 8), 8)).toEqual([...c]);
  });

  it('writes a well-formed GIF89a whose first frame decodes to the input', () => {
    const w = 40, h = 30;
    const pal = new Uint8Array(768);
    pal.set([255, 0, 0, 0, 255, 0, 0, 0, 255]);
    const idx = Uint8Array.from({ length: w * h }, (_, i) => i % 3);
    const g = new GifWriter(w, h, pal);
    g.frame(idx, 5, { clear: 255, disposal: 2 });
    const bytes = g.finish();
    expect(String.fromCharCode(...bytes.slice(0, 6))).toBe('GIF89a');
    expect(bytes[6] | (bytes[7] << 8)).toBe(w);
    expect(bytes[8] | (bytes[9] << 8)).toBe(h);
    expect(bytes[bytes.length - 1]).toBe(0x3b);
    // walk to the image data: header 13 + palette 768 + loop extension 19 + control 8 + descriptor 10
    let p = 13 + 768 + 19;
    expect(bytes[p]).toBe(0x21);
    expect(bytes[p + 1]).toBe(0xf9);
    p += 8;
    expect(bytes[p]).toBe(0x2c);
    p += 10;
    const min = bytes[p++];
    const data: number[] = [];
    while (bytes[p]) {
      const n = bytes[p++];
      data.push(...bytes.slice(p, p + n));
      p += n;
    }
    expect(unlzw(Uint8Array.from(data), min)).toEqual([...idx]);
  });

  it('keeps exact colors when there are few, and cuts transparent pixels', () => {
    const colors = [[174, 250, 14], [17, 17, 17], [243, 238, 228]];
    const px = new Uint8Array(4 * 300);
    for (let i = 0; i < 300; i++) px.set([...colors[i % 3], i % 10 === 0 ? 0 : 255], i * 4);
    const hist = new Histogram();
    hist.add(px);
    const pal = makePalette(hist);
    const idx = indexPixels(px, pal);
    for (let i = 0; i < 300; i++) {
      if (i % 10 === 0) expect(idx[i]).toBe(pal.clear);
      else expect([...pal.rgb.slice(idx[i] * 3, idx[i] * 3 + 3)]).toEqual(colors[i % 3]);
    }
  });

  it('frame diff covers exactly what changed', () => {
    const a = new Uint8Array(100), b = new Uint8Array(100);
    expect(diffFrame(a, b, 10, 10, 255)).toBeNull();
    b[3 * 10 + 4] = 1;
    b[6 * 10 + 7] = 2;
    const d = diffFrame(a, b, 10, 10, 255)!;
    expect(d.rect).toEqual({ x: 4, y: 3, w: 4, h: 4 });
    expect(d.indices[0]).toBe(1);
    expect(d.indices[d.indices.length - 1]).toBe(2);
    expect(d.indices[1]).toBe(255);
  });
});

describe('animated svg', () => {
  const states = [cloneState(DEFAULT_STATE), randomState(5), randomState(77)];

  it('every keyframe of a path has the same commands, and the loop closes', () => {
    for (const s of states) {
      const svg = animatedSvg(s);
      const anims = [...svg.matchAll(/attributeName="d"[^>]*keyTimes="([^"]+)" values="([^"]+)"/g)];
      expect(anims.length).toBeGreaterThan(0);
      for (const [, kt, values] of anims) {
        const times = kt.split(';').map(Number);
        expect(times[0]).toBe(0);
        expect(times[times.length - 1]).toBe(1);
        for (let i = 1; i < times.length; i++) expect(times[i]).toBeGreaterThan(times[i - 1]);
        const frames = values.split(';');
        expect(frames.length).toBe(times.length);
        const commands = (d: string) => d.replace(/[^MCZmcz]/g, '');
        const count = (d: string) => (d.match(/-?(\d+\.?\d*|\.\d+)/g) ?? []).length;
        for (const f of frames) {
          expect(commands(f)).toBe(commands(frames[0]));
          expect(count(f)).toBe(count(frames[0]));
        }
        expect(frames[frames.length - 1]).toBe(frames[0]);
      }
      expect(svg).not.toMatch(/NaN|Infinity/);
    }
  });

  it('stays a reasonable size', () => {
    expect(animatedSvg({ ...cloneState(DEFAULT_STATE), cycle: [{ anim: 'idle', dur: 4.8 }] }).length).toBeLessThan(60_000);
  });
});
