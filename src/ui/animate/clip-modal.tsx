// One animation of the cycle, opened from its card: it plays on its own at the top,
// then its length (a slider in tenths, 0.4 to 10 s, back to its usual length with
// one press), whether the stage loops it, and a copy or its removal.

import { Copy, Repeat, RotateCcw, Timer, Trash2 } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { DEFAULT_DUR, frame, loopLength, type BlobState, type Clip } from 'blob-avatar/engine';
import { LiveSvg } from 'blob-avatar/render/svg';
import type { Strings } from '../../i18n/strings';
import { cn } from '../../lib/cn';
import { clampDur, tellingMoment } from '../cycles';
import { gestureKey } from '../history';
import { Button } from '../primitives/button';
import { Modal } from '../primitives/modal';
import { Switch } from '../primitives/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '../primitives/tooltip';
import { FULL_VIEW, animLook } from '../site';
import { secs } from './format';

const MIN = 0.4;
const MAX = 10;

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** the clip on its own, over and over, with a breath after it; held on its telling moment under reduced motion */
function Preview({ look, clip }: { look: BlobState; clip: Clip }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const live = new LiveSvg();
    live.el.setAttribute('viewBox', FULL_VIEW);
    live.el.setAttribute('width', '100%');
    live.el.setAttribute('height', '100%');
    // played every frame: the screen recorder keeps only its box (rr-block)
    live.el.classList.add('rr-block');
    host.current!.replaceChildren(live.el);
    const s: BlobState = { ...animLook(look, clip.anim), cycle: [clip, { anim: 'idle', dur: 0.9 }] };
    if (reducedMotion()) {
      live.update(frame(s, tellingMoment(clip)));
      return;
    }
    const L = loopLength(s);
    const t0 = performance.now();
    let raf = requestAnimationFrame(function tick(now) {
      live.update(frame(s, ((now - t0) / 1000) % L));
      raf = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(raf);
  }, [look.shape, look.color, look.expression, look.seed, clip.anim, clip.dur]);
  return <div ref={host} aria-hidden className="mx-auto size-40 [&>svg]:block" />;
}

function Action({ label, onClick, disabled, className, children }: { label: string; onClick: () => void; disabled?: boolean; className?: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={label} aria-disabled={disabled || undefined} className={cn('size-9 rounded-lg aria-disabled:cursor-default aria-disabled:opacity-40 aria-disabled:hover:bg-transparent touch:size-10', className)} onClick={() => !disabled && onClick()}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  );
}

interface ClipModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** it has left: where the focus goes */
  onClosed: () => void;
  state: BlobState;
  clip: Clip;
  looping: boolean;
  /** the cycle has no room for a copy */
  full: boolean;
  /** the only clip, which stays */
  single: boolean;
  S: Strings;
  onLength: (dur: number, key?: string) => void;
  onLoop: (on: boolean) => void;
  onDuplicate: () => void;
  onRemove: () => void;
}

export function ClipModal({ open, onOpenChange, onClosed, state, clip, looping, full, single, S, onLength, onLoop, onDuplicate, onRemove }: ClipModalProps) {
  const usual = DEFAULT_DUR[clip.anim];
  const changed = Math.abs(clip.dur - usual) > 1e-6;
  // one drag of the slider is one undo step, and so is a run of presses on its keys
  const key = useRef('length');
  const fill = ((clip.dur - MIN) / (MAX - MIN)) * 100;

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={S.anims[clip.anim]}
      closeLabel={S.close}
      onCloseAutoFocus={(e) => {
        e.preventDefault();
        onClosed();
      }}
    >
      <div className="rounded-xl bg-surface-sunken py-2">
        <Preview look={state} clip={clip} />
      </div>
      <div className="flex flex-col">
        <div className="flex min-h-11 items-center gap-3 px-1">
          <Timer aria-hidden className="size-4 shrink-0 text-foreground-subtle" />
          <input
            type="range"
            aria-label={S.length}
            aria-valuetext={S.secondsLong(S.num(clip.dur.toFixed(1)))}
            min={MIN}
            max={MAX}
            step={0.1}
            value={clip.dur}
            className="range min-w-0 flex-1"
            style={{ ['--fill' as string]: `${fill}%` }}
            onPointerDown={() => (key.current = gestureKey('length'))}
            onKeyDown={() => (key.current = 'length')}
            onChange={(e) => onLength(clampDur(Number(e.target.value)), key.current)}
          />
          <span className="w-11 shrink-0 text-right text-sm text-foreground tabular-nums">{secs(S, clip.dur)}</span>
          <span className={cn('-mr-1 transition-opacity duration-(--motion-normal)', changed ? 'opacity-100' : 'pointer-events-none opacity-0')}>
            <Action label={S.resetTo(secs(S, usual))} disabled={!changed} className="size-8 text-foreground-subtle" onClick={() => onLength(usual)}>
              <RotateCcw aria-hidden className="size-3.5!" />
            </Action>
          </span>
        </div>
        <div className="flex min-h-11 items-center gap-3 px-1">
          <Repeat aria-hidden className="size-4 shrink-0 text-foreground-subtle" />
          <label htmlFor="clip-loop" className="min-w-0 flex-1 cursor-pointer text-sm text-foreground">
            {S.loop}
          </label>
          <Switch id="clip-loop" aria-keyshortcuts="L" checked={looping} onCheckedChange={onLoop} />
        </div>
      </div>
      <div className="-mx-1 flex items-center justify-between border-t border-border pt-3">
        <Action label={full ? S.full : S.duplicate} disabled={full} onClick={onDuplicate}>
          <Copy aria-hidden />
        </Action>
        <Action label={S.remove} disabled={single} className="text-danger hover:text-danger" onClick={onRemove}>
          <Trash2 aria-hidden />
        </Action>
      </div>
    </Modal>
  );
}
