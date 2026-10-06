// Small numeric helpers shared by the whole engine. No DOM, no state.

export const TAU = Math.PI * 2;

export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const invLerp = (a: number, b: number, v: number) => (a === b ? 0 : (v - a) / (b - a));
export const smooth = (t: number) => {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
};
export const fract = (v: number) => v - Math.floor(v);
/** positive modulo */
export const mod = (v: number, m: number) => ((v % m) + m) % m;

export type Ease = (t: number) => number;

export const ease = {
  linear: ((t) => t) as Ease,
  in: ((t) => t * t * t) as Ease,
  out: ((t) => 1 - (1 - t) ** 3) as Ease,
  inOut: ((t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)) as Ease,
  sine: ((t) => 0.5 - 0.5 * Math.cos(Math.PI * t)) as Ease,
  /** overshoots then settles: the "jelly" landing */
  back: ((t) => {
    const c = 1.9;
    return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
  }) as Ease,
  /** a damped wobble that ends at 1 */
  spring: ((t) => 1 - Math.exp(-6 * t) * Math.cos(t * 13)) as Ease,
};

export type EaseName = keyof typeof ease;
