// The stage redraws every frame, so the screen recorder keeps only an empty box
// for it (rr-block, see styles.css). This keeps one CSS rule up to date with the
// blob at rest, as an image, and the rule matches only that empty box: a recording
// shows what the person was making, and the live page never draws it.

import { useEffect } from 'react';
import { frame, type BlobState } from 'blob-avatar/engine';
import { toSvgString } from 'blob-avatar/render/svg';

export const STAGE_CLASS = 'blob-stage';

/** the rule that paints the stage's box in a recording */
export function stillRule(s: BlobState): string {
  const svg = toSvgString(frame(s, 0, { still: true }), { size: 512, bg: null, round: false });
  return `.${STAGE_CLASS}.rr-block:empty{background:url("data:image/svg+xml,${encodeURIComponent(svg)}") center/contain no-repeat}`;
}

export function useRecordingStill(s: BlobState) {
  useEffect(() => {
    // a color dragged across the picker changes the blob many times a second: the
    // recording takes the look it settles on
    const timer = setTimeout(() => {
      let style = document.getElementById('recording-still');
      if (!style) {
        style = document.createElement('style');
        style.id = 'recording-still';
        document.head.appendChild(style);
      }
      const rule = stillRule(s);
      if (style.textContent !== rule) style.textContent = rule;
    }, 400);
    return () => clearTimeout(timer);
  }, [s]);
}
