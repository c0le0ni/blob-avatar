// The bar under the track for the selected clip: what it is and where, its length
// (a stepper in tenths and a field to type in, 0.4 to 10 s), and what can be done
// with it. With nothing selected it says how to pick one.

import { Copy, Minus, Plus, Repeat, RotateCcw, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { KeyboardEvent } from 'react';
import { DEFAULT_DUR, type Clip } from 'blob-avatar/engine';
import type { Strings } from '../../i18n/strings';
import { cn } from '../../lib/cn';
import { clampDur } from '../cycles';
import { Button } from '../primitives/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '../primitives/tooltip';
import { secs } from './format';

const MIN = 0.4;
const MAX = 10;

interface InspectorProps {
  clip: Clip | null;
  index: number | null;
  count: number;
  thumb: string | null;
  looping: boolean;
  /** the cycle has no room for a copy */
  full: boolean;
  S: Strings;
  onLength: (dur: number, key?: string) => void;
  onDuplicate: () => void;
  onLoop: () => void;
  onRemove: () => void;
}

const STEP = cn(
  'grid h-full w-7 shrink-0 place-items-center text-foreground-muted transition-colors duration-(--motion-fast) hover:bg-hover hover:text-foreground touch:w-10',
  'aria-disabled:cursor-default aria-disabled:opacity-40 aria-disabled:hover:bg-transparent [&_svg]:size-3.5',
);

/** a length typed in either language's way ("1.6", "1,6", "1,6 s") */
function parse(v: string) {
  const digits = v.replace(',', '.').replace(/[^\d.]/g, '');
  return digits ? Number(digits) : Number.NaN;
}

function LengthField({ dur, index, S, onLength }: { dur: number; index: number; S: Strings; onLength: (dur: number, key?: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = S.num(dur.toFixed(1));
  // a run of presses on the same clip is one undo step
  const key = `length:${index}`;
  const step = (by: number) => onLength(clampDur(dur + by), key);
  const commit = () => {
    if (draft === null) return;
    const v = parse(draft);
    if (Number.isFinite(v)) onLength(clampDur(v));
    setDraft(null);
  };
  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      commit();
      e.currentTarget.select();
    } else if (e.key === 'Escape' && draft !== null) {
      // the first Escape gives the typing up; the next one is the page's
      e.stopPropagation();
      setDraft(null);
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      setDraft(null);
      step(e.key === 'ArrowUp' ? 0.1 : -0.1);
    }
  }
  return (
    <div role="group" aria-label={S.length} className="flex h-7 shrink-0 items-center overflow-hidden rounded-md border border-border-strong bg-surface-sunken touch:h-10">
      <button type="button" aria-label={S.shorter} aria-disabled={dur <= MIN || undefined} className={STEP} onClick={() => dur > MIN && step(-0.1)}>
        <Minus aria-hidden />
      </button>
      <label className="flex h-full items-center gap-0.5 border-x border-border px-1.5 font-mono text-xs text-foreground tabular-nums">
        <input
          aria-label={S.length}
          inputMode="decimal"
          autoComplete="off"
          value={draft ?? shown}
          size={4}
          className="w-[4ch] bg-transparent text-right outline-none"
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={onKeyDown}
        />
        <span aria-hidden className="text-foreground-subtle">
          s
        </span>
      </label>
      <button type="button" aria-label={S.longer} aria-disabled={dur >= MAX || undefined} className={STEP} onClick={() => dur < MAX && step(0.1)}>
        <Plus aria-hidden />
      </button>
    </div>
  );
}

const ACTION = 'text-foreground-muted aria-disabled:cursor-default aria-disabled:opacity-40 aria-disabled:hover:bg-transparent touch:h-10';

export function Inspector({ clip, index, count, thumb, looping, full, S, onLength, onDuplicate, onLoop, onRemove }: InspectorProps) {
  if (!clip || index === null) {
    return (
      <div data-inspector className="flex min-h-12 items-center border-t border-border px-3 touch:min-h-14">
        <p className="text-xs text-foreground-subtle">{S.noClip}</p>
      </div>
    );
  }
  const name = S.anims[clip.anim];
  const usual = DEFAULT_DUR[clip.anim];
  const changed = Math.abs(clip.dur - usual) > 1e-6;
  return (
    <div data-inspector className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-border py-1.5 pr-1.5 pl-2 max-sm:pb-2 touch:min-h-14">
      <div className="flex min-w-0 flex-1 items-center gap-2 sm:flex-none">
        <span aria-hidden className="size-8 shrink-0 rounded-md bg-surface-sunken [&_svg]:block" dangerouslySetInnerHTML={{ __html: thumb ?? '' }} />
        <div className="flex min-w-0 flex-col leading-tight">
          <span className="truncate text-sm font-medium text-foreground">{name}</span>
          <span className="text-2xs text-foreground-subtle tabular-nums">{S.position(index + 1, count)}</span>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <LengthField key={index} dur={clip.dur} index={index} S={S} onLength={onLength} />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" aria-label={S.resetTo(secs(S, usual))} aria-disabled={!changed || undefined} className={cn(ACTION, 'size-7 touch:size-10')} onClick={() => changed && onLength(usual)}>
              <RotateCcw aria-hidden className="size-3.5!" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{S.resetTo(secs(S, usual))}</TooltipContent>
        </Tooltip>
      </div>
      <div className="flex items-center gap-0.5 max-sm:w-full max-sm:justify-between sm:ml-auto">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" aria-keyshortcuts="D" aria-disabled={full || undefined} className={ACTION} onClick={() => !full && onDuplicate()}>
              <Copy aria-hidden className="size-3.5!" />
              {S.duplicate}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{full ? S.full : S.duplicate}</TooltipContent>
        </Tooltip>
        <Button
          variant="ghost"
          size="sm"
          aria-pressed={looping}
          aria-keyshortcuts="L"
          className={cn(ACTION, 'aria-pressed:bg-accent-soft aria-pressed:text-foreground [&[aria-pressed=true]_svg]:text-accent-emphasis')}
          onClick={onLoop}
        >
          <Repeat aria-hidden className="size-3.5!" />
          {S.loop}
        </Button>
        <Button variant="ghost" size="sm" aria-keyshortcuts="Delete" aria-disabled={count <= 1 || undefined} className={ACTION} onClick={() => count > 1 && onRemove()}>
          <Trash2 aria-hidden className="size-3.5!" />
          {S.remove}
        </Button>
      </div>
    </div>
  );
}
