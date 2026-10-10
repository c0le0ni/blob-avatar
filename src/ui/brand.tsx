import { useLayoutEffect, useMemo, useRef } from 'react';
import { animateWordmark, wordmarkSvg } from '../brand';
import { cn } from '../lib/cn';
import { C_PATH, LETTERS_PATH, LOCKUP_VIEW, SQUARE_PATH, SYMBOL_VIEW } from './lockup-paths';

/** the Coleoni lockup: the C and the letters take the text color, the square stays lime */
export function ColeoniLockup({ className }: { className?: string }) {
  return (
    <svg viewBox={LOCKUP_VIEW} aria-hidden="true" className={cn('h-5.5 w-auto', className)}>
      <path d={C_PATH} fill="currentColor" />
      <path d={SQUARE_PATH} fill="#aefa0e" />
      <path d={LETTERS_PATH} fill="currentColor" />
    </svg>
  );
}

/** the symbol alone, where the lockup would not fit */
export function ColeoniSymbol({ className }: { className?: string }) {
  return (
    <svg viewBox={SYMBOL_VIEW} aria-hidden="true" className={cn('h-5.5 w-auto', className)}>
      <path d={C_PATH} fill="currentColor" />
      <path d={SQUARE_PATH} fill="#aefa0e" />
    </svg>
  );
}

/** the Coleoni mark in one color (it takes the text color), for the "Made by" credit */
export function ColeoniMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 1368 1451" aria-hidden="true" focusable="false" fill="currentColor" className={cn('h-[1.15em] w-auto shrink-0', className)}>
      <path d="M39.623 464.368C79.0897 348.104 146.621 243.368 236.234 159.437C309.248 91.0534 395.087 38.2006 488.528 3.77908C523.8 -9.21393 561.264 12.6268 570.992 48.9337L637.412 296.811C647.084 332.912 625.405 369.49 591.881 386.014C530.659 416.185 477.398 464.197 440.71 527.743C342.039 698.639 400.595 917.164 571.495 1015.83C725.371 1104.67 917.857 1066.05 1026.7 932.729C1045.94 909.166 1079.39 900.053 1105.61 915.472L1333.32 1043.88C1366.3 1062.48 1378 1104.62 1356.14 1135.53C1298.76 1216.63 1225.63 1285.66 1140.88 1338.37C1036.61 1403.2 917.965 1441.32 795.445 1449.35C672.927 1457.38 550.319 1435.07 438.481 1384.4C326.644 1333.73 229.03 1256.26 154.286 1158.85C79.5412 1061.45 29.9728 947.108 9.97223 825.97C-10.0282 704.831 0.15635 580.63 39.623 464.368Z" />
      <path d="M939.869 294.101C939.869 256.514 970.341 226.043 1007.93 226.043H1252.94C1290.53 226.043 1321 256.514 1321 294.101V539.11C1321 576.699 1290.53 607.169 1252.94 607.169H1007.93C970.341 607.169 939.869 576.699 939.869 539.11V294.101Z" />
    </svg>
  );
}

/** the pixel "blob" wordmark, whose o breathes and blinks with the stage */
export function BlobWordmark({ onLive, className }: { onLive?: (draw: (now: number) => void, host: HTMLElement) => void; className?: string }) {
  const host = useRef<HTMLSpanElement>(null);
  const html = useMemo(() => wordmarkSvg({ live: true, letters: 'currentColor', height: 22 }), []);
  // before paint, so the intro can find the o on its first frame
  useLayoutEffect(() => {
    const el = host.current;
    if (!el || !onLive) return;
    const draw = animateWordmark(el);
    onLive((now) => draw(now / 1000), el);
  }, []);
  return <span ref={host} aria-hidden="true" className={cn('flex [&_svg]:h-5.5 [&_svg]:w-auto', className)} dangerouslySetInnerHTML={{ __html: html }} />;
}

/** the GitHub mark, as the Skills site draws it */
export function GithubIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
      <path d="M9 18c-4.51 2-5-2-7-2" />
    </svg>
  );
}
