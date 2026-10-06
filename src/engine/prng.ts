// Seeded randomness. Everything that looks random in a blob (blinks, idle glances,
// particles) comes from hash(seed, k), so the same seed always moves the same way
// and any frame can be computed on its own.

/** 32-bit mix (splitmix-style): a well spread integer for any pair of integers */
function mix(a: number, b: number): number {
  let x = (a ^ Math.imul(b + 0x9e3779b9, 0x85ebca6b)) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d) >>> 0;
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b) >>> 0;
  return (x ^ (x >>> 16)) >>> 0;
}

/** a number in [0, 1) from a seed and a key */
export const hash = (seed: number, k: number) => mix(seed | 0, k | 0) / 4294967296;

/** a small sequential generator, for building things once (random avatars) */
export function rng(seed: number) {
  let k = 0;
  return () => hash(seed, k++);
}

export const pick = <T>(r: () => number, list: readonly T[]): T => list[Math.floor(r() * list.length) % list.length];
