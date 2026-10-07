// HTML for the page and its pieces. Pure string functions: the page generator
// (scripts/pages.ts) builds the whole page with them, and the app re-renders the
// parts that depend on the avatar (thumbnails, the timeline) with the same code.

import { ANIMS, DEFAULT_DUR, EXPRESSIONS, IDLE_CYCLE, PALETTE, SHAPES, SHOW_AT, frame, cloneState, type Anim, type BlobState } from '../engine';
import { toSvgString } from '../render/svg';
import { wordmarkSvg } from '../brand';
import type { Strings } from '../i18n/strings';
import { ICONS } from './icons';

export const SITE = 'https://blob.coleoni.com';
export const REPO = 'https://github.com/c0le0ni/blob-avatar';

export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const svgOf = (s: BlobState, t: number, still: boolean, size: number, crop = false) => {
  const svg = toSvgString(frame(s, t, { still, gaze: [0, 0] }), { size }).replace('<svg ', '<svg aria-hidden="true" focusable="false" ');
  // thumbnails frame the body tightly, so a small tile still shows a big blob
  return crop ? svg.replace('viewBox="-100 -100 200 200"', 'viewBox="-74 -74 148 148"') : svg;
};

const look = (s: BlobState, patch: Partial<BlobState>): BlobState => ({ ...cloneState(s), cycle: IDLE_CYCLE, ...patch });

/** thumbnails: the avatar with one thing changed, at rest */
export const shapeThumb = (s: BlobState, shape: BlobState['shape']) => svgOf(look(s, { shape }), 0, true, 44, true);
export const exprThumb = (s: BlobState, expression: BlobState['expression']) => svgOf(look(s, { expression }), 0, true, 44, true);

/** an animation's thumbnail: the moment that shows what it does */
export const animThumb = (s: BlobState, anim: Anim) => {
  const dur = DEFAULT_DUR[anim];
  return svgOf(look(s, { cycle: [{ anim, dur }] }), dur * SHOW_AT[anim], anim === 'idle', 44, true);
};

const radio = (name: string, value: string, checked: boolean, extra = '') => `<input type="radio" name="${name}" value="${esc(value)}"${checked ? ' checked' : ''}${extra}>`;

function tiles<T extends string>(name: string, list: readonly T[], current: T, label: (v: T) => string, labelledBy: string) {
  return `<div class="grid" role="radiogroup" aria-labelledby="${labelledBy}">${list.map((v) => `<label class="tile">${radio(name, v, v === current)}<span class="art" data-art="${v}"></span><span class="name">${esc(label(v))}</span></label>`).join('')}</div>`;
}

const seg = (name: string, options: [string, string][], current: string, label: string) =>
  `<div class="seg" role="radiogroup" aria-label="${esc(label)}">${options.map(([v, l]) => `<label>${radio(name, v, v === current)}<span>${esc(l)}</span></label>`).join('')}</div>`;

const item = (act: string, icon: string, label: string) => `<button type="button" class="pop-item" data-act="${act}">${icon}<span>${esc(label)}</span></button>`;

// ---------------------------------------------------------------- panels

function customisePanel(s: BlobState, S: Strings): string {
  const isPalette = PALETTE.some((p) => p.hex === s.color);
  const swatches = PALETTE.map((p) => `<label class="swatch" style="--c:${p.hex}" title="${esc(S.palette[p.id])}">${radio('color', p.hex, p.hex === s.color, ` aria-label="${esc(S.palette[p.id])}"`)}</label>`).join('');
  const custom = `<label class="swatch custom${isPalette ? '' : ' on'}" title="${esc(S.customColor)}" style="--c:${isPalette ? 'transparent' : s.color}">${ICONS.plus}<input type="color" id="custom-color" value="${isPalette ? '#ff7a59' : s.color}" aria-label="${esc(S.customColor)}"></label>`;
  return `<h2 class="label" id="h-shape">${esc(S.shape)}</h2>${tiles('shape', SHAPES, s.shape, (v) => S.shapes[v], 'h-shape')}
<h2 class="label" id="h-expr">${esc(S.expression)}</h2>${tiles('expr', EXPRESSIONS, s.expression, (v) => S.expressions[v], 'h-expr')}
<h2 class="label" id="h-color">${esc(S.color)}</h2><div class="swatches" role="radiogroup" aria-labelledby="h-color">${swatches}${custom}</div>`;
}

function animationsPanel(S: Strings): string {
  return `<h2 class="label" id="h-anim">${esc(S.animation)}</h2><div class="grid" data-anims>${ANIMS.map((a) => `<button type="button" class="tile" data-act="append" data-anim="${a}"><span class="art" data-art="${a}"></span><span class="name">${esc(S.anims[a])}</span></button>`).join('')}</div>`;
}

function settingsPanel(S: Strings, other: Strings): string {
  const lang = (L: Strings, on: boolean) =>
    `<a class="row-link${on ? ' on' : ''}" href="${L.path}" hreflang="${L.htmlLang}" lang="${L.htmlLang}" data-lang="${L.lang}"${on ? ' aria-current="true"' : ''}><span class="code">${L.lang.toUpperCase()}</span><span>${L.lang === 'pt' ? 'Português' : 'English'}</span>${on ? ICONS.check : ''}</a>`;
  const en = S.lang === 'en' ? S : other;
  const pt = S.lang === 'pt' ? S : other;
  const out = (href: string, icon: string, label: string) => `<a class="row-link" href="${href}" target="_blank" rel="noopener noreferrer">${icon}<span>${esc(label)}</span><span class="sr-only"> ${esc(S.newTab)}</span>${ICONS.arrowUpRight}</a>`;
  return `<h2 class="label" id="h-lang">${esc(S.language)}</h2><div class="rows" role="group" aria-labelledby="h-lang">${lang(en, S.lang === 'en')}${lang(pt, S.lang === 'pt')}</div>
<h2 class="label" id="h-theme">${esc(S.theme)}</h2>${seg('theme', [['system', S.themes.system], ['light', S.themes.light], ['dark', S.themes.dark]], 'system', S.theme)}
<h2 class="label">${esc(S.about)}</h2><div class="rows">${out(REPO, ICONS.github, S.github)}${out('https://skills.coleoni.com', ICONS.code, S.skills)}${out('https://coleoni.com', ICONS.globe, S.coleoni)}</div>
<p class="made">${esc(S.madeBy)} <a href="https://coleoni.com" rel="noopener"><img src="/brand/lockup.svg" alt="Coleoni" width="79" height="20"></a></p>`;
}

function exportMenu(S: Strings): string {
  const sizes = ['400', '460', '512', '1024'];
  return `<div class="export" data-export>
  <button type="button" class="btn primary split-main" data-act="png">${ICONS.download}<span>${esc(S.exportPng)}</span></button><button type="button" class="btn primary split-more" aria-haspopup="dialog" aria-expanded="false" aria-controls="export-pop" aria-label="${esc(S.moreFormats)}">${ICONS.chev}</button>
  <div class="pop" id="export-pop" role="dialog" aria-label="${esc(S.moreFormats)}" hidden>
    ${item('png', ICONS.download, S.downloadPng)}${item('svg', ICONS.download, S.downloadSvg)}${item('anim-svg', ICONS.download, S.downloadAnimSvg)}${item('gif', ICONS.download, S.downloadGif)}
    <hr>${item('copy-png', ICONS.copy, S.copyImage)}${item('copy-svg', ICONS.copy, S.copySvg)}
    <hr><div class="pop-field"><span class="pop-label" id="l-size">${esc(S.size)}</span><div class="chips" role="radiogroup" aria-labelledby="l-size">${sizes.map((v) => `<label>${radio('size', v, v === '460')}<span>${v}</span></label>`).join('')}<label class="chip-custom">${radio('size', 'custom', false, ` aria-label="${esc(S.custom)}"`)}<input type="number" id="custom-size" min="16" max="2048" value="800" inputmode="numeric" aria-label="${esc(S.size)}"></label></div></div>
    <div class="pop-field"><span class="pop-label" id="l-bg">${esc(S.background)}</span><div class="chips" role="radiogroup" aria-labelledby="l-bg"><label>${radio('bg', 'none', true)}<span>${esc(S.transparent)}</span></label><label class="chip-color">${radio('bg', 'color', false, ` aria-label="${esc(S.color)}"`)}<input type="color" id="bg-color" value="#ffffff" aria-label="${esc(S.background)}"></label></div><label class="switch"><input type="checkbox" id="round" role="switch"><span>${esc(S.round)}</span></label></div>
    <hr>${item('copy-link', ICONS.link, S.copyLink)}${item('copy-embed', ICONS.code, S.copyEmbed)}
  </div>
</div>`;
}

// ---------------------------------------------------------------- page

export function describe(s: BlobState, S: Strings): string {
  const pal = PALETTE.find((p) => p.hex === s.color);
  return S.describe(S.shapes[s.shape], pal ? S.palette[pal.id] : S.customColor, S.expressions[s.expression]);
}

export function page(s: BlobState, S: Strings, other: Strings): string {
  const url = `${SITE}${S.path}`;
  const rail = (id: string, icon: string, label: string, on: boolean) =>
    `<button type="button" class="rail-btn" role="tab" id="mode-${id}" aria-controls="panel-${id}" aria-selected="${on}"${on ? '' : ' tabindex="-1"'} aria-label="${esc(label)}" data-tip="${esc(label)}">${icon}</button>`;
  const panel = (id: string, body: string, on: boolean) => `<section class="mode" role="tabpanel" id="panel-${id}" aria-labelledby="mode-${id}"${on ? '' : ' hidden'}>${body}</section>`;
  return `<!doctype html>
<html lang="${S.htmlLang}" class="no-js">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <script src="/lang.js"></script>
    <script src="/theme-init.js"></script>
    <title>${esc(S.title)}</title>
    <meta name="description" content="${esc(S.description)}" />
    <meta name="theme-color" content="#0b0c0e" />
    <link rel="canonical" href="${url}" />
    <link rel="alternate" hreflang="en" href="${SITE}/" />
    <link rel="alternate" hreflang="pt-BR" href="${SITE}/pt/" />
    <link rel="alternate" hreflang="x-default" href="${SITE}/" />
    <meta property="og:locale" content="${S.ogLocale}" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="Blob Avatar" />
    <meta property="og:title" content="${esc(S.ogTitle)}" />
    <meta property="og:description" content="${esc(S.ogDescription)}" />
    <meta property="og:url" content="${url}" />
    <meta property="og:image" content="${SITE}/og/${S.lang}.jpg" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="${esc(S.ogAlt)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <link rel="icon" href="/favicon.ico" sizes="48x48" />
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <link rel="manifest" href="/site.webmanifest" />
    <link rel="preload" href="/fonts/geist-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin />
    <link rel="stylesheet" href="/src/styles.css" />
    <script type="module" src="/src/main.ts"></script>
  </head>
  <body>
    <a class="skip" href="#panel">${esc(S.skip)}</a>
    <h1 class="sr-only">${esc(S.h1)}</h1>
    <div class="app" data-mode="customise">
      <a class="brand" href="${S.path}" aria-label="${esc(S.home)}" data-wordmark>${wordmarkSvg({ height: 24, live: true, letters: 'currentColor' })}</a>
      <button type="button" class="icon-btn theme-btn" data-act="theme" aria-label="${esc(S.switchTheme)}" data-tip="${esc(S.switchTheme)}">${ICONS.sun}${ICONS.moon}</button>
      <nav class="rail" role="tablist" aria-label="${esc(S.modes)}" aria-orientation="vertical">${rail('customise', ICONS.palette, S.customise, true)}${rail('animations', ICONS.clapper, S.animations, false)}${rail('settings', ICONS.gear, S.settings, false)}</nav>
      <main class="canvas" id="main">
        <div class="stage" data-stage role="img" aria-label="${esc(S.stageLabel(describe(s, S)))}">${svgOf(look(s, {}), 0, true, 400)}</div>
        ${exportMenu(S)}
      </main>
      <aside class="panel" id="panel" tabindex="-1">
        ${panel('customise', customisePanel(s, S), true)}
        ${panel('animations', animationsPanel(S), false)}
        ${panel('settings', settingsPanel(S, other), false)}
      </aside>
    </div>
    <div class="toast" role="status" aria-live="polite" data-toast></div>
  </body>
</html>
`;
}

/** the snippet behind "Copy embed code" */
export function embedCode(s: BlobState): string {
  const anim = s.cycle.map((c) => `${c.anim}.${c.dur}`).join(',');
  return `<script src="${SITE}/embed.js" defer></script>\n<blob-avatar shape="${s.shape}" color="${s.color}" expression="${s.expression}" animation="${anim}" seed="${s.seed.toString(36)}" size="160"></blob-avatar>`;
}
