// Dev-only contact sheet: every shape, expression, color and animation, live.
// Not part of the build (vite.config only builds index.html and pt/index.html).
//   ?freeze=1.2        everything at t = 1.2 s
//   ?strip=thinking    one animation as 16 still frames
//   ?wordmark          the logo, big, on dark and light

import { ANIMS, DEFAULT_DUR, DEFAULT_STATE, EXPRESSIONS, IDLE_CYCLE, PALETTE, SHAPES, frame, cloneState, type Anim, type BlobState } from './engine';
import { LiveSvg } from './render/svg';
import { wordmarkSvg } from './brand';

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

const base = (patch: Partial<BlobState>): BlobState => ({ ...cloneState(DEFAULT_STATE), cycle: IDLE_CYCLE, ...patch });
const clip = (anim: Anim): BlobState => base({ cycle: [{ anim, dur: DEFAULT_DUR[anim] }, { anim: 'idle', dur: 0.8 }], color: '#18181b' });

const strip = params.get('strip') as Anim | null;
if (params.has('wordmark')) {
  root.innerHTML = `<div style="display:grid;gap:24px;padding:24px">
    <div style="background:#0a0a0a;padding:40px;border:1px solid #222">${wordmarkSvg({ height: 120 })}</div>
    <div style="background:#f3eee4;padding:40px">${wordmarkSvg({ height: 120, letters: '#161616' })}</div>
  </div>`;
} else if (strip) {
  const dur = Number(params.get('dur') || DEFAULT_DUR[strip] || 2);
  const n = 16;
  section(strip, Array.from({ length: n }, (_, i) => ({ label: `${((i * dur) / n).toFixed(2)}s`, state: clip(strip) })));
  live.forEach((l, i) => l.svg.update(frame(l.state, (i * dur) / n)));
} else {
  section('Shapes', SHAPES.map((s) => ({ label: s, state: base({ shape: s }) })));
  section('Expressions', EXPRESSIONS.map((x) => ({ label: x, state: base({ expression: x, color: '#18181b' }) })));
  section('Colors', PALETTE.map((p) => ({ label: p.id, state: base({ color: p.hex }) })));
  section('Animations', ANIMS.map((a) => ({ label: a, state: clip(a) })));
  const t0 = performance.now();
  const tick = (now: number) => {
    const t = freeze ?? (now - t0) / 1000;
    for (const l of live) l.svg.update(frame(l.state, t));
    if (freeze === null) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
