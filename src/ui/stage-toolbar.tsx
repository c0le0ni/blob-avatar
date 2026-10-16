import { Dices, Pause, Play, Redo2, Undo2 } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Strings } from '../i18n/strings';
import { cn } from '../lib/cn';
import { Button } from './primitives/button';
import { Keys } from './primitives/kbd';
import { Tooltip, TooltipContent, TooltipTrigger } from './primitives/tooltip';
import { MAC, keysFor } from './shortcuts';

// The stage's own tools, in a dock under the blob: a new look, undo and redo, and in
// Animate the play button in front of them. The page's settings are in the top bar.

const TOOL = cn(
  'size-9 rounded-lg touch:size-10',
  // unavailable, it stays in place and keeps its focus, and only says so
  'aria-disabled:cursor-default aria-disabled:opacity-40 aria-disabled:hover:bg-transparent aria-disabled:hover:text-foreground-muted aria-disabled:active:scale-100',
);

function Tool({ label, keys, shortcut, disabled = false, onClick, children }: { label: string; keys: string[]; shortcut: string; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" className={TOOL} aria-label={label} aria-keyshortcuts={shortcut} aria-disabled={disabled || undefined} onClick={() => !disabled && onClick()}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {label}
        <Keys keys={keys} />
      </TooltipContent>
    </Tooltip>
  );
}

/** play and pause, the one accent on the stage; the icons trade places */
function PlayButton({ playing, S, onToggle }: { playing: boolean; S: Strings; onToggle: () => void }) {
  const label = playing ? S.pause : S.play;
  const swap = 'absolute fill-current transition-[opacity,scale] duration-(--motion-normal) ease-out-expo';
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="primary" size="icon" className="size-9 rounded-lg touch:size-10" aria-label={label} aria-keyshortcuts="Space" onClick={onToggle}>
          <span className="relative grid size-4 place-items-center">
            <Play aria-hidden className={cn(swap, playing && 'scale-50 opacity-0')} />
            <Pause aria-hidden className={cn(swap, !playing && 'scale-50 opacity-0')} />
          </span>
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {label}
        <Keys keys={[S.spaceKey]} />
      </TooltipContent>
    </Tooltip>
  );
}

interface StageToolbarProps {
  S: Strings;
  canUndo: boolean;
  canRedo: boolean;
  onRandomize: () => void;
  onUndo: () => void;
  onRedo: () => void;
  /** in Animate: the cycle playing or not, and the press that changes it */
  play?: { playing: boolean; onToggle: () => void } | null;
  className?: string;
}

export function StageToolbar({ S, canUndo, canRedo, onRandomize, onUndo, onRedo, play, className }: StageToolbarProps) {
  const mod = MAC ? 'Meta' : 'Control';
  return (
    <div role="group" aria-label={S.blobTools} data-intro="translateY(6px)" className={cn('flex shrink-0 items-center gap-0.5 rounded-xl border border-border bg-surface p-1 shadow-card', className)}>
      {play ? (
        <>
          <PlayButton playing={play.playing} S={S} onToggle={play.onToggle} />
          <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-border-strong" />
        </>
      ) : null}
      <Tool label={S.randomize} keys={keysFor('randomize', S)[0]} shortcut="R" onClick={onRandomize}>
        <Dices aria-hidden />
      </Tool>
      <Tool label={S.undo} keys={keysFor('undo', S)[0]} shortcut={`${mod}+Z`} disabled={!canUndo} onClick={onUndo}>
        <Undo2 aria-hidden />
      </Tool>
      <Tool label={S.redo} keys={keysFor('redo', S)[0]} shortcut={MAC ? 'Meta+Shift+Z' : 'Control+Shift+Z Control+Y'} disabled={!canRedo} onClick={onRedo}>
        <Redo2 aria-hidden />
      </Tool>
    </div>
  );
}
