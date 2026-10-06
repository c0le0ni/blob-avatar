// HTML for the page and its pieces. Pure string functions: the page generator
// (scripts/pages.ts) builds the whole page with them, and the app re-renders the
// parts that depend on the avatar (thumbnails, the montage) with the same code.

import { ANIMS, DEFAULT_DUR, EXPRESSIONS, EYES, PALETTE, SHAPES, frame, loopLength, cloneState, type Anim, type BlobState, type Clip } from '../engine';
import { toSvgString } from '../render/svg';
import { wordmarkSvg } from '../brand';
import type { Strings } from '../i18n/strings';
import { ICONS } from './icons';

export const SITE = 'https://blob.coleoni.com';
export const REPO = 'https://github.com/c0le0ni/blob-avatar';

export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const NONE = { kind: 'none' as const, c1: '#000000', c2: '#000000', angle: 0 };
const svgOf = (s: BlobState, t: number, still: boolean, size: number) =>
  toSvgString(frame(s, t, { still, gaze: [0, 0] }), { size, bg: NONE }).replace('<svg ', '<svg aria-hidden="true" focusable="false" ');

/** a still thumbnail of an avatar */
export const thumb = (s: BlobState, size = 52) => svgOf(s, 0, true, size);

/** a frame that shows what a move looks like (mid-move, eyes forced open by timing) */
const SHOW_AT: Partial<Record<Anim, number>> = { hop: 0.42, bounce: 0.3, spin: 0.45, sleep: 0.6, love: 0.55, pop: 0.35, jelly: 0.2, dizzy: 0.5, excited: 0.3, peek: 0.45, lean: 0.4 };
export const animThumb = (s: BlobState, anim: Anim, size = 52) => {
  const dur = DEFAULT_DUR[anim];
  return svgOf({ ...cloneState(s), seq: [{ anim, dur }] }, dur * (SHOW_AT[anim] ?? 0.3), false, size);
};

export const shapeThumb = (s: BlobState, shape: BlobState['shape']) => thumb({ ...cloneState(s), shape });
export const eyeThumb = (s: BlobState, eyes: BlobState['eyes']) => thumb({ ...cloneState(s), eyes, expression: 'neutral' });
export const exprThumb = (s: BlobState, expression: BlobState['expression']) => thumb({ ...cloneState(s), expression });

const radio = (name: string, value: string, checked: boolean, extra = '') => `<input type="radio" name="${name}" value="${esc(value)}"${checked ? ' checked' : ''}${extra}>`;

const tiles = <T extends string>(name: string, list: readonly T[], current: T, label: (v: T) => string, art: (v: T) => string) =>
  `<div class="grid" data-tiles="${name}">${list.map((v) => `<label class="opt">${radio(name, v, v === current)}<span class="art" data-art="${v}">${art(v)}</span><span>${esc(label(v))}</span></label>`).join('')}</div>`;

const seg = (name: string, options: [string, string][], current: string) =>
  `<div class="seg">${options.map(([v, l]) => `<label>${radio(name, v, v === current)}${esc(l)}</label>`).join('')}</div>`;

const colorField = (id: string, value: string, S: Strings, extra = '') =>
  `<span class="color-field"${extra}><input type="color" id="${id}" value="${value}" aria-label="${esc(S.pickColor)}"><input type="text" id="${id}-hex" value="${value}" maxlength="7" spellcheck="false" autocomplete="off" aria-label="${esc(S.hexLabel)}"></span>`;

const btn = (act: string, icon: string, label: string, cls = 'tbtn', extra = '') => `<button type="button" class="${cls}" data-act="${act}"${extra}>${icon}<span>${esc(label)}</span></button>`;

// ---------------------------------------------------------------- montage

export function montage(s: BlobState, S: Strings, sel: number): string {
  const chips = s.seq
    .map(
      (c: Clip, i) =>
        `<li class="clip" data-i="${i}" aria-current="${i === sel}"><button type="button" class="pick" data-act="pick" data-i="${i}" aria-pressed="${i === sel}"><span class="name">${esc(S.anims[c.anim])}</span> <span class="dur">${secs(c.dur, S)}</span></button><button type="button" class="rm" data-act="remove" data-i="${i}" aria-label="${esc(`${S.removeClip}: ${S.anims[c.anim]}`)}"${s.seq.length < 2 ? ' disabled' : ''}>${ICONS.x}</button></li>`,
    )
    .join('');
  return `${chips}<li><button type="button" class="clip add" data-act="add"${s.seq.length >= 8 ? ' disabled' : ''}>${ICONS.plus}<span>${esc(S.addMove)}</span></button></li>`;
}

/** seconds as people read them: 1.6s in English, 1,6s in Portuguese */
export const secs = (v: number, S: Strings) => `${S.lang === 'pt' ? String(v).replace('.', ',') : v}${S.seconds}`;
export const loopText = (s: BlobState, S: Strings) => secs(Math.round(loopLength(s) * 10) / 10, S);

// ---------------------------------------------------------------- editor

export function editor(s: BlobState, S: Strings, art = true): string {
  const A = (f: () => string) => (art ? f() : '');
  const tab = (id: keyof Strings['tabs'], on: boolean) =>
    `<button type="button" class="tab" role="tab" id="tab-${id}" aria-controls="panel-${id}" aria-selected="${on}"${on ? '' : ' tabindex="-1"'}>${esc(S.tabs[id])}</button>`;
  const panel = (id: keyof Strings['tabs'], body: string, on = false) => `<div class="tabpanel" role="tabpanel" id="panel-${id}" aria-labelledby="tab-${id}" tabindex="0"${on ? '' : ' hidden'}>${body}</div>`;

  const shapePanel = `<fieldset><legend>${esc(S.shapeLegend)}</legend>${tiles('shape', SHAPES, s.shape, (v) => S.shapes[v], (v) => A(() => shapeThumb(s, v)))}</fieldset>`;

  const facePanel = [
    `<fieldset><legend>${esc(S.eyesLegend)}</legend>${tiles('eyes', EYES, s.eyes, (v) => S.eyes[v], (v) => A(() => eyeThumb(s, v)))}</fieldset>`,
    `<fieldset><legend>${esc(S.eyeModeLegend)}</legend>${seg('mode', [['ink', S.eyeModes.ink], ['hole', S.eyeModes.hole]], s.eyeMode)}</fieldset>`,
    `<fieldset><legend>${esc(S.expressionLegend)}</legend>${tiles('expr', EXPRESSIONS, s.expression, (v) => S.expressions[v], (v) => A(() => exprThumb(s, v)))}</fieldset>`,
  ].join('');

  const swatches = PALETTE.map((p) => `<label class="swatch" style="background:${p.hex}" title="${esc(S.palette[p.id])}">${radio('color', p.hex, p.hex === s.color, ` aria-label="${esc(S.palette[p.id])}"`)}</label>`).join('');
  const colorPanel = [
    `<fieldset><legend>${esc(S.bodyColor)}</legend><div class="swatches">${swatches}</div><div class="row">${colorField('body-color', s.color, S)}</div></fieldset>`,
    `<fieldset><legend>${esc(S.eyeColor)}</legend><div class="row">${seg('eyec', [['auto', S.eyeColorModes.auto], ['custom', S.eyeColorModes.custom]], s.eyeColor === 'auto' ? 'auto' : 'custom')}${colorField('eye-color', s.eyeColor === 'auto' ? '#111111' : s.eyeColor, S, s.eyeColor === 'auto' ? ' hidden' : '')}</div></fieldset>`,
    `<fieldset><legend>${esc(S.background)}</legend>${seg('bg', [['none', S.bgKinds.none], ['solid', S.bgKinds.solid], ['linear', S.bgKinds.linear]], s.bg.kind)}<div class="row" data-bg-fields${s.bg.kind === 'none' ? ' hidden' : ''}>${colorField('bg1', s.bg.c1, S)}${colorField('bg2', s.bg.c2, S, s.bg.kind === 'linear' ? '' : ' hidden')}<label class="range" data-angle${s.bg.kind === 'linear' ? '' : ' hidden'}><span>${esc(S.angle)}</span><input type="range" id="bg-angle" min="0" max="360" step="5" value="${s.bg.angle}"><output for="bg-angle">${s.bg.angle}°</output></label></div></fieldset>`,
  ].join('');

  const animTiles = `<div class="grid" data-anims>${ANIMS.map((a) => `<button type="button" class="opt" data-act="append" data-anim="${a}"><span class="art" data-art="${a}">${A(() => animThumb(s, a))}</span><span>${esc(S.anims[a])}</span></button>`).join('')}</div>`;
  const first = s.seq[0];
  const motionPanel = [
    `<fieldset data-clip><legend>${esc(S.clipLegend)}</legend><div class="row"><strong class="clip-name" data-clip-name>${esc(S.anims[first.anim])}</strong><label class="range"><span>${esc(S.duration)}</span><input type="range" id="clip-dur" min="0.4" max="10" step="0.1" value="${first.dur}"><output for="clip-dur">${secs(first.dur, S)}</output></label></div><div class="row">${btn('earlier', ICONS.left, S.moveEarlier, 'tbtn')}${btn('later', ICONS.right, S.moveLater, 'tbtn')}${btn('remove-sel', ICONS.x, S.removeClip, 'tbtn')}</div></fieldset>`,
    `<fieldset><legend>${esc(S.movesLegend)}</legend><p class="hint">${esc(S.movesHint)}</p>${animTiles}</fieldset>`,
  ].join('');

  const sizes: [string, string][] = [['460', 'GitHub 460'], ['512', 'Slack 512'], ['400', 'X, LinkedIn 400'], ['128', 'Discord 128'], ['1024', '1024'], ['custom', S.custom]];
  const exportPanel = [
    `<fieldset><legend>${esc(S.profileLegend)}</legend><div class="chips" role="radiogroup" aria-label="${esc(S.size)}">${sizes.map(([v, l]) => `<label>${radio('size', v, v === '460')}${esc(l)}</label>`).join('')}<label class="custom-size" hidden><span class="sr-only">${esc(S.size)}</span><input type="number" id="custom-size" min="16" max="2048" step="1" value="800" inputmode="numeric"><span>px</span></label></div><div class="row"><span class="field-label">${esc(S.frame)}</span>${seg('frame', [['square', S.frames.square], ['round', S.frames.round]], 'square')}</div><div class="actions">${btn('png', ICONS.download, S.downloadPng, 'tbtn primary')}${btn('copy-png', ICONS.copy, S.copyImage)}</div><p class="hint">${esc(S.bgNote)}</p></fieldset>`,
    `<fieldset><legend>${esc(S.animatedLegend)}</legend><div class="actions">${btn('gif', ICONS.download, S.downloadGif)}${btn('anim-svg', ICONS.download, S.downloadAnimSvg)}</div><p class="hint" data-anim-note>${esc(S.loopNote(loopText(s, S)))}</p></fieldset>`,
    `<fieldset><legend>${esc(S.vectorLegend)}</legend><div class="actions">${btn('svg', ICONS.download, S.downloadSvg)}${btn('copy-svg', ICONS.copy, S.copySvg)}</div></fieldset>`,
  ].join('');

  const embedPanel = `<fieldset><legend>${esc(S.embedLegend)}</legend><p class="hint">${esc(S.embedHint)}</p><div class="code"><pre tabindex="0" data-embed-code>${esc(embedCode(s, true))}</pre></div><div class="row"><label class="check"><input type="checkbox" id="embed-gaze" checked><span>${esc(S.followCursor)}</span></label><span class="grow"></span>${btn('copy-embed', ICONS.copy, S.copyCode, 'tbtn')}</div></fieldset>`;

  return `<div class="card stage-card">
  <div class="toolbar">${btn('random', ICONS.dice, S.random)}${btn('undo', ICONS.undo, S.undo, 'tbtn', ' disabled')}<span class="grow"></span>${btn('pause', ICONS.pause, S.pause, 'tbtn', ' aria-pressed="false"')}${btn('share', ICONS.link, S.share, 'tbtn primary')}</div>
  <div class="stage-wrap"><div class="stage" data-stage role="img" aria-label="${esc(S.stageLabel(describe(s, S)))}">${toSvgString(frame(s, 0, { gaze: [0, 0] }), { size: 400 }).replace('<svg ', '<svg aria-hidden="true" focusable="false" ')}</div><button type="button" class="stage-light" data-act="light" aria-pressed="false" aria-label="${esc(S.lightStage)}" title="${esc(S.lightStage)}">${ICONS.sun}</button></div>
  <div class="montage"><div class="montage-head"><span>${esc(S.montage)}</span><span data-loop>${loopText(s, S)}</span></div><div class="timeline" aria-hidden="true"><i data-progress></i></div><ol class="clips" data-clips aria-label="${esc(S.montage)}">${montage(s, S, 0)}</ol></div>
</div>
<div class="card panel">
  <div class="tabs" role="tablist" aria-label="${esc(S.editor)}">${tab('shape', true)}${tab('face', false)}${tab('color', false)}${tab('motion', false)}${tab('export', false)}${tab('embed', false)}</div>
  ${panel('shape', shapePanel, true)}${panel('face', facePanel)}${panel('color', colorPanel)}${panel('motion', motionPanel)}${panel('export', exportPanel)}${panel('embed', embedPanel)}
</div>`;
}

export function describe(s: BlobState, S: Strings): string {
  const pal = PALETTE.find((p) => p.hex === s.color);
  const color = pal ? S.palette[pal.id] : S.customColor;
  const moves = s.seq.map((c) => S.anims[c.anim]).join(', ');
  return S.describe(S.shapes[s.shape], color, S.eyes[s.eyes], S.expressions[s.expression], moves);
}

/** the snippet for the Embed tab */
export function embedCode(s: BlobState, gaze: boolean): string {
  const attrs = [
    `shape="${s.shape}"`,
    `color="${s.color}"`,
    `eyes="${s.eyes}"`,
    s.eyeMode === 'hole' ? 'mode="hole"' : '',
    s.eyeColor !== 'auto' ? `eyec="${s.eyeColor}"` : '',
    `expression="${s.expression}"`,
    `animation="${s.seq.map((c) => `${c.anim}.${c.dur}`).join(',')}"`,
    s.bg.kind === 'solid' ? `bg="solid.${s.bg.c1.slice(1)}"` : s.bg.kind === 'linear' ? `bg="linear.${s.bg.c1.slice(1)}.${s.bg.c2.slice(1)}.${s.bg.angle}"` : '',
    `seed="${s.seed.toString(36)}"`,
    'size="160"',
    gaze ? 'gaze' : '',
  ].filter(Boolean);
  return `<script src="${SITE}/embed.js" defer></script>\n\n<blob-avatar\n  ${attrs.join('\n  ')}\n></blob-avatar>`;
}

// ---------------------------------------------------------------- page

export function page(s: BlobState, S: Strings, other: Strings): string {
  const url = `${SITE}${S.path}`;
  const ogImage = `${SITE}/og/${S.lang}.jpg`;
  const langItem = (L: Strings, on: boolean) =>
    `<a role="menuitemradio" aria-checked="${on}" href="${L.path}" hreflang="${L.htmlLang}" lang="${L.htmlLang}" data-lang="${L.lang}"><span>${L.lang === 'pt' ? 'Português' : 'English'}</span>${ICONS.check}</a>`;
  const en = S.lang === 'en' ? S : other;
  const pt = S.lang === 'pt' ? S : other;
  return `<!doctype html>
<html lang="${S.htmlLang}" class="no-js">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <script src="/lang.js"></script>
    <title>${esc(S.title)}</title>
    <meta name="description" content="${esc(S.description)}" />
    <meta name="theme-color" content="#0a0a0a" />
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
    <meta property="og:image" content="${ogImage}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="${esc(S.ogAlt)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <link rel="icon" href="/favicon-32.png" sizes="32x32" type="image/png" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <link rel="preload" href="/fonts/geist-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin />
    <link rel="stylesheet" href="/src/styles.css" />
    <script type="module" src="/src/main.ts"></script>
  </head>
  <body>
    <a class="skip" href="#editor">${esc(S.skip)}</a>
    <header class="nav">
      <div class="wrap">
        <a class="brand" href="${S.path}" aria-label="${esc(S.home)}">
          <img class="brand-lockup" src="/brand/lockup.svg" alt="" width="95" height="24" />
          <img class="brand-mark" src="/brand/symbol.svg" alt="" width="23" height="24" />
          <span class="brand-sep" aria-hidden="true"></span>
          <span class="brand-blob" data-wordmark>${wordmarkSvg({ height: 26, live: true })}</span>
        </a>
        <nav class="nav-links" aria-label="Main">
          <a class="nav-link hide-sm" href="https://skills.coleoni.com${S.lang === 'pt' ? '/pt/' : '/'}">Skills</a>
          <a class="nav-link hide-sm" href="${REPO}" target="_blank" rel="noopener noreferrer" aria-label="${esc(S.github)}">${ICONS.github}GitHub</a>
          <a class="nav-link" href="https://coleoni.com" rel="noopener">coleoni.com${ICONS.arrowUpRight}</a>
          <div class="lang" data-lang-menu>
            <button class="nav-link lang-btn" type="button" aria-haspopup="menu" aria-expanded="false" aria-controls="lang-menu">${ICONS.globe}<span class="sr-only">${esc(S.language)}: </span>${S.lang.toUpperCase()}${ICONS.chev}</button>
            <div class="lang-menu" id="lang-menu" role="menu" aria-label="${esc(S.language)}" hidden>${langItem(en, S.lang === 'en')}${langItem(pt, S.lang === 'pt')}</div>
          </div>
        </nav>
      </div>
    </header>

    <main id="content">
      <section class="intro">
        <div class="wrap">
          <span class="eyebrow"><span class="dot"></span>${esc(S.eyebrow)}</span>
          <h1>${esc(S.h1)} <span class="muted">${esc(S.h1Muted)}</span></h1>
          <p class="lead">${esc(S.lead)}</p>
        </div>
      </section>

      <section class="wrap editor" id="editor" aria-label="${esc(S.editor)}" tabindex="-1">
${editor(s, S, false)}
      </section>

      <section class="section" id="uses">
        <div class="wrap">
          <h2>${esc(S.usesTitle)}</h2>
          <p class="lead">${esc(S.usesLead)}</p>
          <div class="uses">${S.uses.map((u) => `<div class="use"><h3>${esc(u.h)}</h3><p>${u.p}</p></div>`).join('')}</div>
          <a class="more" href="https://skills.coleoni.com${S.lang === 'pt' ? '/pt/' : '/'}"><span class="more-text"><strong>${esc(S.moreTitle)}</strong><span>${esc(S.moreText)}</span></span>${ICONS.arrowRight}</a>
        </div>
      </section>
    </main>

    <footer class="footer">
      <div class="wrap">
        <a class="brand" href="${S.path}" aria-label="${esc(S.home)}">
          <img src="/brand/lockup.svg" alt="" width="79" height="20" />
          <span class="brand-sep" aria-hidden="true"></span>
          <span class="brand-blob">${wordmarkSvg({ height: 22 })}</span>
        </a>
        <small>© 2026 Coleoni</small>
        <nav aria-label="${esc(S.footerNav)}">
          <a class="nav-link" href="https://skills.coleoni.com${S.lang === 'pt' ? '/pt/' : '/'}">Skills</a>
          <a class="nav-link" href="${REPO}" target="_blank" rel="noopener noreferrer">GitHub</a>
          <a class="nav-link" href="https://coleoni.com" rel="noopener">coleoni.com</a>
        </nav>
      </div>
    </footer>
    <div class="toast" role="status" aria-live="polite" data-toast></div>
  </body>
</html>
`;
}
