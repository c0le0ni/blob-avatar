// The intro: the o of the "blob" wordmark lifts out of the top bar and grows into
// the big blob with a spring, opens its eyes, looks around and blinks, while the
// rest of the page comes in around it. About a second and a half; any click or key
// skips it, and a still stage (reduced motion, or the setting) never plays it.
// While it runs it drives the eyes; then following the cursor, if it is on, takes
// over.

import type { Player } from './player';

/** a damped spring from 0 to 1 as a CSS linear() easing, and how long it takes to settle */
function spring(stiffness = 210, damping = 17): { easing: string; duration: number } {
  const dt = 1 / 120;
  let x = 0, v = 0, t = 0;
  const pts: number[] = [0];
  while (t < 3) {
    v += (-stiffness * (x - 1) - damping * v) * dt;
    x += v * dt;
    t += dt;
    pts.push(x);
    if (Math.abs(x - 1) < 0.002 && Math.abs(v) < 0.02) break;
  }
  const step = Math.max(1, Math.floor(pts.length / 48));
  const kept = pts.filter((_, i) => i % step === 0);
  kept.push(1);
  return { easing: `linear(${kept.map((p) => Math.round(p * 1000) / 1000).join(', ')})`, duration: t * 1000 };
}

const ease = (u: number) => 1 - (1 - Math.min(1, Math.max(0, u))) ** 3;
const smooth = (u: number) => {
  const k = Math.min(1, Math.max(0, u));
  return k * k * (3 - 2 * k);
};

/** where the eyes look and how open they are, t seconds after the blob lands */
function face(t: number): { open: number; gaze: [number, number] } {
  const open = t < 0 ? 0 : ease(t / 0.18) * (t > 0.42 && t < 0.58 ? 0.15 + 0.85 * Math.abs((t - 0.5) / 0.08) : 1);
  const left: [number, number] = [-0.75, -0.15];
  const right: [number, number] = [0.75, -0.1];
  const mix = (a: [number, number], b: [number, number], u: number): [number, number] => [a[0] + (b[0] - a[0]) * smooth(u), a[1] + (b[1] - a[1]) * smooth(u)];
  const gaze = t < 0.1 ? mix([0, 0], left, (t - 0) / 0.1) : t < 0.38 ? mix(left, right, (t - 0.16) / 0.2) : mix(right, [0, 0], (t - 0.62) / 0.18);
  return { open, gaze };
}

interface IntroParts {
  player: Player;
  /** the element holding the stage's svg */
  stage: HTMLElement;
  /** the wordmark's o (its body and eyes) */
  o: Element[];
  /** what comes in around the blob, in order */
  chrome: { el: Element; from: string }[];
  onDone: () => void;
}

export function runIntro({ player, stage, o, chrome, onDone }: IntroParts): () => void {
  const anims: Animation[] = [];
  const body = o[0];
  const oBox = body?.getBoundingClientRect();
  const sBox = stage.getBoundingClientRect();
  const FLY = 0.22;
  const sp = spring();
  const land = FLY + sp.duration / 1000 * 0.55;

  // the stage starts as the o: same place, same size (the body is 62% of the stage)
  if (oBox && oBox.width > 0 && sBox.width > 0) {
    const dx = oBox.left + oBox.width / 2 - (sBox.left + sBox.width / 2);
    const dy = oBox.top + oBox.height / 2 - (sBox.top + sBox.height / 2);
    const k = oBox.width / (sBox.width * 0.62);
    // it travels without overshooting, and its size springs
    anims.push(stage.animate([{ translate: `${dx}px ${dy}px` }, { translate: '0 0' }], { duration: 620, delay: FLY * 1000, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'backwards' }));
    anims.push(stage.animate([{ scale: String(k) }, { scale: '1' }], { duration: sp.duration, delay: FLY * 1000, easing: sp.easing, fill: 'backwards' }));
    // the o leaves the wordmark as the blob takes off, and a new one grows back
    for (const el of o) {
      anims.push(el.animate([{ opacity: 1 }, { opacity: 0, offset: 0.001 }, { opacity: 0, offset: 0.7 }, { opacity: 1 }], { duration: (land + 0.35) * 1000, delay: FLY * 1000, fill: 'backwards' }));
    }
  } else {
    anims.push(stage.animate([{ transform: 'scale(0.1)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: sp.duration, easing: sp.easing, fill: 'backwards' }));
  }

  chrome.forEach(({ el, from }, i) => {
    anims.push(el.animate([{ opacity: 0, transform: from }, { opacity: 1, transform: 'none' }], { duration: 420, delay: (land + 0.02 + i * 0.06) * 1000, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'backwards' }));
  });

  // the eyes: closed while flying, then open, a look around and a blink
  const t0 = performance.now();
  let raf = 0;
  const end = land + 0.82;
  const tick = (now: number) => {
    const t = (now - t0) / 1000;
    const f = face(t - land);
    player.input = { open: f.open, gaze: f.gaze };
    if (t < end) raf = requestAnimationFrame(tick);
    else finish();
  };
  raf = requestAnimationFrame(tick);

  let over = false;
  function finish() {
    if (over) return;
    over = true;
    cancelAnimationFrame(raf);
    for (const a of anims) {
      try {
        a.finish();
      } catch {}
    }
    player.blend();
    player.input = null;
    window.removeEventListener('pointerdown', finish, true);
    window.removeEventListener('keydown', finish, true);
    onDone();
  }
  window.addEventListener('pointerdown', finish, true);
  window.addEventListener('keydown', finish, true);
  return finish;
}
