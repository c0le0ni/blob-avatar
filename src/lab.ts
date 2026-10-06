// Dev-only contact sheet: every shape, eye style, expression and animation, live.
// Not part of the build (vite.config only builds index.html and pt/index.html).

import { ANIMS, DEFAULT_STATE, EXPRESSIONS, EYES, frame, SHAPES, cloneState, type BlobState } from './engine';
import { LiveSvg } from './render/svg';

const root = document.getElementById('lab')!;
const params = new URLSearchParams(location.search);
const freeze = params.has('freeze') ? Number(params.get('freeze')) : null;
const live: { svg: LiveSvg; state: BlobState }[] = [];

function section(title: string, items: { label: string; state: BlobState }[]) {
  const h = document.createElement('h2');
  h.textContent = title;
  const row = document.createElement('div');
  row.className = 'row';
  for (const it of items) {
    const fig = document.createElement('figure');
    const box = document.createElement('div');
    const svg = new LiveSvg();
    box.appendChild(svg.el);
    const cap = document.createElement('figcaption');
    cap.textContent = it.label;
    fig.append(box, cap);
    row.appendChild(fig);
    live.push({ svg, state: it.state });
  }
  root.append(h, row);
}

const base = (patch: Partial<BlobState>): BlobState => ({ ...cloneState(DEFAULT_STATE), seq: [{ anim: 'idle', dur: 3 }], ...patch });
const COLORS = ['#aefa0e', '#f3eee4', '#161616', '#ff6a5c', '#4ea3ff', '#ffd23f', '#8a6cff', '#3ddc97', '#ff7ac4', '#ff9a3c'];

section('Shapes', SHAPES.map((s, i) => ({ label: s, state: base({ shape: s, color: COLORS[i % COLORS.length], seed: i + 3 }) })));
section('Eye styles', EYES.map((e, i) => ({ label: e, state: base({ eyes: e, seed: i + 20 }) })));
section('Expressions', EXPRESSIONS.map((x, i) => ({ label: x, state: base({ expression: x, color: '#f3eee4', seed: i + 40 }) })));
section('Hole eyes', SHAPES.map((s, i) => ({ label: s, state: base({ shape: s, eyeMode: 'hole', color: COLORS[(i + 3) % COLORS.length], seed: i + 60 }) })));
section('Animations', ANIMS.map((a, i) => ({ label: a, state: base({ seq: [{ anim: a, dur: [3, 1.2, 1.6, 1.4, 3, 1.4, 1.6, 1.2, 2.4, 2.4, 4, 2.4, 1.6, 2.4, 1.2][i] }, { anim: 'idle', dur: 0.8 }], seed: i + 80, color: COLORS[i % COLORS.length] }) })));

const t0 = performance.now();
function tick(now: number) {
  const t = freeze ?? (now - t0) / 1000;
  for (const l of live) l.svg.update(frame(l.state, t));
  if (freeze === null) requestAnimationFrame(tick);
}
if (!params.get('strip')) requestAnimationFrame(tick);

// ?strip=hop renders one clip as a row of still frames, to check the motion
const strip = params.get('strip');
if (strip) {
  root.innerHTML = '';
  const anim = strip as BlobState['seq'][number]['anim'];
  const dur = Number(params.get('dur') || 1.6);
  const n = 16;
  const items = Array.from({ length: n }, (_, i) => ({ label: `${((i * dur) / n).toFixed(2)}s`, state: base({ seq: [{ anim, dur }], seed: 5 }) }));
  live.length = 0;
  section(strip, items);
  live.forEach((l, i) => l.svg.update(frame(l.state, (i * dur) / n)));
}

// ?wordmark shows the logo big, on dark and light, for checking and exporting
import { wordmarkSvg } from './brand';
if (params.has('wordmark')) {
  root.innerHTML = `<div id="wm" style="display:grid;gap:24px;padding:24px">
    <div style="background:#0a0a0a;padding:40px;border:1px solid #222">${wordmarkSvg({ height: 120 })}</div>
    <div style="background:#f3eee4;padding:40px">${wordmarkSvg({ height: 120, letters: '#161616' })}</div>
    <div style="background:#0a0a0a;padding:20px">${wordmarkSvg({ height: 28 })}</div>
  </div>`;
}
