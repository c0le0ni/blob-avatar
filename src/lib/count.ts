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

/** a visit that changed the blob: the look it left with */
export const MADE = 'made-blob';

export type Counted = keyof typeof EVENTS;

type Umami = { track(name: string, data?: Record<string, string>): unknown };
type Payload = { name?: string } & Record<string, unknown>;

const umami = () => (globalThis as { umami?: Umami }).umami;

// Umami keeps an event's text up to 500 characters
const data = (blob?: string) => (blob ? { blob: blob.slice(0, 500) } : undefined);

/** counts an export; `blob` is its hash, so Umami's event properties list the blobs taken away */
export function count(id: Counted, blob?: string) {
  try {
    umami()?.track(EVENTS[id], data(blob));
  } catch {
    // the counter never gets in the way of the export
  }
}

/**
 * The counter's before-send (data-before-send="umamiBeforeSend" on the tag): one
 * page view per visit. The editor writes the blob into the URL's # on every change,
 * and the counter would count each one as a view; events still carry that URL.
 */
export function oneViewPerVisit() {
  let viewed = false;
  return (type: string, payload: Payload) => {
    if (type !== 'event' || payload.name) return payload;
    if (viewed) return null;
    viewed = true;
    return payload;
  };
}

/** sends MADE when the page is left with a blob other than the one it opened with */
export function watchMade(read = () => location.hash.slice(1)) {
  let sent = read();
  const leave = () => {
    const blob = read();
    if (!blob || blob === sent) return;
    sent = blob;
    try {
      umami()?.track(MADE, data(blob));
    } catch {
      // nothing to do: the next leave tries again
    }
  };
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && leave());
  window.addEventListener('pagehide', leave);
}

export function installCounter() {
  (globalThis as { umamiBeforeSend?: unknown }).umamiBeforeSend = oneViewPerVisit();
  watchMade();
}
