// Ready-made blobs: looks to start from in the editor, all in the swatches. The
// first six are also the strip of examples for product cards and the README
// (brand.ts, stripSvg).

import type { BlobState } from 'blob-avatar/engine';

export type Look = Pick<BlobState, 'shape' | 'color' | 'expression'>;

export const PRESETS: readonly Look[] = [
  { shape: 'circle', color: '#aefa0e', expression: 'neutral' },
  { shape: 'pebble', color: '#8b5cf6', expression: 'happy' },
  { shape: 'squircle', color: '#3b93f0', expression: 'attentive' },
  { shape: 'triangle', color: '#f0b429', expression: 'excited' },
  { shape: 'cloud', color: '#e152b0', expression: 'laughing' },
  { shape: 'droplet', color: '#2fbfa0', expression: 'curious' },
  { shape: 'ghost', color: '#a3a3a3', expression: 'scared' },
  { shape: 'heart', color: '#e8483f', expression: 'shy' },
];

/** whether an avatar has this look */
export const hasLook = (s: Look, p: Look) => s.shape === p.shape && s.color === p.color && s.expression === p.expression;
