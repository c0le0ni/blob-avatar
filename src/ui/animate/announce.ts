// What the timeline says to a screen reader when something changes that the focus
// does not show on its own (a clip moved, removed, added from the library): one
// polite live region for the whole page, fed from anywhere.

import { useSyncExternalStore } from 'react';

let said = { text: '', n: 0 };
const listeners = new Set<() => void>();

export function announce(text: string) {
  said = { text, n: said.n + 1 };
  listeners.forEach((f) => f());
}

const subscribe = (f: () => void) => {
  listeners.add(f);
  return () => void listeners.delete(f);
};

/** the latest announcement; `n` changes even when the same words are said twice */
export const useAnnouncement = () => useSyncExternalStore(subscribe, () => said);
