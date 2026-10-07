// Getting the avatar out: files to download and things to copy.

import { frame, loopLength, type BlobState } from '../engine';
import { drawModel } from '../render/canvas';
import { toSvgString } from '../render/svg';
import { animatedSvg } from './smil';

export interface ExportOptions {
  /** PNG and GIF size in pixels */
  size: number;
  /** a solid background, or none (transparent) */
  bg: string | null;
  /** clip to a circle */
  round: boolean;
}

const name = (s: BlobState, ext: string) => `blob-${s.shape}-${s.color.slice(1)}.${ext}`;

function save(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** the rest pose: what a still picture shows */
const still = (s: BlobState) => frame(s, 0, { still: true });

function canvasOf(px: number) {
  const c = document.createElement('canvas');
  c.width = c.height = px;
  return c;
}

function pngBlob(s: BlobState, o: ExportOptions): Promise<Blob> {
  const c = canvasOf(o.size);
  drawModel(c.getContext('2d')!, still(s), o.size, o);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('png'))), 'image/png'));
}

export async function downloadPng(s: BlobState, o: ExportOptions) {
  save(await pngBlob(s, o), name(s, 'png'));
}

export async function copyPng(s: BlobState, o: ExportOptions): Promise<boolean> {
  try {
    // Safari wants the promise handed to ClipboardItem right away
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob(s, o) })]);
    return true;
  } catch {
    return false;
  }
}

const svgText = (s: BlobState, o: ExportOptions) => toSvgString(still(s), { size: 512, bg: o.bg, round: o.round });

export function downloadSvg(s: BlobState, o: ExportOptions) {
  save(new Blob([svgText(s, o)], { type: 'image/svg+xml' }), name(s, 'svg'));
}

export async function copySvg(s: BlobState, o: ExportOptions): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(svgText(s, o));
    return true;
  } catch {
    return false;
  }
}

export async function downloadAnimatedSvg(s: BlobState, o: ExportOptions) {
  // let the menu show its busy state before the work starts
  await new Promise((r) => setTimeout(r, 30));
  save(new Blob([animatedSvg(s, { bg: o.bg, round: o.round })], { type: 'image/svg+xml' }), name(s, 'animated.svg'));
}

/** 20 frames a second, drawn here and encoded in a worker */
export async function downloadGif(s: BlobState, o: ExportOptions, onProgress?: (p: number) => void) {
  const px = Math.min(512, o.size);
  const L = loopLength(s) || 2.4;
  const n = Math.max(2, Math.round(L / 0.05));
  const c = canvasOf(px);
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  const worker = new Worker(new URL('./gif.worker.ts', import.meta.url), { type: 'module' });
  const pixels = (t: number) => {
    drawModel(ctx, frame(s, t), px, o);
    return ctx.getImageData(0, 0, px, px).data.buffer;
  };
  let acks = 0;
  let waiting: (() => void) | null = null;
  const done = new Promise<ArrayBuffer>((resolve, reject) => {
    worker.onmessage = (e) => {
      if (e.data.type === 'ack') {
        acks++;
        waiting?.();
      } else if (e.data.type === 'done') resolve(e.data.buf);
    };
    worker.onerror = (e) => reject(e);
  });
  try {
    worker.postMessage({ type: 'init', size: px, delay: (L / n) * 100, transparent: !o.bg || o.round });
    for (let i = 0; i < 12; i++) {
      const buf = pixels((i * L) / 12);
      worker.postMessage({ type: 'sample', buf }, [buf]);
    }
    for (let i = 0; i < n; i++) {
      // keep at most a few frames in flight
      while (i - acks > 3) await new Promise<void>((r) => (waiting = r));
      const buf = pixels((i * L) / n);
      worker.postMessage({ type: 'frame', buf }, [buf]);
      onProgress?.(i / n);
    }
    worker.postMessage({ type: 'end' });
    const bytes = await done;
    save(new Blob([bytes], { type: 'image/gif' }), name(s, 'gif'));
  } finally {
    worker.terminate();
  }
}
