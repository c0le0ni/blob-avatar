// The cycle in Animate: its name (the cycle menu) and length, and its animations as
// a row of cards under the stage, one size each, in the order they play. The one
// playing is lifted and fills as it goes. A press opens a clip in its modal; a drag
// moves it (a finger holds it first, so the row still scrolls). Every change goes
// through the editor, so each one is a step of undo.

import { Repeat } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { MAX_CLIPS, type BlobState, type Clip } from 'blob-avatar/engine';
import type { Strings } from '../../i18n/strings';
import { cn } from '../../lib/cn';
import { duplicateClip, moveClip, removeClip, resizeClip, starts, tellingMoment } from '../cycles';
import type { Cycles } from '../editor';
import { toast } from '../hooks';
import type { Player } from '../player';
import { animThumb } from '../site';
import { announce } from './announce';
import { ClipModal } from './clip-modal';
import { CycleMenu, savedName } from './cycle-menu';
import { secs } from './format';
import { clipAt, makeRoom } from './layout';
import { useTrackDrag } from './use-track-drag';

/** a card's width and the room after it, in px (w-19 and gap-1) */
const CARD = 76;
const PITCH = CARD + 4;
/** the row's own padding, before the first card */
const PAD = 4;

interface StoryboardProps {
  state: BlobState;
  cycles: Cycles;
  player: Player;
  S: Strings;
  selected: number | null;
  onSelect: (i: number | null) => void;
  looping: boolean;
  onLoop: (on: boolean) => void;
  className?: string;
}

export function Storyboard({ state, cycles, player, S, selected, onSelect, looping, onLoop, className }: StoryboardProps) {
  const clips = state.cycle;
  const durs = clips.map((c) => c.dur);
  const { at, length } = starts(clips);
  const scroller = useRef<HTMLDivElement>(null);
  const focusNext = useRef<number | null>(null);
  /** the clip that keeps the Tab stop when nothing is selected */
  const anchor = useRef(0);
  /** the clip open in the modal, and the last one shown, which stays while the modal leaves */
  const [open, setOpen] = useState<number | null>(null);
  const [shown, setShown] = useState(0);
  const leaving = useRef<Clip | null>(null);
  /** which ends of the row have more cards past them, for the fades */
  const [more, setMore] = useState({ start: false, end: false });
  const sel = selected !== null && selected < clips.length ? selected : null;
  if (sel !== null) anchor.current = sel;
  const focusable = Math.min(anchor.current, clips.length - 1);

  const thumbs = useMemo(() => {
    const out: Record<string, string> = {};
    for (const c of clips) out[c.anim] ??= animThumb(state, c.anim).svg;
    return out;
  }, [clips, state.color, state.shape, state.expression]);

  // the card playing and how far through it, frame by frame outside React
  const live = useRef({ durs, at });
  live.current = { durs, at };
  useEffect(() => {
    let current = -1;
    let fill: HTMLElement | null = null;
    let shownClips: unknown = null;
    return player.subscribe((t, _L, on) => {
      const { durs, at } = live.current;
      const sc = scroller.current;
      if (!sc) return;
      const i = clipAt(durs, t);
      if (i !== current || durs !== shownClips) {
        current = i;
        shownClips = durs;
        sc.querySelectorAll<HTMLElement>('[data-clip]').forEach((el, k) => (el.dataset.current = String(k === i)));
        fill = sc.querySelector<HTMLElement>(`#clip-${i} [data-fill]`);
      }
      if (fill) fill.style.scale = `${Math.min(1, Math.max(0, (t - at[i]) / durs[i]))} 1`;
      // the card playing stays in view, unless someone is working on the row
      const x = PAD + i * PITCH;
      if (on && !sc.matches(':hover') && !sc.contains(document.activeElement) && (x < sc.scrollLeft || x + CARD > sc.scrollLeft + sc.clientWidth)) sc.scrollTo({ left: Math.max(0, x - PITCH), behavior: 'smooth' });
    });
  }, [player]);

  // the fades say there are more cards past an end
  useLayoutEffect(() => {
    const sc = scroller.current!;
    const check = () => setMore({ start: sc.scrollLeft > 2, end: sc.scrollLeft + sc.clientWidth < sc.scrollWidth - 2 });
    const observer = new ResizeObserver(check);
    observer.observe(sc);
    sc.addEventListener('scroll', check, { passive: true });
    check();
    return () => {
      observer.disconnect();
      sc.removeEventListener('scroll', check);
    };
  }, [clips.length]);

  // a card that was moved, added or picked by the keys comes into view, and takes the focus when asked
  useLayoutEffect(() => {
    const sc = scroller.current;
    if (!sc || sel === null) return;
    const x = PAD + sel * PITCH;
    if (x - PAD < sc.scrollLeft) sc.scrollTo({ left: x - PAD, behavior: 'smooth' });
    else if (x + CARD + PAD > sc.scrollLeft + sc.clientWidth) sc.scrollTo({ left: x + CARD + PAD - sc.clientWidth, behavior: 'smooth' });
  }, [sel, clips.length]);

  useLayoutEffect(() => {
    if (focusNext.current === null) return;
    scroller.current?.querySelector<HTMLElement>(`#clip-${focusNext.current}`)?.focus({ preventScroll: true });
    focusNext.current = null;
  });

  // ---------------------------------------------------------------- what can be done to a clip

  const nameOf = (i: number) => S.anims[clips[i].anim];
  const change = (f: Parameters<Cycles['change']>[0], key?: string) => cycles.change(f, key);

  const select = (i: number) => {
    anchor.current = i;
    onSelect(i);
    // a looped clip is played from its start by the loop itself. Playing, the clip plays
    // from its start; paused, the stage shows its telling moment, as its card does
    if (!looping) player.seek(at[i] + (player.isPlaying ? 0 : tellingMoment(clips[i])));
  };

  const openClip = (i: number) => {
    if (sel !== i) select(i);
    setShown(i);
    setOpen(i);
  };

  const move = (from: number, to: number, key?: string) => {
    if (to === from) return;
    const name = nameOf(from);
    change((cs) => moveClip(cs, from, to), key);
    anchor.current = to;
    onSelect(to);
    focusNext.current = to;
    announce(S.said.moved(name, to + 1, clips.length));
  };

  const resize = (i: number, dur: number, key?: string) => change((cs) => resizeClip(cs, i, dur), key);

  const remove = (i: number, focus = false) => {
    if (clips.length <= 1) return;
    const name = nameOf(i);
    const fresh = change((cs) => removeClip(cs, i));
    const undo = cycles.undoLast();
    const next = Math.min(i, clips.length - 2);
    onSelect(next);
    if (focus) focusNext.current = next;
    toast(fresh ? `${S.said.removed(name)}. ${S.savedAs(savedName(fresh, S))}` : S.said.removed(name), { label: S.undo, run: undo });
    announce(S.said.removed(name));
  };

  const duplicate = (i: number, focus = false) => {
    if (clips.length >= MAX_CLIPS) return toast(S.full);
    change((cs) => duplicateClip(cs, i));
    if (focus) {
      onSelect(i + 1);
      focusNext.current = i + 1;
    }
    announce(S.said.duplicated(nameOf(i), i + 2, clips.length + 1));
  };

  const loop = (i: number, on = !(looping && sel === i)) => {
    if (sel !== i) select(i);
    onLoop(on);
    announce(on ? S.said.looping(nameOf(i)) : S.said.loopOff);
  };

  const { drag, onClipDown } = useTrackDrag({
    scroller,
    durs: clips.map(() => 1),
    pps: PITCH,
    pad: PAD,
    onPick: openClip,
    onLift: select,
    onDrop: move,
  });

  function onKey(e: KeyboardEvent<HTMLDivElement>, i: number) {
    const k = e.key;
    const dir = k === 'ArrowRight' ? 1 : k === 'ArrowLeft' ? -1 : 0;
    const last = clips.length - 1;
    const plain = !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey;
    if (dir && e.altKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      move(i, Math.max(0, Math.min(last, i + dir)), 'move');
    } else if (dir && e.shiftKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      const dur = Math.round((clips[i].dur + dir * 0.1) * 10) / 10;
      resize(i, dur, `resize:${i}`);
      announce(S.clipLabel(nameOf(i), S.secondsLong(S.num(Math.min(10, Math.max(0.4, dur)).toFixed(1)))));
    } else if ((dir || k === 'Home' || k === 'End') && plain) {
      e.preventDefault();
      const j = k === 'Home' ? 0 : k === 'End' ? last : Math.max(0, Math.min(last, i + dir));
      if (j !== sel) select(j);
      focusNext.current = j;
      // nothing renders when the selection stays: focus right away
      if (j === sel) scroller.current?.querySelector<HTMLElement>(`#clip-${j}`)?.focus({ preventScroll: true });
    } else if ((k === 'Delete' || k === 'Backspace') && plain) {
      e.preventDefault();
      remove(i, true);
    } else if (k.toLowerCase() === 'd' && plain) {
      e.preventDefault();
      duplicate(i, true);
    } else if (k.toLowerCase() === 'l' && plain) {
      e.preventDefault();
      loop(i);
    } else if (k === 'Enter' && plain) {
      e.preventDefault();
      openClip(i);
    } else if (k === ' ' && plain) {
      // Space plays and pauses here as it does on the page
      e.preventDefault();
      player.setPlaying(!player.isPlaying);
    }
  }

  /** where a card sits while another one is dragged */
  const shift = (i: number) => (drag ? makeRoom(i, drag.from, drag.to) * PITCH : 0);

  const modalClip = open !== null && clips[open] ? clips[open] : leaving.current;
  leaving.current = modalClip;

  return (
    <section aria-label={S.sequence} className={cn('flex w-full min-w-0 flex-col gap-1', className)}>
      <p id="clip-help" className="sr-only">
        {S.clipHelp}
      </p>
      <div className="flex min-w-0 items-center justify-between gap-3">
        <CycleMenu cycles={cycles} S={S} className="max-w-[min(18rem,60vw)]" />
        <span className="shrink-0 pr-2 text-xs text-foreground-subtle tabular-nums">{secs(S, length)}</span>
      </div>
      <div
        ref={scroller}
        className={cn(
          '-mx-1 overflow-x-auto overscroll-x-contain [scrollbar-width:none]',
          more.start && more.end && '[mask-image:linear-gradient(to_right,transparent,black_2rem,black_calc(100%-2rem),transparent)]',
          more.start && !more.end && '[mask-image:linear-gradient(to_right,transparent,black_2rem)]',
          !more.start && more.end && '[mask-image:linear-gradient(to_right,black_calc(100%-2rem),transparent)]',
        )}
      >
        <div role="listbox" aria-label={S.clips} aria-orientation="horizontal" aria-describedby="clip-help" data-track className="flex w-max gap-1 p-1">
          {clips.map((c, i) => {
            const name = S.anims[c.anim];
            const on = i === sel;
            const lifted = drag?.from === i;
            return (
              <div
                key={i}
                id={`clip-${i}`}
                role="option"
                aria-selected={on}
                aria-label={S.clipLabel(name, S.secondsLong(S.num(c.dur.toFixed(1))))}
                tabIndex={i === focusable ? 0 : -1}
                data-clip
                className={cn(
                  'group/clip relative flex h-22 w-19 shrink-0 touch-pan-x flex-col items-center justify-center gap-1.5 rounded-xl px-1 pb-1 text-2xs font-medium outline-none select-none [-webkit-touch-callout:none]',
                  'text-foreground-muted hover:bg-hover hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring',
                  'data-[current=true]:bg-surface-raised data-[current=true]:text-foreground data-[current=true]:shadow-lift',
                  // the picked card keeps a quiet ring, so the library knows where a new one goes
                  on && 'text-foreground after:pointer-events-none after:absolute after:inset-0 after:rounded-xl after:border after:border-foreground/30',
                  lifted ? 'z-20 cursor-grabbing bg-surface-raised shadow-lg' : 'cursor-pointer transition-[background-color,color,box-shadow,translate] duration-(--motion-normal) ease-out-expo',
                )}
                style={{ translate: lifted ? `${drag.dx}px -4px` : shift(i) ? `${shift(i)}px 0` : undefined }}
                onPointerDown={(e) => onClipDown(e, i)}
                onFocus={() => !on && select(i)}
                onKeyDown={(e) => onKey(e, i)}
                onContextMenu={(e) => e.preventDefault()}
              >
                <span aria-hidden className="block size-10 transition-transform duration-(--motion-slow) ease-out-expo group-hover/clip:scale-108 group-active/clip:scale-95 [&_svg]:block" dangerouslySetInnerHTML={{ __html: thumbs[c.anim] }} />
                <span className="max-w-full truncate">{name}</span>
                {/* it fills every frame: the screen recorder keeps only its box (rr-block) */}
                <span aria-hidden className="rr-block absolute inset-x-2.5 bottom-1.5 h-0.5 overflow-hidden rounded-full bg-border-strong opacity-0 transition-opacity duration-(--motion-normal) group-data-[current=true]/clip:opacity-100">
                  <span data-fill className="block h-full origin-left rounded-full bg-accent-emphasis" style={{ scale: '0 1' }} />
                </span>
                {on && looping ? <Repeat aria-hidden className="absolute top-1.5 right-1.5 size-3 animate-pop-in text-accent-emphasis" /> : null}
              </div>
            );
          })}
        </div>
      </div>
      {modalClip ? (
        <ClipModal
          open={open !== null}
          onOpenChange={(o) => !o && setOpen(null)}
          // the focus goes back to the card it opened from (or the one in its place)
          onClosed={() => scroller.current?.querySelector<HTMLElement>(`#clip-${Math.min(shown, clips.length - 1)}`)?.focus({ preventScroll: true })}
          state={state}
          clip={modalClip}
          looping={looping && sel === shown}
          full={clips.length >= MAX_CLIPS}
          single={clips.length <= 1}
          S={S}
          onLength={(dur, key) => resize(shown, dur, key)}
          onLoop={(on) => loop(shown, on)}
          onDuplicate={() => duplicate(shown)}
          onRemove={() => {
            setOpen(null);
            remove(shown);
          }}
        />
      ) : null}
    </section>
  );
}
