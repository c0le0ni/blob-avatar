// The Blob Avatar app: one state, a stage that plays it, controls that change it,
// the URL that carries it, and exports that take it away.

import { DEFAULT_DUR, DEFAULT_STATE, MAX_CLIPS, cloneState, frame, isHex, loopLength, type Anim, type BlobState } from './engine';
import { fromHash, randomState, toHash } from './engine/codec';
import { idleGaze } from './engine/motion';
import { LiveSvg } from './render/svg';
import { animateWordmark } from './brand';
import { stringsFor } from './i18n/strings';
import { animThumb, describe, embedCode, exprThumb, eyeThumb, loopText, montage, secs, shapeThumb } from './app/markup';
import { ICONS } from './app/icons';
import { langMenu, tabs, toast } from './app/ui';
import { copyPng, copySvg, downloadAnimatedSvg, downloadGif, downloadPng, downloadSvg } from './export';

const doc = document.documentElement;
doc.classList.remove('no-js');
const S = stringsFor(doc.lang);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel)!;
const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => [...root.querySelectorAll<T>(sel)];

// ---------------------------------------------------------------- state and history

let state: BlobState = location.hash.length > 1 ? fromHash(location.hash) : cloneState(DEFAULT_STATE);
const ui = { sel: 0, playing: !reduced, t: 0 };
const past: string[] = [];
let lastHash = toHash(state);
let burst = { key: '', at: 0 };

/**
 * Apply a change. Changes from one control in quick succession (a slider drag, a
 * color drag) count as one step for undo.
 */
function commit(next: BlobState, key = '') {
  const h = toHash(next);
  if (h === lastHash) return;
  const now = performance.now();
  const merge = key && burst.key === key && now - burst.at < 900;
  if (!merge) past.push(lastHash);
  if (past.length > 80) past.shift();
  burst = { key, at: now };
  lastHash = h;
  state = next;
  ui.sel = Math.min(ui.sel, state.seq.length - 1);
  changed();
}

const edit = (key: string, f: (s: BlobState) => void) => {
  const next = cloneState(state);
  f(next);
  commit(next, key);
};

function undo() {
  const h = past.pop();
  if (!h) return;
  lastHash = h;
  state = fromHash(h);
  burst = { key: '', at: 0 };
  ui.sel = Math.min(ui.sel, state.seq.length - 1);
  changed();
  syncControls();
}

// the URL follows the avatar, so the address bar is always a share link
let hashTimer = 0;
const writeHash = () => {
  clearTimeout(hashTimer);
  hashTimer = window.setTimeout(() => history.replaceState(null, '', `#${lastHash}`), 150);
};
window.addEventListener('hashchange', () => {
  const h = location.hash.slice(1);
  if (!h || h === lastHash) return;
  commit(fromHash(h));
  syncControls();
});

// ---------------------------------------------------------------- stage

const stage = $('[data-stage]');
const live = new LiveSvg();
stage.replaceChildren(live.el);
const progress = $('[data-progress]');
const clipsEl = $('[data-clips]');
const wordmark = animateWordmark($('[data-wordmark]'));

let pointer: [number, number] | null = null;
let pointerAt = 0;
window.addEventListener(
  'pointermove',
  (e) => {
    const r = stage.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const k = (v: number) => Math.max(-1, Math.min(1, v));
    pointer = [k((e.clientX - cx) / (innerWidth * 0.45)), k((e.clientY - cy) / (innerHeight * 0.45))];
    pointerAt = performance.now();
    wake();
  },
  { passive: true },
);
document.addEventListener('pointerleave', () => (pointer = null));

// the gaze follows a spring, so the eyes ease toward the cursor and back
const gaze = { x: 0, y: 0, vx: 0, vy: 0 };
function spring(target: [number, number], dt: number) {
  const w = 12;
  for (const [p, v, i] of [['x', 'vx', 0], ['y', 'vy', 1]] as const) {
    gaze[v] += ((target[i] - gaze[p]) * w * w - 2 * w * gaze[v]) * dt;
    gaze[p] += gaze[v] * dt;
  }
}

function clipAt(t: number) {
  const L = loopLength(state);
  let local = ((t % L) + L) % L;
  for (let i = 0; i < state.seq.length; i++) {
    if (local < state.seq[i].dur) return i;
    local -= state.seq[i].dur;
  }
  return state.seq.length - 1;
}
const clipStart = (i: number) => state.seq.slice(0, i).reduce((n, c) => n + c.dur, 0);

let hover: { anim: Anim; el: HTMLElement; svg: LiveSvg; t: number } | null = null;
let running = false;
let prev = 0;
let playingClip = -1;

function draw(dt: number) {
  const L = loopLength(state);
  if (ui.playing) ui.t = (ui.t + dt) % L;
  const target: [number, number] = pointer && performance.now() - pointerAt < 2600 ? pointer : idleGaze(ui.t, state.seed, L);
  if (ui.playing || pointer) spring(target, dt);
  live.update(frame(state, ui.t, { gaze: [gaze.x, gaze.y] }));
  progress.style.transform = `scaleX(${ui.t / L})`;
  const c = clipAt(ui.t);
  if (c !== playingClip) {
    playingClip = c;
    $$('.clip[data-i]', clipsEl).forEach((li) => li.classList.toggle('playing', Number(li.dataset.i) === c));
  }
  if (!reduced) wordmark(performance.now() / 1000, pointer && ui.playing ? [gaze.x, gaze.y] : null);
  if (hover) {
    hover.t += dt;
    const dur = DEFAULT_DUR[hover.anim];
    hover.svg.update(frame({ ...state, seq: [{ anim: hover.anim, dur }] }, hover.t % dur, { gaze: [0, 0] }), { kind: 'none', c1: '#000000', c2: '#000000', angle: 0 });
  }
}

function tick(now: number) {
  const dt = Math.min(0.05, (now - prev) / 1000);
  prev = now;
  draw(dt);
  const settling = Math.abs(gaze.vx) + Math.abs(gaze.vy) > 0.002 || (pointer !== null && performance.now() - pointerAt < 2600);
  if (ui.playing || settling || hover) requestAnimationFrame(tick);
  else running = false;
}

function wake() {
  if (running || document.hidden) return;
  running = true;
  prev = performance.now();
  requestAnimationFrame(tick);
}
document.addEventListener('visibilitychange', wake);

// ---------------------------------------------------------------- reflecting the state

let artKeys: Record<string, string> = {};
const visibleTab = () => $('[role=tab][aria-selected=true]').id.replace('tab-', '');

/** re-draw the thumbnails of a grid when something they show has changed */
function renderArt(force = false) {
  const s = state;
  const look = `${s.color}|${s.eyeMode}|${s.eyeColor}`;
  const grids: Record<string, [string, string, (v: string) => string]> = {
    shape: ['shape', `${look}|${s.eyes}|${s.expression}`, (v) => shapeThumb(s, v as BlobState['shape'])],
    eyes: ['face', `${look}|${s.shape}`, (v) => eyeThumb(s, v as BlobState['eyes'])],
    expr: ['face', `${look}|${s.shape}|${s.eyes}`, (v) => exprThumb(s, v as BlobState['expression'])],
    anims: ['motion', `${look}|${s.shape}|${s.eyes}|${s.expression}|${s.seed}`, (v) => animThumb(s, v as Anim)],
  };
  const tab = visibleTab();
  for (const [grid, [onTab, key, draw]] of Object.entries(grids)) {
    if (!force && onTab !== tab) continue;
    if (artKeys[grid] === key) continue;
    artKeys[grid] = key;
    const root = grid === 'anims' ? $('[data-anims]') : $(`[data-tiles="${grid}"]`);
    $$('[data-art]', root).forEach((el) => {
      if (hover && el === hover.el) return;
      el.innerHTML = draw(el.dataset.art!);
    });
  }
}

let artFrame = 0;
const scheduleArt = () => {
  cancelAnimationFrame(artFrame);
  artFrame = requestAnimationFrame(() => renderArt());
};

function renderMontage() {
  clipsEl.innerHTML = montage(state, S, ui.sel);
  playingClip = -1;
  $('[data-loop]').textContent = loopText(state, S);
  $('[data-anim-note]').textContent = S.loopNote(loopText(state, S));
  const c = state.seq[ui.sel];
  $('[data-clip-name]').textContent = S.anims[c.anim];
  const dur = $<HTMLInputElement>('#clip-dur');
  dur.value = String(c.dur);
  $('output[for=clip-dur]').textContent = secs(c.dur, S);
  $<HTMLButtonElement>('[data-act=earlier]').disabled = ui.sel === 0;
  $<HTMLButtonElement>('[data-act=later]').disabled = ui.sel === state.seq.length - 1;
  $<HTMLButtonElement>('[data-act=remove-sel]').disabled = state.seq.length < 2;
  $$<HTMLButtonElement>('[data-act=append]').forEach((b) => (b.disabled = state.seq.length >= MAX_CLIPS));
}

function renderEmbed() {
  $('[data-embed-code]').textContent = embedCode(state, $<HTMLInputElement>('#embed-gaze').checked);
}

function changed() {
  $<HTMLButtonElement>('[data-act=undo]').disabled = past.length === 0;
  stage.setAttribute('aria-label', S.stageLabel(describe(state, S)));
  renderMontage();
  renderEmbed();
  scheduleArt();
  writeHash();
  if (!running) draw(0);
}

/** put every control in line with the state (after undo, random, a pasted link) */
function syncControls() {
  const s = state;
  const check = (name: string, value: string) => $$<HTMLInputElement>(`input[name="${name}"]`).forEach((i) => (i.checked = i.value === value));
  check('shape', s.shape);
  check('eyes', s.eyes);
  check('expr', s.expression);
  check('mode', s.eyeMode);
  check('color', s.color);
  check('eyec', s.eyeColor === 'auto' ? 'auto' : 'custom');
  check('bg', s.bg.kind);
  setColorField('body-color', s.color);
  if (s.eyeColor !== 'auto') setColorField('eye-color', s.eyeColor);
  $('#eye-color').parentElement!.hidden = s.eyeColor === 'auto';
  setColorField('bg1', s.bg.c1);
  setColorField('bg2', s.bg.c2);
  $<HTMLInputElement>('#bg-angle').value = String(s.bg.angle);
  $('output[for=bg-angle]').textContent = `${s.bg.angle}°`;
  $('[data-bg-fields]').hidden = s.bg.kind === 'none';
  $('#bg2').parentElement!.hidden = s.bg.kind !== 'linear';
  $('[data-angle]').hidden = s.bg.kind !== 'linear';
}

function setColorField(id: string, hex: string) {
  $<HTMLInputElement>(`#${id}`).value = hex;
  $<HTMLInputElement>(`#${id}-hex`).value = hex;
}

// ---------------------------------------------------------------- controls

const panel = $('.panel');

panel.addEventListener('change', (e) => {
  const el = e.target as HTMLInputElement;
  if (el.type !== 'radio') return;
  const v = el.value;
  switch (el.name) {
    case 'shape': return edit('', (s) => (s.shape = v as BlobState['shape']));
    case 'eyes': return edit('', (s) => (s.eyes = v as BlobState['eyes']));
    case 'expr': return edit('', (s) => (s.expression = v as BlobState['expression']));
    case 'mode': return edit('', (s) => (s.eyeMode = v as BlobState['eyeMode']));
    case 'color':
      setColorField('body-color', v);
      return edit('', (s) => (s.color = v));
    case 'eyec':
      $('#eye-color').parentElement!.hidden = v === 'auto';
      return edit('', (s) => (s.eyeColor = v === 'auto' ? 'auto' : $<HTMLInputElement>('#eye-color').value));
    case 'bg':
      edit('', (s) => (s.bg.kind = v as BlobState['bg']['kind']));
      return syncControls();
    case 'size':
      $('.custom-size').hidden = v !== 'custom';
      if (v === 'custom') $<HTMLInputElement>('#custom-size').focus();
      return;
  }
});

// color fields: the picker and the hex box stay in step
function colorInput(id: string, apply: (s: BlobState, hex: string) => void) {
  const pick = $<HTMLInputElement>(`#${id}`);
  const text = $<HTMLInputElement>(`#${id}-hex`);
  pick.addEventListener('input', () => {
    text.value = pick.value;
    edit(id, (s) => apply(s, pick.value));
  });
  text.addEventListener('change', () => {
    const v = text.value.trim().replace(/^#?/, '#').toLowerCase();
    if (!isHex(v) || v.length !== 7) {
      text.value = pick.value;
      return;
    }
    text.value = pick.value = v;
    edit('', (s) => apply(s, v));
  });
}
colorInput('body-color', (s, v) => {
  s.color = v;
  $$<HTMLInputElement>('input[name=color]').forEach((i) => (i.checked = i.value === v));
});
colorInput('eye-color', (s, v) => (s.eyeColor = v));
colorInput('bg1', (s, v) => (s.bg.c1 = v));
colorInput('bg2', (s, v) => (s.bg.c2 = v));

$<HTMLInputElement>('#bg-angle').addEventListener('input', (e) => {
  const v = Number((e.target as HTMLInputElement).value);
  $('output[for=bg-angle]').textContent = `${v}°`;
  edit('angle', (s) => (s.bg.angle = v));
});

$<HTMLInputElement>('#clip-dur').addEventListener('input', (e) => {
  const v = Math.round(Number((e.target as HTMLInputElement).value) * 10) / 10;
  edit(`dur${ui.sel}`, (s) => (s.seq[ui.sel].dur = v));
});

$<HTMLInputElement>('#embed-gaze').addEventListener('change', renderEmbed);

const jumpTo = (i: number) => {
  ui.t = clipStart(i);
  if (!running) draw(0);
};

const actions: Record<string, (el: HTMLElement) => void | Promise<void>> = {
  random: () => {
    const next = randomState((Math.random() * 2 ** 31) | 0);
    next.bg = { ...state.bg };
    ui.sel = 0;
    ui.t = 0;
    commit(next);
    syncControls();
  },
  undo,
  pause: (b) => {
    ui.playing = !ui.playing;
    b.setAttribute('aria-pressed', String(!ui.playing));
    b.innerHTML = `${ui.playing ? ICONS.pause : ICONS.play}<span>${ui.playing ? S.pause : S.play}</span>`;
    wake();
  },
  share: async () => {
    history.replaceState(null, '', `#${lastHash}`);
    try {
      await navigator.clipboard.writeText(location.href);
      toast(S.linkCopied);
    } catch {
      toast(S.copyFailed);
    }
  },
  light: (b) => {
    const on = stage.classList.toggle('light');
    b.setAttribute('aria-pressed', String(on));
  },
  pick: (b) => {
    ui.sel = Number(b.dataset.i);
    renderMontage();
    tabs.select('motion');
    jumpTo(ui.sel);
  },
  remove: (b) => removeClip(Number(b.dataset.i)),
  'remove-sel': () => removeClip(ui.sel),
  add: () => {
    tabs.select('motion');
    $<HTMLElement>('[data-act=append]').focus();
  },
  append: (b) => {
    if (state.seq.length >= MAX_CLIPS) return toast(S.clipFull);
    const anim = b.dataset.anim as Anim;
    edit('', (s) => s.seq.push({ anim, dur: DEFAULT_DUR[anim] }));
    ui.sel = state.seq.length - 1;
    renderMontage();
    jumpTo(ui.sel);
  },
  earlier: () => moveClip(-1),
  later: () => moveClip(1),
  png: () => downloadPng(state, exportSize(), exportRound()),
  'copy-png': async () => toast((await copyPng(state, exportSize(), exportRound())) ? S.copied : S.copyFailed),
  svg: () => downloadSvg(state, exportRound()),
  'copy-svg': async () => toast((await copySvg(state, exportRound())) ? S.copied : S.copyFailed),
  gif: (b) => busy(b, () => downloadGif(state, Math.min(512, exportSize()), exportRound())),
  'anim-svg': (b) => busy(b, () => downloadAnimatedSvg(state, exportRound())),
  'copy-embed': async () => {
    try {
      await navigator.clipboard.writeText(embedCode(state, $<HTMLInputElement>('#embed-gaze').checked));
      toast(S.copied);
    } catch {
      toast(S.copyFailed);
    }
  },
};

document.addEventListener('click', (e) => {
  const el = (e.target as Element).closest<HTMLElement>('[data-act]');
  if (!el || (el as HTMLButtonElement).disabled) return;
  actions[el.dataset.act!]?.(el);
});

function removeClip(i: number) {
  if (state.seq.length < 2) return;
  edit('', (s) => s.seq.splice(i, 1));
  ui.sel = Math.max(0, Math.min(i, state.seq.length - 1));
  renderMontage();
  ($('[data-act=pick][aria-pressed=true]') as HTMLElement | null)?.focus();
}

function moveClip(step: -1 | 1) {
  const i = ui.sel, j = i + step;
  if (j < 0 || j >= state.seq.length) return;
  edit('', (s) => ([s.seq[i], s.seq[j]] = [s.seq[j], s.seq[i]]));
  ui.sel = j;
  renderMontage();
}

async function busy(b: HTMLElement, job: () => Promise<void>) {
  const btn = b as HTMLButtonElement;
  const label = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `${ICONS.download}<span>${S.working}</span>`;
  try {
    await job();
  } finally {
    btn.disabled = false;
    btn.innerHTML = label;
  }
}

function exportSize() {
  const v = $<HTMLInputElement>('input[name=size]:checked').value;
  if (v !== 'custom') return Number(v);
  const n = Math.round(Number($<HTMLInputElement>('#custom-size').value));
  return Math.max(16, Math.min(2048, n || 512));
}
const exportRound = () => $<HTMLInputElement>('input[name=frame]:checked').value === 'round';

// move tiles: hovering or focusing one plays it in place
const animsEl = $('[data-anims]');
function startHover(tile: HTMLElement) {
  const anim = tile.dataset.anim as Anim;
  if (hover?.anim === anim || reduced) return;
  stopHover();
  const el = $<HTMLElement>('[data-art]', tile);
  const svg = new LiveSvg();
  el.replaceChildren(svg.el);
  hover = { anim, el, svg, t: 0 };
  wake();
}
function stopHover() {
  if (!hover) return;
  hover.el.innerHTML = animThumb(state, hover.anim);
  hover = null;
}
animsEl.addEventListener('pointerover', (e) => {
  const tile = (e.target as Element).closest<HTMLElement>('[data-anim]');
  if (tile) startHover(tile);
});
animsEl.addEventListener('pointerleave', stopHover);
animsEl.addEventListener('focusin', (e) => {
  const tile = (e.target as Element).closest<HTMLElement>('[data-anim]');
  if (tile) startHover(tile);
});
animsEl.addEventListener('focusout', (e) => {
  if (!animsEl.contains(e.relatedTarget as Node)) stopHover();
});

// keyboard: Ctrl+Z / Cmd+Z undoes, outside text fields
document.addEventListener('keydown', (e) => {
  if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z' || e.shiftKey) return;
  const t = e.target as HTMLElement;
  if (t.matches('input[type=text], input[type=number], textarea')) return;
  e.preventDefault();
  undo();
});

// ---------------------------------------------------------------- boot

langMenu(reduced);
tabs.init(() => renderArt());
syncControls();
renderMontage();
renderEmbed();
stage.setAttribute('aria-label', S.stageLabel(describe(state, S)));
renderArt();
draw(0);
if (ui.playing) wake();
else {
  const b = $('[data-act=pause]');
  b.setAttribute('aria-pressed', 'true');
  b.innerHTML = `${ICONS.play}<span>${S.play}</span>`;
}
// the other tabs' thumbnails are drawn when the browser is idle
const idle = (window as Window & { requestIdleCallback?: (f: () => void) => void }).requestIdleCallback ?? ((f: () => void) => setTimeout(f, 200));
idle(() => renderArt(true));


