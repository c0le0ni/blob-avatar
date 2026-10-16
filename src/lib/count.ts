// Each export or copy is counted as an Umami event, so the counter (the v.js tag in
// index.html, cookieless) tells how many people take a blob away, and the Coleoni
// panel posts each one to Discord. The counter only runs on blob.coleoni.com
// (data-domains): in dev, in tests, when a blocker drops it or for the embed, nothing.

export const EVENTS = {
  png: 'export-png',
  svg: 'export-svg',
  gif: 'export-gif',
  anim: 'export-animated-svg',
  copyPng: 'copy-png',
  copySvg: 'copy-svg',
  link: 'copy-link',
  embed: 'copy-embed',
} as const;

export type Counted = keyof typeof EVENTS;

type Umami = { track(name: string): unknown };

export function count(id: Counted) {
  try {
    (globalThis as { umami?: Umami }).umami?.track(EVENTS[id]);
  } catch {
    // the counter never gets in the way of the export
  }
}
