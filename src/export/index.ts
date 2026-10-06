// Getting the avatar out: files to download and things to copy.

import { frame, loopLength, type BlobState } from '../engine';
import { drawModel } from '../render/canvas';
import { toSvgString } from '../render/svg';
import { animatedSvg } from './smil';

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

/** the rest pose: what a still picture should show */
const still = (s: BlobState) => frame(s, 0, { still: true });

function canvasOf(px: number) {
  const c = document.createElement('canvas');
  c.width = c.height = px;
  return c;
}

function pngBlob(s: BlobState, px: number, round: boolean): Promise<Blob> {
  const c = canvasOf(px);
  drawModel(c.getContext('2d')!, still(s), px, { circle: round });
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('png'))), 'image/png'));
}

export async function downloadPng(s: BlobState, px: number, round: boolean) {
  save(await pngBlob(s, px, round), name(s, 'png'));
}

export async function copyPng(s: BlobState, px: number, round: boolean): Promise<boolean> {
  try {
    // Safari wants the promise handed to ClipboardItem right away
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob(s, px, round) })]);
    return true;
  } catch {
    return false;
  }
}

const svgText = (s: BlobState, round: boolean) => toSvgString(still(s), { size: 512, circle: round });

export function downloadSvg(s: BlobState, round: boolean) {
  save(new Blob([svgText(s, round)], { type: 'image/svg+xml' }), name(s, 'svg'));
}

export async function copySvg(s: BlobState, round: boolean): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(svgText(s, round));
    return true;
  } catch {
    return false;
  }
}

export async function downloadAnimatedSvg(s: BlobState, round: boolean) {
  // let the button show its busy state before the work starts
  await new Promise((r) => setTimeout(r, 30));
  save(new Blob([animatedSvg(s, { circle: round })], { type: 'image/svg+xml' }), name(s, 'animated.svg'));
}

/** 20 frames a second, drawn here and encoded in a worker */
export async function downloadGif(s: BlobState, px: number, round: boolean, onProgress?: (p: number) => void) {
  const L = loopLength(s) || 3;
  const n = Math.max(2, Math.round(L / 0.05));
  const c = canvasOf(px);
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  const worker = new Worker(new URL('./gif.worker.ts', import.meta.url), { type: 'module' });
  const pixels = (t: number) => {
    drawModel(ctx, frame(s, t), px, { circle: round });
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
    worker.postMessage({ type: 'init', size: px, delay: (L / n) * 100, transparent: s.bg.kind === 'none' || round });
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
