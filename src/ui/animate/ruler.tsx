// The ruler over the track, which is also the playhead's slider: drag along it to
// scrub (the cycle pauses meanwhile and plays again after, if it was playing), or
// focus it and use the keys: the arrows step a tenth of a second (a second with
// Shift), Page Up and Page Down jump between clips, Home and End go to the ends.

import { memo } from 'react';
import type { KeyboardEvent, PointerEvent as ReactPointerEvent, Ref } from 'react';
import type { Strings } from '../../i18n/strings';
import type { Player } from '../player';
import { ticks, tOf, xOf } from './layout';

interface RulerProps {
  length: number;
  pps: number;
  pad: number;
  /** where each clip starts, for Page Up and Page Down */
  at: number[];
  player: Player;
  S: Strings;
  /** the slider, whose value the timeline keeps up to date */
  sliderRef: Ref<HTMLDivElement>;
}

const label = (S: Strings, t: number) => S.num(String(t)) + 's';

function RulerView({ length, pps, pad, at, player, S, sliderRef }: RulerProps) {
  const marks = ticks(length, pps);

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    el.focus({ preventScroll: true });
    player.scrub(true);
    const seek = (clientX: number) => player.seek(tOf(clientX - el.getBoundingClientRect().left, pps, pad));
    seek(e.clientX);
    const move = (ev: PointerEvent) => seek(ev.clientX);
    const end = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', end);
      el.removeEventListener('pointercancel', end);
      player.scrub(false);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const t = player.time;
    const big = e.shiftKey ? 1 : 0.1;
    let next: number | null = null;
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowUp':
        next = t + big;
        break;
      case 'ArrowLeft':
      case 'ArrowDown':
        next = t - big;
        break;
      case 'PageDown':
        next = at.find((a) => a > t + 1e-3) ?? length;
        break;
      case 'PageUp':
        next = [...at].reverse().find((a) => a < t - 1e-3) ?? 0;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = length;
        break;
      case ' ':
        // Space plays and pauses here as it does on the page
        if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
        e.preventDefault();
        player.setPlaying(!player.isPlaying);
        return;
    }
    if (next === null) return;
    e.preventDefault();
    player.seek(Math.max(0, Math.min(length, next)));
  }

  return (
    <div
      ref={sliderRef}
      role="slider"
      tabIndex={0}
      aria-label={S.playhead}
      aria-valuemin={0}
      aria-valuemax={Math.round(length * 10) / 10}
      aria-orientation="horizontal"
      className="relative h-6 cursor-ew-resize touch-pan-y rounded-md outline-offset-[-2px] select-none"
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
    >
      {marks.map((m) => (
        <span key={m.t} aria-hidden className="pointer-events-none absolute bottom-0" style={{ left: xOf(m.t, pps, pad) }}>
          <span className={m.label ? 'absolute bottom-0 h-2 w-px bg-border-strong' : 'absolute bottom-0 h-1 w-px bg-border-strong opacity-70'} />
          {m.label ? <span className="absolute bottom-2 left-[5px] font-mono text-2xs leading-none whitespace-nowrap text-foreground-subtle tabular-nums">{label(S, m.t)}</span> : null}
        </span>
      ))}
    </div>
  );
}

export const Ruler = memo(RulerView);
