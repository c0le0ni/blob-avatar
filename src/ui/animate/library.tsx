// The animations to add: each with its usual length and how many times the cycle
// already has it. Pressing one adds it after the selected clip (or at the end); the
// eye plays it on its own on the big stage first, with a pill to add it or stop.

import { Eye, Plus, Square } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import { ANIMS, DEFAULT_DUR, MAX_CLIPS, frame, type Anim, type BlobState, type Clip } from '../../engine';
import type { Strings } from '../../i18n/strings';
import { cn } from '../../lib/cn';
import { LiveSvg } from '../../render/svg';
import { toast } from '../hooks';
import { Button } from '../primitives/button';
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

interface ItemProps {
  anim: Anim;
  look: BlobState;
  thumb: { svg: string; view: string };
  count: number;
  full: boolean;
  previewing: boolean;
  /** the selected clip's name, which a new one goes after */
  after: string | null;
  S: Strings;
  onAdd: (anim: Anim) => void;
  onPreview: (anim: Anim | null) => void;
}

function Item({ anim, look, thumb, count, full, previewing, after, S, onAdd, onPreview }: ItemProps) {
  const name = S.anims[anim];
  const { art, start, stop } = useHoverPlay(look, anim, thumb);
  const add = after ? S.addAfter(name, after) : S.addAnim(name);
  const label = count ? `${add}. ${S.inCycle(count)}` : add;
  return (
    <li className="group/item @container relative min-w-0">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={label}
            aria-disabled={full || undefined}
            data-on={previewing}
            className={cn(
              'flex w-full min-w-0 flex-col items-center gap-1 rounded-lg px-1.5 pt-2.5 pb-2 text-center outline-offset-0',
              '@min-[140px]:flex-row @min-[140px]:gap-2.5 @min-[140px]:p-1.5 @min-[140px]:text-left',
              'transition-[background-color,box-shadow] duration-(--motion-normal) hover:bg-hover data-[on=true]:bg-surface-raised data-[on=true]:shadow-lift',
              full && 'cursor-default opacity-50 hover:bg-transparent',
            )}
            onClick={() => (full ? toast(S.full) : onAdd(anim))}
            onPointerEnter={(e) => e.pointerType !== 'touch' && start()}
            onPointerLeave={stop}
            onFocus={start}
            onBlur={stop}
          >
            <span
              ref={art}
              aria-hidden
              className="block size-10 shrink-0 transition-transform duration-(--motion-slow) ease-out-expo group-hover/item:scale-108 group-active/item:scale-95 [&_svg]:block"
              dangerouslySetInnerHTML={{ __html: thumb.svg }}
            />
            <span className="flex min-w-0 flex-col items-center leading-tight @min-[140px]:flex-1 @min-[140px]:items-start @min-[140px]:pr-4">
              <span className="text-xs font-medium text-pretty text-foreground">{name}</span>
              <span aria-hidden className="mt-0.5 flex items-center gap-1 font-mono text-2xs whitespace-nowrap text-foreground-subtle tabular-nums">
                {secs(S, DEFAULT_DUR[anim])}
                {count ? (
                  <>
                    <span>·</span>
                    <span>×{count}</span>
                  </>
                ) : null}
              </span>
            </span>
            {/* the press adds it: the + says so under the pointer */}
            <Plus
              aria-hidden
              strokeWidth={2.25}
              className="absolute top-2 right-2 size-3.5 text-foreground-subtle opacity-0 transition-opacity duration-(--motion-fast) group-hover/item:opacity-100 @max-[139px]:hidden touch:hidden"
            />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">{full ? S.full : add}</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={S.preview(name)}
            aria-pressed={previewing}
            className={cn(
              'absolute top-1 right-1 rounded-md text-foreground-subtle @min-[140px]:top-auto @min-[140px]:right-1.5 @min-[140px]:bottom-1.5 touch:size-8',
              'opacity-0 group-focus-within/item:opacity-100 group-hover/item:opacity-100 focus-visible:opacity-100 touch:opacity-100',
              'aria-pressed:bg-pressed aria-pressed:text-foreground aria-pressed:opacity-100',
            )}
            onClick={() => onPreview(previewing ? null : anim)}
          >
            <Eye aria-hidden />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">{S.preview(name)}</TooltipContent>
      </Tooltip>
    </li>
  );
}

interface LibraryProps {
  look: BlobState;
  clips: Clip[];
  previewing: Anim | null;
  after: string | null;
  S: Strings;
  onAdd: (anim: Anim) => void;
  onPreview: (anim: Anim | null) => void;
}

export function Library({ look, clips, previewing, after, S, onAdd, onPreview }: LibraryProps) {
  const thumbs = useMemo(() => Object.fromEntries(ANIMS.map((a) => [a, animThumb(look, a)])) as Record<Anim, { svg: string; view: string }>, [look.color, look.shape, look.expression]);
  const counts = useMemo(() => {
    const n: Partial<Record<Anim, number>> = {};
    for (const c of clips) n[c.anim] = (n[c.anim] ?? 0) + 1;
    return n;
  }, [clips]);
  const full = clips.length >= MAX_CLIPS;
  return (
    <section aria-labelledby="library-title" className="flex animate-panel-in flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3 px-1">
        <h2 id="library-title" className="text-sm font-medium text-foreground">
          {S.library}
        </h2>
        <span className="min-w-0 truncate text-2xs text-foreground-subtle">{full ? S.full : after ? S.addsAfter(after) : S.addsAtEnd}</span>
      </div>
      <ul className="grid grid-cols-3 gap-1 md:grid-cols-2">
        {ANIMS.map((a) => (
          <Item key={a} anim={a} look={look} thumb={thumbs[a]} count={counts[a] ?? 0} full={full} previewing={previewing === a} after={after} S={S} onAdd={onAdd} onPreview={onPreview} />
        ))}
      </ul>
    </section>
  );
}

/** over the stage while an animation plays on its own: what it is, add it, or stop */
export function AuditionPill({ anim, full, S, onAdd, onStop }: { anim: Anim; full: boolean; S: Strings; onAdd: () => void; onStop: () => void }) {
  return (
    <div className="pointer-events-auto flex animate-toast-in items-center gap-1 rounded-lg border border-border-strong bg-surface-raised py-1 pr-1 pl-2.5 text-sm font-medium whitespace-nowrap text-foreground shadow-lg">
      <Eye aria-hidden className="size-3.5 shrink-0 text-foreground-subtle" />
      <span className="mr-1">{S.previewing(S.anims[anim])}</span>
      <span aria-hidden className="h-4 w-px shrink-0 bg-border-strong" />
      <Button variant="ghost" size="sm" className="text-sm text-foreground aria-disabled:opacity-50" aria-disabled={full || undefined} onClick={() => (full ? toast(S.full) : onAdd())}>
        <Plus aria-hidden className="size-3.5!" />
        {S.add}
      </Button>
      <Button variant="ghost" size="sm" className="text-sm" aria-keyshortcuts="Escape" onClick={onStop}>
        <Square aria-hidden className="size-3! fill-current" />
        {S.stop}
      </Button>
    </div>
  );
}
