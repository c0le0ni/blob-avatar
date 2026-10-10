// The timeline: play and the clock, the cycle menu and the zoom; the ruler with the
// playhead; the track; and the bar for the selected clip. Every change to the
// clips goes through the editor, so each one is a step of undo; a drag or a
// stretch is one step however long it lasts.

import { CircleAlert, Minus, Pause, Play, Plus } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { MAX_CLIPS, type BlobState } from '../../engine';
import type { Strings } from '../../i18n/strings';
import { cn } from '../../lib/cn';
import { useMediaQuery } from '../../lib/use-media-query';
import { duplicateClip, moveClip, removeClip, resizeClip, starts } from '../cycles';
import type { Cycles } from '../editor';
import { toast } from '../hooks';
import type { Player } from '../player';
import { Button } from '../primitives/button';
import { Keys } from '../primitives/kbd';
import { Tooltip, TooltipContent, TooltipTrigger } from '../primitives/tooltip';
import { animThumb } from '../site';
import { announce, useAnnouncement } from './announce';
import { CycleMenu, savedName } from './cycle-menu';
import { GIF_LONG, clock, clockTime, gifFrames, secs } from './format';
import { Inspector } from './inspector';
import { ZOOMS, clipAt, pxPerSec, xOf, zoomStep } from './layout';
import { Ruler } from './ruler';
import { Track } from './track';

/** room before the first clip and after the last, so the playhead is never cut off */
const PAD = 8;

interface TimelineProps {
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

/** the polite live region the timeline speaks through */
function Announcer() {
  const said = useAnnouncement();
  return (
    <div role="status" aria-live="polite" aria-atomic className="sr-only">
      <span key={said.n}>{said.text}</span>
    </div>
  );
}

/** a GIF of this cycle is long: the clock says so, and tapping it says it again */
function GifNote({ length, S }: { length: number; S: Strings }) {
  const text = `${S.gifLong(secs(S, length), gifFrames(length))}. ${S.gifLighter}.`;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={text} className="animate-pop-in text-foreground-subtle hover:text-foreground touch:size-9" onClick={() => toast(text)}>
          <CircleAlert aria-hidden className="size-3.5!" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-60 flex-col items-start gap-0.5">
        <span>{S.gifLong(secs(S, length), gifFrames(length))}</span>
        <span className="font-normal text-foreground-muted">{S.gifLighter}</span>
      </TooltipContent>
    </Tooltip>
  );
}

const ZOOM_BTN = 'size-7 text-foreground-muted touch:size-10 aria-disabled:cursor-default aria-disabled:opacity-40 aria-disabled:hover:bg-transparent';

function Zoom({ zoom, narrow, S, onZoom }: { zoom: number; narrow: boolean; S: Strings; onZoom: (z: number) => void }) {
  // on a phone the zoom is one press: the whole cycle, or twice as close
  if (narrow) {
    return (
      <Button variant="ghost" aria-pressed={zoom > 1} aria-label={S.zoomTwice} className="h-8 px-2 font-mono text-xs text-foreground-muted aria-pressed:bg-pressed aria-pressed:text-foreground touch:h-10" onClick={() => onZoom(zoom > 1 ? 1 : 2)}>
        2×
      </Button>
    );
  }
  const max = ZOOMS[ZOOMS.length - 1];
  return (
    <div role="group" aria-label={S.zoom} className="flex items-center">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={S.zoomOut} aria-disabled={zoom <= 1 || undefined} className={ZOOM_BTN} onClick={() => zoom > 1 && onZoom(zoomStep(zoom, -1))}>
            <Minus aria-hidden className="size-3.5!" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{S.zoomOut}</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" aria-pressed={zoom === 1} className="h-7 min-w-11 px-1.5 text-xs text-foreground-muted aria-pressed:text-foreground touch:h-10" onClick={() => onZoom(1)}>
            {zoom === 1 ? S.fit : <span className="font-mono tabular-nums">{S.num(String(zoom))}×</span>}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{S.fitHint}</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={S.zoomIn} aria-disabled={zoom >= max || undefined} className={ZOOM_BTN} onClick={() => zoom < max && onZoom(zoomStep(zoom, 1))}>
            <Plus aria-hidden className="size-3.5!" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{S.zoomIn}</TooltipContent>
      </Tooltip>
    </div>
  );
}

export function Timeline({ state, cycles, player, S, selected, onSelect, looping, onLoop, className }: TimelineProps) {
  const clips = state.cycle;
  const durs = clips.map((c) => c.dur);
  const { at, length } = starts(clips);
  const narrow = !useMediaQuery('(min-width: 640px)');
  const scroller = useRef<HTMLDivElement>(null);
  const head = useRef<HTMLDivElement>(null);
  const clockEl = useRef<HTMLSpanElement>(null);
  const slider = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [zoom, setZoom] = useState(1);
  /** the scale held while a clip is stretched, so its edge stays under the pointer */
  const [held, setHeld] = useState<number | null>(null);
  const [playing, setPlaying] = useState(player.isPlaying);
  const focusNext = useRef<number | null>(null);
  /** the clip that keeps the Tab stop when nothing is selected */
  const anchor = useRef(0);

  useLayoutEffect(() => {
    const sc = scroller.current!;
    const measure = () => setWidth(sc.clientWidth);
    const observer = new ResizeObserver(measure);
    observer.observe(sc);
    measure();
    return () => observer.disconnect();
  }, []);

  const fit = pxPerSec(durs, Math.max(0, width - 2 * PAD), zoom);
  const pps = held ?? fit;
  const sel = selected !== null && selected < clips.length ? selected : null;
  if (sel !== null) anchor.current = sel;
  const focusable = Math.min(anchor.current, clips.length - 1);

  const thumbs = useMemo(() => {
    const out: Record<string, string> = {};
    for (const c of clips) out[c.anim] ??= animThumb(state, c.anim).svg;
    return out;
  }, [clips, state.color, state.shape, state.expression]);

  // the playhead, the clock, the clip under the playhead and the slider's value follow
  // the player outside React, frame by frame
  const live = useRef({ durs, pps, clips, length });
  live.current = { durs, pps, clips, length };
  useEffect(() => {
    let current = -1;
    let shown: unknown = null;
    let said = '';
    return player.subscribe((t, L, on) => {
      setPlaying(on);
      const { durs, pps, clips } = live.current;
      const x = xOf(t, pps, PAD);
      if (head.current) head.current.style.translate = `${x}px 0`;
      if (clockEl.current) clockEl.current.textContent = clock(S, t, L);
      const i = clipAt(durs, t);
      // new clips are new elements to mark
      if (clips !== shown) {
        shown = clips;
        current = -1;
      }
      if (i !== current) {
        current = i;
        scroller.current?.querySelectorAll<HTMLElement>('[data-clip]').forEach((el, k) => (el.dataset.current = String(k === i)));
      }
      // the slider says where it is when it stands still (not sixty times a second)
      const s = slider.current;
      if (s && !on) {
        const long = L >= 60;
        const text = S.playheadAt(clockTime(S, t, long), clockTime(S, L, long), clips[i] ? S.anims[clips[i].anim] : '');
        if (text !== said) {
          said = text;
          s.setAttribute('aria-valuenow', String(Math.round(t * 10) / 10));
          s.setAttribute('aria-valuetext', text);
        }
      }
      // keep the playhead in view while it plays, unless someone is working on the track
      const sc = scroller.current;
      if (sc && on && !sc.matches(':hover') && !sc.contains(document.activeElement) && (x < sc.scrollLeft || x > sc.scrollLeft + sc.clientWidth - 24)) sc.scrollTo({ left: Math.max(0, x - 24), behavior: 'smooth' });
    });
  }, [player, S]);

  // a clip that was moved, added or selected by the keys comes into view, and takes the focus when asked
  useLayoutEffect(() => {
    const sc = scroller.current;
    if (!sc || sel === null) return;
    const x = xOf(at[sel], pps, PAD);
    const w = durs[sel] * pps;
    if (x - PAD < sc.scrollLeft) sc.scrollTo({ left: x - PAD * 2, behavior: 'smooth' });
    else if (x + w + PAD > sc.scrollLeft + sc.clientWidth) sc.scrollTo({ left: x + w - sc.clientWidth + PAD * 2, behavior: 'smooth' });
  }, [sel, clips.length]);

  useLayoutEffect(() => {
    if (focusNext.current === null) return;
    scroller.current?.querySelector<HTMLElement>(`#clip-${focusNext.current}`)?.focus({ preventScroll: true });
    focusNext.current = null;
  });

  // ---------------------------------------------------------------- what can be done to a clip

  const nameOf = (i: number) => S.anims[clips[i].anim];
  /** a change to the clips; when a template turns into a cycle of the person's, it says so */
  const change = (f: Parameters<Cycles['change']>[0], key?: string) => cycles.change(f, key);

  const select = (i: number) => {
    anchor.current = i;
    onSelect(i);
    // a looped clip is played from its start by the loop itself
    if (!looping) player.seek(at[i]);
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
    onSelect(i + 1);
    if (focus) focusNext.current = i + 1;
    announce(S.said.duplicated(nameOf(i), i + 2, clips.length + 1));
  };

  const loop = (i: number) => {
    const on = !(looping && sel === i);
    if (sel !== i) select(i);
    onLoop(on);
    announce(on ? S.said.looping(nameOf(i)) : S.said.loopOff);
  };

  const togglePlay = () => player.setPlaying(!player.isPlaying);

  function onTrackKey(e: KeyboardEvent<HTMLDivElement>, i: number) {
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
      if (sel !== i) select(i);
      player.seek(at[i]);
      player.setPlaying(true);
    } else if (k === ' ' && plain) {
      // Space plays and pauses here as it does on the page
      e.preventDefault();
      togglePlay();
    }
  }

  const clip = sel !== null ? clips[sel] : null;

  return (
    <section aria-label={S.timeline} className={cn('flex min-w-0 flex-col rounded-xl border border-border bg-surface shadow-lg', className)}>
      <Announcer />
      <p id="clip-help" className="sr-only">
        {S.clipHelp}
      </p>
      <div className="flex min-w-0 items-center gap-1 px-1.5 pt-1.5 pb-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="size-8 text-foreground touch:size-10" aria-label={playing ? S.pause : S.play} aria-keyshortcuts="Space" onClick={togglePlay}>
              {playing ? <Pause aria-hidden className="fill-current" /> : <Play aria-hidden className="fill-current" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {playing ? S.pause : S.play}
            <Keys keys={[S.spaceKey]} />
          </TooltipContent>
        </Tooltip>
        <span ref={clockEl} aria-hidden className="shrink-0 pl-0.5 font-mono text-xs whitespace-nowrap text-foreground-muted tabular-nums" />
        {length > GIF_LONG ? <GifNote length={length} S={S} /> : null}
        <div className="ml-auto flex min-w-0 items-center gap-1">
          <CycleMenu cycles={cycles} S={S} className="max-w-[min(18rem,46vw)]" />
          <span aria-hidden className="mx-0.5 h-4 w-px shrink-0 bg-border-strong" />
          <Zoom zoom={zoom} narrow={narrow} S={S} onZoom={setZoom} />
        </div>
      </div>
      <div ref={scroller} className="relative mx-1.5 overflow-x-auto overscroll-x-contain pb-1.5 [scrollbar-width:thin]">
        <div className="relative" style={{ width: xOf(length, pps, PAD) + PAD }}>
          <Ruler length={length} pps={pps} pad={PAD} at={at} player={player} S={S} sliderRef={slider} />
          <Track
            clips={clips}
            thumbs={thumbs}
            pps={pps}
            pad={PAD}
            selected={sel}
            focusable={focusable}
            scroller={scroller}
            S={S}
            onSelect={select}
            onPick={select}
            onMove={move}
            onResize={resize}
            onResizing={(on) => setHeld(on ? pps : null)}
            onKeyDown={onTrackKey}
          />
          <div ref={head} aria-hidden className="pointer-events-none absolute top-0.5 bottom-0 left-0 z-40 -ml-px w-0.5 rounded-full bg-accent-emphasis shadow-[0_0_0_1px_var(--pulse-surface)]">
            <span className="absolute top-0 left-1/2 h-2.5 w-2.5 -translate-x-1/2 rounded-[3px] bg-accent-emphasis shadow-[0_0_0_1px_var(--pulse-surface)]" />
          </div>
        </div>
      </div>
      <Inspector
        clip={clip}
        index={sel}
        count={clips.length}
        thumb={clip ? thumbs[clip.anim] : null}
        looping={looping}
        full={clips.length >= MAX_CLIPS}
        S={S}
        onLength={(dur, key) => sel !== null && resize(sel, dur, key)}
        onDuplicate={() => sel !== null && duplicate(sel)}
        onLoop={() => sel !== null && loop(sel)}
        onRemove={() => sel !== null && remove(sel)}
      />
    </section>
  );
}

