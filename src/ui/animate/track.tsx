// The track: the cycle's clips side by side, each as wide as it lasts, so the ruler
// above reads straight down onto them. A clip shows what fits: its thumbnail, then
// its length, then its name. The selected one gets a grip to move it and an edge to
// stretch it. One stop for Tab; the keys are in the timeline (see clipHelp).

import { GripVertical } from 'lucide-react';
import type { KeyboardEvent, RefObject } from 'react';
import type { Clip } from '../../engine';
import type { Strings } from '../../i18n/strings';
import { cn } from '../../lib/cn';
import { Tooltip, TooltipContent, TooltipTrigger } from '../primitives/tooltip';
import { secs } from './format';
import { dropAt, startsOf, xOf } from './layout';
import { useTrackDrag } from './use-track-drag';

interface TrackProps {
  clips: Clip[];
  /** each animation's thumbnail */
  thumbs: Record<string, string>;
  pps: number;
  pad: number;
  selected: number | null;
  /** the clip that holds the one Tab stop */
  focusable: number;
  scroller: RefObject<HTMLDivElement | null>;
  S: Strings;
  onSelect: (i: number) => void;
  onPick: (i: number) => void;
  onMove: (from: number, to: number) => void;
  onResize: (i: number, dur: number, key: string) => void;
  onResizing: (on: boolean) => void;
  onKeyDown: (e: KeyboardEvent<HTMLDivElement>, i: number) => void;
}

export function Track({ clips, thumbs, pps, pad, selected, focusable, scroller, S, onSelect, onPick, onMove, onResize, onResizing, onKeyDown }: TrackProps) {
  const durs = clips.map((c) => c.dur);
  const at = startsOf(durs);
  const { drag, resize, onClipDown, onEdgeDown } = useTrackDrag({ scroller, durs, pps, pad, onPick, onLift: onSelect, onDrop: onMove, onResize, onResizing });
  const length = at.length ? at[at.length - 1] + durs[durs.length - 1] : 0;
  const moving = drag && drag.to !== drag.from;

  return (
    <div className="relative rounded-lg bg-surface-sunken p-1" style={{ width: xOf(length, pps, pad) + pad }}>
      <div
        role="listbox"
        aria-label={S.clips}
        aria-orientation="horizontal"
        aria-describedby="clip-help"
        data-track
        className="relative h-12 touch:h-14"
        style={{ marginLeft: pad - 4 }}
      >
        {clips.map((c, i) => {
          const name = S.anims[c.anim];
          const on = i === selected;
          const lifted = drag?.from === i;
          const stretching = resize?.i === i;
          const w = c.dur * pps;
          return (
            <div
              key={i}
              id={`clip-${i}`}
              role="option"
              aria-selected={on}
              aria-label={S.clipLabel(name, S.secondsLong(S.num(c.dur.toFixed(1))))}
              tabIndex={i === focusable ? 0 : -1}
              data-clip
              data-on={on}
              className={cn(
                'group/clip absolute inset-y-0 touch-pan-x outline-none select-none [-webkit-touch-callout:none]',
                lifted ? 'z-20 cursor-grabbing' : 'cursor-pointer',
                on && 'z-10',
                // the clips slide to their new place, but never while a gesture holds them
                !drag && !resize && 'transition-[left,width] duration-(--motion-slow) ease-out-expo',
              )}
              style={{ left: at[i] * pps, width: w, translate: lifted ? `${drag.dx}px -3px` : undefined }}
              onPointerDown={(e) => onClipDown(e, i)}
              onFocus={() => !on && onSelect(i)}
              onKeyDown={(e) => onKeyDown(e, i)}
              onContextMenu={(e) => e.preventDefault()}
            >
              <Tooltip>
                <TooltipTrigger asChild>
                  <div
                    className={cn(
                      '@container/chip absolute inset-y-0 right-px left-px flex items-center overflow-hidden rounded-md border text-xs',
                      'border-border-strong bg-surface transition-[background-color,border-color,box-shadow,opacity] duration-(--motion-fast)',
                      'group-hover/clip:bg-surface-raised group-data-[current=true]/clip:bg-surface-raised',
                      'group-focus-visible/clip:outline-2 group-focus-visible/clip:outline-offset-1 group-focus-visible/clip:outline-ring',
                      on && 'border-foreground/75 bg-surface-raised shadow-lift',
                      lifted && 'shadow-lg',
                      moving && lifted && 'opacity-90',
                    )}
                  >
                    {on ? (
                      <span
                        aria-hidden
                        title={S.moveGrip(name)}
                        className="flex h-full w-3.5 shrink-0 cursor-grab touch-none items-center justify-center text-foreground-subtle hover:text-foreground @max-[55px]/chip:hidden touch:w-5"
                        onPointerDown={(e) => onClipDown(e, i, true)}
                      >
                        <GripVertical className="size-3" />
                      </span>
                    ) : null}
                    {/* what fits: the thumbnail, then the length, then the name (see the thresholds below) */}
                    <span className="@container flex h-full min-w-0 flex-1 items-center">
                      <span className={cn('flex min-w-0 flex-1 items-center gap-1 px-1 @max-[55px]:justify-center @max-[55px]:px-0 @min-[96px]:gap-1.5 @min-[96px]:px-1.5', on && '@min-[96px]:pl-0.5')}>
                        <span aria-hidden className="size-6 shrink-0 @max-[55px]:size-7 @max-[33px]:size-6 @min-[96px]:size-7 touch:@min-[96px]:size-8 [&_svg]:block" dangerouslySetInnerHTML={{ __html: thumbs[c.anim] }} />
                        <span className="flex min-w-0 flex-col leading-tight @max-[55px]:hidden">
                          <span className="truncate font-medium text-foreground @max-[95px]:hidden">{name}</span>
                          <span className="font-mono text-2xs whitespace-nowrap text-foreground-subtle tabular-nums">
                            {S.num(c.dur >= 10 ? '10' : c.dur.toFixed(1))}
                            <span className="@max-[95px]:hidden"> s</span>
                          </span>
                        </span>
                      </span>
                    </span>
                  </div>
                </TooltipTrigger>
                {drag || resize ? null : (
                  <TooltipContent side="top">
                    {name}
                    <span className="font-mono text-foreground-subtle tabular-nums">{secs(S, c.dur)}</span>
                  </TooltipContent>
                )}
              </Tooltip>
              {on ? (
                // the edge that stretches the clip: 16px to grab (24px under a finger), half of it outside
                <span
                  aria-hidden
                  title={S.resizeGrip(name)}
                  className="absolute inset-y-0 -right-[7px] z-10 flex w-4 cursor-ew-resize touch-none items-center justify-center touch:-right-[11px] touch:w-6"
                  onPointerDown={(e) => onEdgeDown(e, i)}
                >
                  <span className={cn('h-5 w-1 rounded-full bg-foreground-muted shadow-sm transition-[height,background-color] duration-(--motion-fast)', stretching ? 'h-7 bg-foreground' : 'group-hover/clip:h-6')} />
                </span>
              ) : null}
              {stretching ? (
                <span className="pointer-events-none absolute -top-7 right-0 z-30 translate-x-1/2 rounded-md border border-border-strong bg-surface-raised px-1.5 py-0.5 font-mono text-2xs text-foreground shadow-md tabular-nums">
                  {secs(S, resize.dur)}
                </span>
              ) : null}
            </div>
          );
        })}
        {moving ? (
          // where the clip will land
          <span aria-hidden className="pointer-events-none absolute -inset-y-1 z-30 w-0.5 -translate-x-1/2 rounded-full bg-accent-emphasis" style={{ left: dropAt(durs, drag.from, drag.to) * pps }} />
        ) : null}
      </div>
    </div>
  );
}
