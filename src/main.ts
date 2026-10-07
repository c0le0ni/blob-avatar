// The Blob Avatar app: one state, a stage that plays it, three modes that change it
// (customize, animations, settings), the link that carries it and the exports that
// take it away.

import { DEFAULT_DUR, DEFAULT_STATE, IDLE_CYCLE, MAX_CLIPS, cloneState, frame, loopLength, mixModels, type Anim, type BlobState, type RenderModel } from './engine';
import { fromHash, toHash } from './engine/codec';
import { LiveSvg } from './render/svg';
import { animateWordmark } from './brand';
import { stringsFor } from './i18n/strings';
import { animThumb, describe, embedCode, exprThumb, shapeThumb } from './app/markup';
import { popover, rail, toast } from './app/ui';
import { resolved, setTheme, themePref, watchSystem, type ThemePref } from './app/theme';
import { copyPng, copySvg, downloadAnimatedSvg, downloadGif, downloadPng, downloadSvg, type ExportOptions } from './export';

const doc = document.documentElement;
doc.classList.remove('no-js');
const S = stringsFor(doc.lang);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel)!;
const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => [...root.querySelectorAll<T>(sel)];

// ---------------------------------------------------------------- state

let state: BlobState = location.hash.length > 1 ? fromHash(location.hash) : cloneState(DEFAULT_STATE);
type Mode = 'customise' | 'animations' | 'settings';
let mode: Mode = 'customise';
const app = $('.app');

let hashTimer = 0;
function changed(writeHash = true) {
  clearTimeout(hashTimer);
  // the address bar follows the avatar, so it is always a link to it
  if (writeHash) hashTimer = window.setTimeout(() => history.replaceState(null, '', `#${toHash(state)}`), 150);
  stage.setAttribute('aria-label', S.stageLabel(describe(state, S)));
  scheduleArt();
}

window.addEventListener('hashchange', () => {
  const h = location.hash.slice(1);
  if (!h || h === toHash(state)) return;
  setLook(fromHash(h));
  syncControls();
});

// ---------------------------------------------------------------- stage

const stage = $('[data-stage]');
const live = new LiveSvg();
stage.replaceChildren(live.el);
const wordmark = animateWordmark($('[data-wordmark]'));

/** what the stage plays: the cycle while animating, breathing and glances otherwise */
const playing = (): BlobState => (mode === 'animations' ? state : { ...state, cycle: IDLE_CYCLE });

let t = 0;
let last = performance.now();
let shown: RenderModel | null = null;
// a change of shape, face or color morphs from what was on screen
let from: RenderModel | null = null;
let fromAt = 0;
const MORPH = 0.32;

function draw(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!reduced) t += dt;
  const s = playing();
  const L = loopLength(s) || 2.4;
  if (t > L) t %= L;
  let m = frame(s, t, reduced ? { still: true } : {});
  if (from) {
    const u = Math.min(1, (now - fromAt) / 1000 / MORPH);
    m = mixModels(from, m, 1 - (1 - u) ** 3);
    if (u >= 1) from = null;
  }
  live.update(m);
  shown = m;
  if (!reduced) wordmark(now / 1000);
}

function loop(now: number) {
  draw(now);
  requestAnimationFrame(loop);
}

function setLook(next: BlobState) {
  if (shown && !reduced) {
    from = shown;
    fromAt = performance.now();
  }
  state = next;
  changed();
  if (reduced) draw(performance.now());
}

const edit = (f: (s: BlobState) => void) => {
  const next = cloneState(state);
  f(next);
  setLook(next);
};

// ---------------------------------------------------------------- thumbnails

let artKeys: Record<string, string> = {};

/** re-draw a grid's thumbnails when something they show has changed */
function renderArt(force = false) {
  const s = state;
  const grids: [string, Mode, string, (v: string) => string][] = [
    ['shape', 'customise', `${s.color}|${s.expression}`, (v) => shapeThumb(s, v as BlobState['shape'])],
    ['expr', 'customise', `${s.color}|${s.shape}`, (v) => exprThumb(s, v as BlobState['expression'])],
    ['anims', 'animations', `${s.color}|${s.shape}|${s.expression}`, (v) => animThumb(s, v as Anim)],
  ];
  for (const [grid, on, key, art] of grids) {
    if (!force && on !== mode) continue;
    if (artKeys[grid] === key) continue;
    artKeys[grid] = key;
    const root = grid === 'anims' ? $('[data-anims]') : $(`input[name="${grid}"]`).closest('.grid')!;
    $$('[data-art]', root).forEach((el) => (el.innerHTML = art(el.dataset.art!)));
  }
}

let artFrame = 0;
const scheduleArt = () => {
  cancelAnimationFrame(artFrame);
  artFrame = requestAnimationFrame(() => renderArt());
};

// ---------------------------------------------------------------- customize

const customColor = $<HTMLInputElement>('#custom-color');
const customSwatch = customColor.closest<HTMLElement>('.swatch')!;

function syncControls() {
  const check = (name: string, value: string) => $$<HTMLInputElement>(`input[name="${name}"]`).forEach((i) => (i.checked = i.value === value));
  check('shape', state.shape);
  check('expr', state.expression);
  check('color', state.color);
  const own = !$$<HTMLInputElement>('input[name="color"]').some((i) => i.checked);
  customSwatch.classList.toggle('on', own);
  customSwatch.style.setProperty('--c', own ? state.color : 'transparent');
  if (own) customColor.value = state.color;
}

$('#panel-customise').addEventListener('change', (e) => {
  const el = e.target as HTMLInputElement;
  if (el.name === 'shape') edit((s) => (s.shape = el.value as BlobState['shape']));
  else if (el.name === 'expr') edit((s) => (s.expression = el.value as BlobState['expression']));
  else if (el.name === 'color') {
    edit((s) => (s.color = el.value));
    syncControls();
  }
});

customColor.addEventListener('input', () => {
  $$<HTMLInputElement>('input[name="color"]').forEach((i) => (i.checked = false));
  customSwatch.classList.add('on');
  customSwatch.style.setProperty('--c', customColor.value);
  state = { ...cloneState(state), color: customColor.value };
  changed();
});

// ---------------------------------------------------------------- animations

$('[data-anims]').addEventListener('click', (e) => {
  const tile = (e.target as Element).closest<HTMLElement>('[data-anim]');
  if (!tile) return;
  const anim = tile.dataset.anim as Anim;
  if (state.cycle.length >= MAX_CLIPS) return;
  const next = cloneState(state);
  next.cycle.push({ anim, dur: DEFAULT_DUR[anim] });
  state = next;
  // jump to the new animation, so it plays right away
  t = loopLength(state) - DEFAULT_DUR[anim];
  changed();
});

// ---------------------------------------------------------------- modes

const selectMode = rail((id) => {
  const prev = mode;
  mode = id as Mode;
  app.dataset.mode = mode;
  if (prev !== mode && (prev === 'animations' || mode === 'animations')) {
    // the stage switches between the idle loop and the cycle: start both from the top
    if (shown && !reduced) {
      from = shown;
      fromAt = performance.now();
    }
    t = 0;
  }
  renderArt();
});
void selectMode;

// ---------------------------------------------------------------- settings

function syncTheme() {
  const pref = themePref();
  $$<HTMLInputElement>('input[name="theme"]').forEach((i) => (i.checked = i.value === pref));
}

$('[data-act="theme"]').addEventListener('click', () => {
  setTheme(resolved() === 'light' ? 'dark' : 'light');
  syncTheme();
});
$('#panel-settings').addEventListener('change', (e) => {
  const el = e.target as HTMLInputElement;
  if (el.name === 'theme') setTheme(el.value as ThemePref);
});
watchSystem(syncTheme);

// the language choice is saved (it beats the automatic redirect) and keeps the avatar
$$<HTMLAnchorElement>('[data-lang]').forEach((a) =>
  a.addEventListener('click', () => {
    try {
      localStorage.setItem('coleoni-lang', a.dataset.lang!);
    } catch {}
    a.href = a.getAttribute('href')!.split('#')[0] + location.hash;
  }),
);

// ---------------------------------------------------------------- export

const EXPORT_KEY = 'coleoni-blob.export';
const exportPop = $('#export-pop');
const menu = popover($('.split-more'), exportPop, reduced);

function exportOptions(): ExportOptions {
  const size = $<HTMLInputElement>('input[name="size"]:checked').value;
  const custom = Math.round(Number($<HTMLInputElement>('#custom-size').value)) || 512;
  const bg = $<HTMLInputElement>('input[name="bg"]:checked').value === 'color' ? $<HTMLInputElement>('#bg-color').value : null;
  return { size: size === 'custom' ? Math.max(16, Math.min(2048, custom)) : Number(size), bg, round: $<HTMLInputElement>('#round').checked };
}

// the export options are remembered on this device
try {
  const saved = JSON.parse(localStorage.getItem(EXPORT_KEY) || 'null') as { size?: string; custom?: string; bg?: string; color?: string; round?: boolean } | null;
  if (saved) {
    $$<HTMLInputElement>('input[name="size"]').forEach((i) => (i.checked = i.value === saved.size));
    if (saved.custom) $<HTMLInputElement>('#custom-size').value = saved.custom;
    $$<HTMLInputElement>('input[name="bg"]').forEach((i) => (i.checked = i.value === (saved.bg ?? 'none')));
    if (saved.color) $<HTMLInputElement>('#bg-color').value = saved.color;
    $<HTMLInputElement>('#round').checked = !!saved.round;
    if (!$$<HTMLInputElement>('input[name="size"]').some((i) => i.checked)) $<HTMLInputElement>('input[name="size"][value="460"]').checked = true;
  }
} catch {}
exportPop.addEventListener('change', () => {
  try {
    localStorage.setItem(
      EXPORT_KEY,
      JSON.stringify({
        size: $<HTMLInputElement>('input[name="size"]:checked').value,
        custom: $<HTMLInputElement>('#custom-size').value,
        bg: $<HTMLInputElement>('input[name="bg"]:checked').value,
        color: $<HTMLInputElement>('#bg-color').value,
        round: $<HTMLInputElement>('#round').checked,
      }),
    );
  } catch {}
});
// typing a size or picking a color selects that option
$('#custom-size').addEventListener('focus', () => ($<HTMLInputElement>('input[name="size"][value="custom"]').checked = true));
$('#bg-color').addEventListener('input', () => ($<HTMLInputElement>('input[name="bg"][value="color"]').checked = true));

async function copyText(text: string, ok: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast(ok);
  } catch {
    toast(S.copyFailed);
  }
}

/** what an export takes: the cycle while animating, the idle loop otherwise */
const exported = () => (mode === 'animations' ? state : { ...state, cycle: IDLE_CYCLE });

const actions: Record<string, () => void | Promise<void>> = {
  png: () => downloadPng(state, exportOptions()),
  svg: () => downloadSvg(state, exportOptions()),
  'anim-svg': () => downloadAnimatedSvg(exported(), exportOptions()),
  gif: () => downloadGif(exported(), exportOptions()),
  'copy-png': async () => toast((await copyPng(state, exportOptions())) ? S.copied : S.copyFailed),
  'copy-svg': async () => toast((await copySvg(state, exportOptions())) ? S.copied : S.copyFailed),
  'copy-link': () => {
    history.replaceState(null, '', `#${toHash(state)}`);
    return copyText(location.href, S.linkCopied);
  },
  'copy-embed': () => copyText(embedCode(state), S.embedCopied),
};

$('.export').addEventListener('click', async (e) => {
  const el = (e.target as Element).closest<HTMLElement>('[data-act]');
  const run = el && actions[el.dataset.act!];
  if (!run || el.getAttribute('aria-busy') === 'true') return;
  el.setAttribute('aria-busy', 'true');
  try {
    await run();
  } finally {
    el.removeAttribute('aria-busy');
  }
  if (el.closest('.pop')) menu.close(true);
});

// ---------------------------------------------------------------- boot

syncControls();
syncTheme();
renderArt();
changed(false);
if (reduced) draw(performance.now());
else requestAnimationFrame(loop);
// the other modes' thumbnails are drawn when the browser is idle
const idle = (window as Window & { requestIdleCallback?: (f: () => void) => void }).requestIdleCallback ?? ((f: () => void) => setTimeout(f, 300));
idle(() => renderArt(true));
