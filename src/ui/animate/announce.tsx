// What the page says to a screen reader when something changes that the focus
// does not show on its own (a clip moved, removed, added from the library, a new
// random look): one polite live region for the whole page, fed from anywhere.

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

/** the live region itself, mounted once by the app so it is there in either mode */
export function Announcer() {
  const { text, n } = useAnnouncement();
  return (
    <div role="status" aria-live="polite" aria-atomic className="sr-only">
      <span key={n}>{text}</span>
    </div>
  );
}
