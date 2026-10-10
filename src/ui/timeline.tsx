import { GripVertical, Pause, Play, Plus, Trash2, X } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import { type BlobState } from '../engine';
import type { Strings } from '../i18n/strings';
import { cn } from '../lib/cn';
import { ALL, NEW, moveClip, removeClip, resizeClip, starts } from './cycles';
import type { Cycles } from './editor';
import { gestureKey } from './history';
import { toast } from './hooks';
import type { Player } from './player';
import { Button } from './primitives/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './primitives/select';
import { Tooltip, TooltipContent, TooltipTrigger } from './primitives/tooltip';
import { animThumb } from './site';

/** pixels per second on the track */
const PX = 52;
const MIN_W = 40;
const GAP = 4;

const clock = (t: number) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;

interface Drag {
  from: number;
  to: number;
  dx: number;
  /** where every clip's center was when the drag began */
  centers: number[];
  width: number;
  moved: boolean;
}

export function Timeline({ state, cycles, player, S, className }: { state: BlobState; cycles: Cycles; player: Player; S: Strings; className?: string }) {
  const clips = state.cycle;
  const { at } = starts(clips);
  const scroller = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const head = useRef<HTMLDivElement>(null);
  const time = useRef<HTMLSpanElement>(null);
  const [playing, setPlaying] = useState(player.isPlaying);
  const [drag, setDrag] = useState<Drag | null>(null);
  const focusNext = useRef<number | null>(null);
  const thumbs = useMemo(() => clips.map((c) => animThumb(state, c.anim).svg), [clips, state.color, state.shape, state.expression]);

  // the playhead and the clock follow the player without re-rendering anything
  useEffect(
    () =>
      player.subscribe((t, length) => {
        const els = list.current?.querySelectorAll<HTMLElement>('[data-clip]');
        if (!els?.length || !head.current) return;
        let i = 0;
        while (i < clips.length - 1 && t >= at[i + 1]) i++;
        const el = els[i];
        const x = el.offsetLeft + ((t - at[i]) / clips[i].dur) * el.offsetWidth;
        head.current.style.translate = `${x - 1}px 0`;
        els.forEach((e, k) => (e.dataset.current = String(k === i)));
        if (time.current) time.current.textContent = `${clock(t)} / ${clock(length)}`;
        // keep the playhead in view while it plays
        const sc = scroller.current;
        if (sc && player.isPlaying && !sc.matches(':hover') && (x < sc.scrollLeft || x > sc.scrollLeft + sc.clientWidth - 24)) sc.scrollTo({ left: Math.max(0, x - 24), behavior: 'smooth' });
      }),
    [player, clips],
  );

  useLayoutEffect(() => {
    if (focusNext.current === null) return;
    list.current?.querySelectorAll<HTMLElement>('[data-clip] [data-main]')[focusNext.current]?.focus();
    focusNext.current = null;
  });

  const toggle = () => {
    player.setPlaying(!player.isPlaying);
    setPlaying(player.isPlaying);
  };

  // ---------------------------------------------------------------- dragging

  function startDrag(event: ReactPointerEvent<HTMLElement>, i: number) {
    if (event.button !== 0) return;
    const el = event.currentTarget.closest<HTMLElement>('[data-clip]');
    const els = [...(list.current?.querySelectorAll<HTMLElement>('[data-clip]') ?? [])];
    if (!el) return;
    const x0 = event.clientX;
    const centers = els.map((e) => e.offsetLeft + e.offsetWidth / 2);
    const width = el.offsetWidth;
    let d: Drag = { from: i, to: i, dx: 0, centers, width, moved: false };
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    const move = (e: PointerEvent) => {
      const dx = e.clientX - x0;
      if (!d.moved && Math.abs(dx) < 4) return;
      const c = centers[i] + dx;
      let to = 0;
      centers.forEach((k, j) => j !== i && k < c && to++);
      d = { ...d, dx, to, moved: true };
      setDrag(d);
    };
    const end = () => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', end);
      target.removeEventListener('pointercancel', end);
      setDrag(null);
      if (d.moved) {
        if (d.to !== d.from) cycles.change((cs) => moveClip(cs, d.from, d.to));
      } else player.seek(at[i]);
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', end);
    target.addEventListener('pointercancel', end);
  }

  function startResize(event: ReactPointerEvent<HTMLElement>, i: number) {
    if (event.button !== 0) return;
    event.stopPropagation();
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    const x0 = event.clientX;
    const d0 = clips[i].dur;
    // the whole stretch is one undo step
    const key = gestureKey('resize');
    const move = (e: PointerEvent) => cycles.change((cs) => resizeClip(cs, i, d0 + (e.clientX - x0) / PX), key);
    const end = () => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', end);
      target.removeEventListener('pointercancel', end);
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', end);
    target.addEventListener('pointercancel', end);
  }

  /** how far a clip slides aside while another one is dragged over its place */
  function shift(k: number) {
    if (!drag?.moved) return 0;
    if (k === drag.from) return drag.dx;
    if (drag.from < drag.to && k > drag.from && k <= drag.to) return -(drag.width + GAP);
    if (drag.from > drag.to && k < drag.from && k >= drag.to) return drag.width + GAP;
    return 0;
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, i: number) {
    const k = event.key;
    const step = k === 'ArrowRight' ? 1 : k === 'ArrowLeft' ? -1 : 0;
    if (k === 'Delete' || k === 'Backspace') {
      event.preventDefault();
      focusNext.current = Math.min(i, clips.length - 2);
      cycles.change((cs) => removeClip(cs, i));
    } else if (step && event.altKey) {
      event.preventDefault();
      const to = Math.max(0, Math.min(clips.length - 1, i + step));
      focusNext.current = to;
      cycles.change((cs) => moveClip(cs, i, to), 'move');
    } else if (step && event.shiftKey) {
      event.preventDefault();
      cycles.change((cs) => resizeClip(cs, i, cs[i].dur + step * 0.1), `resize:${i}`);
    } else if (step) {
      event.preventDefault();
      list.current?.querySelectorAll<HTMLElement>('[data-clip] [data-main]')[Math.max(0, Math.min(clips.length - 1, i + step))]?.focus();
    }
  }

  const activeName = cycles.active === ALL ? S.allAnimations : S.cycleName(cycles.saved.find((c) => c.id === cycles.active)?.n ?? 1);

  return (
    <section aria-label={S.timeline} className={cn('flex min-w-0 flex-col gap-2 rounded-xl border border-border bg-surface p-2 shadow-lg', className)}>
      <div className="flex items-center gap-2 px-0.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="size-8 touch:size-10" aria-label={playing ? S.pause : S.play} onClick={toggle}>
              {playing ? <Pause aria-hidden className="fill-current" /> : <Play aria-hidden className="fill-current" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{playing ? S.pause : S.play}</TooltipContent>
        </Tooltip>
        <span ref={time} className="font-mono text-xs text-foreground-muted tabular-nums" aria-hidden>
          0:00.0
        </span>
        <div className="ml-auto flex min-w-0 items-center gap-1">
          <Select value={cycles.active} onValueChange={cycles.select}>
            <SelectTrigger aria-label={S.cycle} className="h-8 w-44 min-w-0 max-sm:w-36 touch:h-10">
              <SelectValue>{activeName}</SelectValue>
            </SelectTrigger>
            <SelectContent align="end">
              <SelectItem value={ALL}>{S.allAnimations}</SelectItem>
              {cycles.saved.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {S.cycleName(c.n)}
                </SelectItem>
              ))}
              <div role="separator" className="mx-1.5 my-1 h-px bg-border" />
              <SelectItem value={NEW}>
                <span className="flex items-center gap-1.5">
                  <Plus aria-hidden className="size-3.5" />
                  {S.newCycle}
                </span>
              </SelectItem>
            </SelectContent>
          </Select>
          {cycles.active === ALL ? null : (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="size-8 animate-pop-in touch:size-10" aria-label={S.deleteCycle} onClick={() => toast(S.cycleDeleted, { label: S.undo, run: cycles.remove() })}>
                  <Trash2 aria-hidden />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{S.deleteCycle}</TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>
      <div ref={scroller} className="relative overflow-x-auto overscroll-x-contain pb-0.5 [scrollbar-width:thin]">
        <p id="clip-help" className="sr-only">
          {S.clipHelp}
        </p>
        <div ref={list} role="list" aria-label={S.clips} className="relative flex w-max gap-1 pt-2 pr-2 pb-1">
          {clips.map((c, i) => {
            const name = S.anims[c.anim];
            const dragged = drag?.moved && drag.from === i;
            return (
              <div
                key={`${i}-${c.anim}`}
                role="listitem"
                data-clip
                className={cn(
                  'group/clip @container relative flex h-12 shrink-0 items-stretch rounded-lg border border-border bg-surface-raised text-xs',
                  'data-[current=true]:border-foreground-subtle',
                  dragged ? 'z-10 shadow-lg' : 'transition-[translate] duration-(--motion-slow) ease-out-expo',
                )}
                style={{ width: Math.max(MIN_W, c.dur * PX), translate: `${shift(i)}px 0` }}
              >
                <button
                  type="button"
                  data-main
                  aria-label={S.clipLabel(name, String(c.dur))}
                  aria-describedby="clip-help"
                  className={cn('flex min-w-0 flex-1 touch-none items-center gap-1 rounded-[inherit] pr-2.5 pl-0.5 text-left', dragged ? 'cursor-grabbing' : 'cursor-grab')}
                  onPointerDown={(e) => startDrag(e, i)}
                  onKeyDown={(e) => onKeyDown(e, i)}
                  onClick={(e) => e.detail === 0 && player.seek(at[i])}
                >
                  <GripVertical aria-hidden className="size-3.5 shrink-0 text-foreground-subtle @max-[64px]:hidden" />
                  <span aria-hidden className="size-7 shrink-0 @max-[96px]:hidden [&_svg]:block" dangerouslySetInnerHTML={{ __html: thumbs[i] }} />
                  <span className="flex min-w-0 flex-col leading-tight @max-[52px]:hidden">
                    <span className="truncate font-medium text-foreground">{name}</span>
                    <span className="font-mono text-2xs text-foreground-subtle tabular-nums">{S.seconds(c.dur.toFixed(1))}</span>
                  </span>
                </button>
                {clips.length > 1 ? (
                  <button
                    type="button"
                    aria-label={S.remove(name)}
                    className="absolute -top-1.5 -right-1.5 z-10 grid size-4.5 scale-75 place-items-center rounded-full border border-border-strong bg-surface-raised text-foreground-muted opacity-0 shadow-sm transition-[opacity,scale] duration-(--motion-normal) ease-out-expo group-focus-within/clip:scale-100 group-focus-within/clip:opacity-100 group-hover/clip:scale-100 group-hover/clip:opacity-100 hover:text-foreground touch:scale-100 touch:opacity-100"
                    onClick={() => cycles.change((cs) => removeClip(cs, i))}
                  >
                    <X aria-hidden className="size-3" strokeWidth={2.5} />
                  </button>
                ) : null}
                <span
                  aria-hidden
                  className="absolute top-0 -right-1 bottom-0 z-10 flex w-2.5 cursor-ew-resize touch-none items-center justify-center"
                  onPointerDown={(e) => startResize(e, i)}
                >
                  <span className="h-5 w-1 rounded-full bg-foreground-subtle opacity-0 transition-opacity group-hover/clip:opacity-60 hover:opacity-100!" />
                </span>
              </div>
            );
          })}
          <div ref={head} aria-hidden className="pointer-events-none absolute top-0 bottom-0 left-0 z-20 w-0.5 rounded-full bg-accent-emphasis shadow-[0_0_0_1px_var(--pulse-surface)]" />
        </div>
      </div>
    </section>
  );
}
