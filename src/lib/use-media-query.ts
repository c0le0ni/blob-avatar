import { useCallback, useSyncExternalStore } from 'react';

/** a device people touch rather than point at: its primary input cannot hover, or is coarse */
export const TOUCH_QUERY = '(hover: none), (pointer: coarse)';

/** subscribes to a media query; the value is read synchronously on first render */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    [query],
  );
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches);
}
