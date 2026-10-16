// The animations to add, as tiles like the look's: one plays under the pointer, and
// a press adds it after the picked clip (or at the end).

import { useEffect, useMemo, useRef } from 'react';
import { ANIMS, DEFAULT_DUR, MAX_CLIPS, frame, type Anim, type BlobState, type Clip } from 'blob-avatar/engine';
import type { Strings } from '../../i18n/strings';
import { cn } from '../../lib/cn';
import { LiveSvg } from 'blob-avatar/render/svg';
import { toast } from '../hooks';
import { Tooltip, TooltipContent, TooltipTrigger } from '../primitives/tooltip';
import { FULL_VIEW, animLook, animThumb } from '../site';
import { secs } from './format';

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** the thumbnail plays under the pointer: it zooms out from the still to the whole blob and loops */
function useHoverPlay(look: BlobState, anim: Anim, thumb: { svg: string; view: string }) {
  const art = useRef<HTMLSpanElement>(null);
  const run = useRef<number | null>(null);
  const stop = () => {
    if (run.current === null) return;
    cancelAnimationFrame(run.current);
    run.current = null;
    if (art.current) art.current.innerHTML = thumb.svg;
  };
  const start = () => {
    if (run.current !== null || !art.current || reducedMotion()) return;
    const live = new LiveSvg();
    live.el.setAttribute('width', '100%');
    live.el.setAttribute('height', '100%');
    live.el.style.overflow = 'hidden';
    // played every frame: the screen recorder keeps only its box (rr-block)
    live.el.classList.add('rr-block');
    const s = animLook(look, anim);
    const L = DEFAULT_DUR[anim] + 0.9;
    const from = thumb.view.split(' ').map(Number);
    const to = FULL_VIEW.split(' ').map(Number);
    const t0 = performance.now();
    const tick = (now: number) => {
      const t = (now - t0) / 1000;
      const u = 1 - (1 - Math.min(1, t / 0.35)) ** 3;
      live.el.setAttribute('viewBox', from.map((v, i) => v + (to[i] - v) * u).join(' '));
      live.update(frame(s, t % L, { gaze: [0, 0] }));
      run.current = requestAnimationFrame(tick);
    };
    art.current.replaceChildren(live.el);
    run.current = requestAnimationFrame(tick);
  };
  // a new look while playing: the still takes over again
  useEffect(() => stop, [thumb.svg]);
  return { art, start, stop };
}

const TILE = cn(
  'group/tile relative flex w-full min-w-0 flex-col items-center gap-1 rounded-lg px-1 pt-1.5 pb-1.5 text-2xs font-medium text-foreground-muted outline-offset-0',
  'transition-[background-color,color,box-shadow] duration-(--motion-normal) hover:bg-hover hover:text-foreground',
);

interface TileProps {
  anim: Anim;
  look: BlobState;
  thumb: { svg: string; view: string };
  full: boolean;
  /** the picked clip's name, which a new one goes after */
  after: string | null;
  S: Strings;
  onAdd: (anim: Anim) => void;
}

function Tile({ anim, look, thumb, full, after, S, onAdd }: TileProps) {
  const name = S.anims[anim];
  const { art, start, stop } = useHoverPlay(look, anim, thumb);
  return (
    <li className="min-w-0">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            // the name says what the tile shows first, so voice control finds it by its words
            aria-label={S.addTile(name, secs(S, DEFAULT_DUR[anim]), after)}
            aria-disabled={full || undefined}
            className={cn(TILE, full && 'cursor-default opacity-50 hover:bg-transparent')}
            onClick={() => (full ? toast(S.full) : onAdd(anim))}
            onPointerEnter={(e) => e.pointerType !== 'touch' && start()}
            onPointerLeave={stop}
            onFocus={start}
            onBlur={stop}
          >
            <span ref={art} aria-hidden className="block size-12 transition-transform duration-(--motion-slow) ease-out-expo group-hover/tile:scale-108 group-active/tile:scale-95 [&_svg]:block" dangerouslySetInnerHTML={{ __html: thumb.svg }} />
            <span className="max-w-full truncate">{name}</span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">{full ? S.full : after ? S.addAfter(name, after) : S.addAnim(name)}</TooltipContent>
      </Tooltip>
    </li>
  );
}

interface LibraryProps {
  look: BlobState;
  clips: Clip[];
  after: string | null;
  S: Strings;
  onAdd: (anim: Anim) => void;
}

export function Library({ look, clips, after, S, onAdd }: LibraryProps) {
  const thumbs = useMemo(() => Object.fromEntries(ANIMS.map((a) => [a, animThumb(look, a)])) as Record<Anim, { svg: string; view: string }>, [look.color, look.shape, look.expression]);
  const full = clips.length >= MAX_CLIPS;
  return (
    <section aria-label={S.library} className="animate-panel-in">
      <ul className="grid grid-cols-4 gap-1.5">
        {ANIMS.map((a) => (
          <Tile key={a} anim={a} look={look} thumb={thumbs[a]} full={full} after={after} S={S} onAdd={onAdd} />
        ))}
      </ul>
    </section>
  );
}
