// What the app says about the avatar outside the stage: its description, the
// thumbnails in the option grids and the embed snippet.

import { DEFAULT_DUR, IDLE_CYCLE, PALETTE, SHOW_AT, cloneState, frame, type Anim, type BlobState, type RenderModel } from '../engine';
import { toSvgString } from '../render/svg';
import type { Strings } from '../i18n/strings';

export const SITE = 'https://blob.coleoni.com';
export const REPO = 'https://github.com/c0le0ni/blob-avatar';
export const SKILLS = 'https://skills.coleoni.com';
export const LOADERS = 'https://loaders.coleoni.com';
export const COLEONI = 'https://coleoni.com';

/** coleoni.com in the page's language */
export const coleoniHome = (S: Pick<Strings, 'lang'>) => (S.lang === 'pt' ? `${COLEONI}/pt` : COLEONI);

export function describe(s: BlobState, S: Strings): string {
  const pal = PALETTE.find((p) => p.hex === s.color);
  return S.describe(S.shapes[s.shape], pal ? S.palette[pal.id] : S.customColor, S.expressions[s.expression]);
}

// thumbnails frame the body tightly, so a small tile still shows a big blob
const CROP = 156;
const box = (side: number, cx = 0, cy = 0) => [cx - side / 2, cy - side / 2, side, side].map((v) => Math.round(v * 10) / 10).join(' ');

const svgOf = (m: RenderModel, view = box(CROP)) =>
  toSvgString(m, { size: 64 })
    .replace('<svg ', '<svg aria-hidden="true" focusable="false" ')
    .replace('viewBox="-100 -100 200 200"', `viewBox="${view}"`)
    .replace(/ width="64" height="64"/, ' width="100%" height="100%"');

const still = (s: BlobState) => frame(s, 0, { still: true });

const look = (s: BlobState, patch: Partial<BlobState>): BlobState => ({ ...cloneState(s), cycle: IDLE_CYCLE, ...patch });

/** the avatar with one thing changed, at rest */
export const shapeThumb = (s: BlobState, shape: BlobState['shape']) => svgOf(still(look(s, { shape })));
export const exprThumb = (s: BlobState, expression: BlobState['expression']) => svgOf(still(look(s, { expression })));

/** what a frame covers: the body, and the dots and lines that show */
function cover(m: RenderModel, b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }) {
  const add = (x: number, y: number, r = 0) => {
    b.x0 = Math.min(b.x0, x - r);
    b.y0 = Math.min(b.y0, y - r);
    b.x1 = Math.max(b.x1, x + r);
    b.y1 = Math.max(b.y1, y + r);
  };
  m.body.c.x.forEach((x, i) => add(x, m.body.c.y[i]));
  for (const p of m.parts) if (p.alpha > 0.05) p.c.x.forEach((x, i) => add(x, p.c.y[i]));
  for (const t of [...m.back, ...m.front]) if (t.alpha > 0.05) t.x.forEach((x, i) => add(x, t.y[i], t.width / 2));
  return b;
}

/** an animation's play, through a clip and a moment of rest after it (a tile under the pointer) */
export const animLook = (s: BlobState, anim: Anim): BlobState => look(s, { cycle: [{ anim, dur: DEFAULT_DUR[anim] }, { anim: 'idle', dur: 0.9 }] });

/** the square the whole blob fits in, as the tiles frame it */
export const FULL_VIEW = box(CROP);

/** an animation's thumbnail: the moment that shows what it does, zoomed in on a small figure */
export function animThumb(s: BlobState, anim: Anim): { svg: string; view: string } {
  const dur = DEFAULT_DUR[anim];
  const m = anim === 'idle' ? still(s) : frame(look(s, { cycle: [{ anim, dur }] }), dur * SHOW_AT[anim], { gaze: [0, 0] });
  const b = cover(m);
  const side = Math.min(CROP, Math.max(CROP / 2.2, Math.max(b.x1 - b.x0, b.y1 - b.y0) * 1.25));
  const view = side >= CROP * 0.8 ? FULL_VIEW : box(side, (b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2);
  return { svg: svgOf(m, view), view };
}

/** the snippet behind "Copy embed code" */
export function embedCode(s: BlobState): string {
  const anim = s.cycle.map((c) => `${c.anim}.${c.dur}`).join(',');
  return `<script src="${SITE}/v2/embed.js" defer></script>\n<blob-avatar shape="${s.shape}" color="${s.color}" expression="${s.expression}" animation="${anim}" seed="${s.seed.toString(36)}" size="160"></blob-avatar>`;
}
