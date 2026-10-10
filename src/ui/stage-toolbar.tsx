import { ChevronDown, Dices, Keyboard, Redo2, Settings, Undo2 } from 'lucide-react';
import { Fragment } from 'react';
import type { ReactNode } from 'react';
import type { ThemePref } from '../app/theme';
import type { Strings } from '../i18n/strings';
import { cn } from '../lib/cn';
import { useTheme } from './hooks';
import { settings } from './prefs';
import { Button } from './primitives/button';
import { Keys } from './primitives/kbd';
import { Popover, PopoverContent, PopoverTrigger } from './primitives/popover';
import { Segmented } from './primitives/segmented';
import { Switch } from './primitives/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from './primitives/tooltip';
import { ACTIONS, MAC, TRACK_KEYS, keysFor, trackKeysFor } from './shortcuts';

// The stage's own tools, in a pill by the blob: a new look, undo, redo and the
// settings. On a phone they sit in a row under the stage, a finger wide.

const TOOL = cn(
  'size-10 md:size-8 touch:size-10',
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

const ROW = 'flex items-center justify-between gap-3 px-2.5';

/** a setting that is on or off; the label toggles it too, and the hint says what it does */
function SwitchRow({ id, label, hint, checked, onChange }: { id: string; label: string; hint: string; checked: boolean; onChange: (on: boolean) => void }) {
  return (
    <div className={cn(ROW, 'min-h-12 py-1.5')}>
      <div className="flex min-w-0 flex-col">
        <label htmlFor={id} className="cursor-pointer text-sm text-foreground">
          {label}
        </label>
        <span id={`${id}-hint`} className="text-2xs text-foreground-subtle">
          {hint}
        </span>
      </div>
      <Switch id={id} aria-describedby={`${id}-hint`} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

const THEMES: readonly ThemePref[] = ['system', 'light', 'dark'];

function SettingsPanel({ S, keysOpen, onKeysOpen }: { S: Strings; keysOpen: boolean; onKeysOpen: (open: boolean) => void }) {
  const prefs = settings.use();
  const { pref, setPref } = useTheme();
  return (
    <>
      <SwitchRow id="set-follow" label={S.follow} hint={S.followHint} checked={prefs.follow} onChange={(follow) => settings.set({ follow })} />
      <SwitchRow id="set-react" label={S.react} hint={S.reactHint} checked={prefs.react} onChange={(react) => settings.set({ react })} />
      <SwitchRow id="set-backdrop" label={S.showBg} hint={S.showBgHint} checked={prefs.showBg} onChange={(showBg) => settings.set({ showBg })} />
      <SwitchRow id="set-still" label={S.stillPreview} hint={S.stillHint} checked={prefs.still} onChange={(still) => settings.set({ still })} />
      <div className={cn(ROW, 'min-h-11')}>
        <span className="text-sm text-foreground">{S.theme}</span>
        <Segmented label={S.theme} value={pref} onChange={setPref} options={THEMES.map((t) => ({ value: t, label: S.themes[t] }))} />
      </div>
      <div role="separator" className="mx-1.5 my-1 h-px shrink-0 bg-border" />
      <button
        type="button"
        aria-expanded={keysOpen}
        aria-controls="shortcut-list"
        className="flex min-h-9 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-sm text-foreground outline-none select-none transition-colors duration-(--motion-fast) hover:bg-hover focus-visible:bg-hover touch:min-h-11"
        onClick={() => onKeysOpen(!keysOpen)}
      >
        <Keyboard aria-hidden className="size-4 shrink-0 text-foreground-subtle" />
        <span className="min-w-0 flex-1 truncate">{S.shortcuts}</span>
        <ChevronDown aria-hidden className={cn('size-4 shrink-0 text-foreground-subtle transition-transform duration-(--motion-normal) ease-out-expo', keysOpen && 'rotate-180')} />
      </button>
      {/* the list opens in place, its height easing from nothing to what it needs */}
      <div id="shortcut-list" data-open={keysOpen} inert={!keysOpen} className="grid grid-rows-[0fr] transition-[grid-template-rows] duration-(--motion-slow) ease-out-expo data-[open=true]:grid-rows-[1fr]">
        <div className="min-h-0 overflow-hidden">
          <dl className="flex flex-col gap-1.5 px-2.5 pt-1 pb-2">
            {ACTIONS.map((a) => (
              <div key={a} className="flex min-h-5 items-center justify-between gap-3">
                <dt className="text-xs text-foreground-muted">{S.keys[a]}</dt>
                <dd className="flex shrink-0 items-center gap-1.5">
                  {keysFor(a, S).map((k, i) => (
                    <Fragment key={i}>
                      {i ? <span className="text-2xs text-foreground-subtle">{S.or}</span> : null}
                      <Keys keys={k} />
                    </Fragment>
                  ))}
                </dd>
              </div>
            ))}
          </dl>
          <div className="px-2.5 pt-1 pb-1 text-2xs font-medium text-foreground-subtle">{S.inTimeline}</div>
          <dl className="flex flex-col gap-1.5 px-2.5 pt-1 pb-2">
            {TRACK_KEYS.map((k) => (
              <div key={k} className="flex min-h-5 items-center justify-between gap-3">
                <dt className="text-xs text-foreground-muted">{S.trackKeys[k]}</dt>
                <dd className="flex shrink-0 items-center">
                  <Keys keys={trackKeysFor(k)} />
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </>
  );
}

interface StageToolbarProps {
  S: Strings;
  canUndo: boolean;
  canRedo: boolean;
  onRandomize: () => void;
  onUndo: () => void;
  onRedo: () => void;
  settingsOpen: boolean;
  onSettingsOpen: (open: boolean) => void;
  keysOpen: boolean;
  onKeysOpen: (open: boolean) => void;
  className?: string;
}

export function StageToolbar({ S, canUndo, canRedo, onRandomize, onUndo, onRedo, settingsOpen, onSettingsOpen, keysOpen, onKeysOpen, className }: StageToolbarProps) {
  const mod = MAC ? 'Meta' : 'Control';
  return (
    <div role="group" aria-label={S.blobTools} data-intro="translateY(-6px)" className={cn('flex shrink-0 items-center gap-0.5 rounded-lg border border-border bg-surface p-0.5 shadow-card', className)}>
      <Tool label={S.randomize} keys={keysFor('randomize', S)[0]} shortcut="R" onClick={onRandomize}>
        <Dices aria-hidden />
      </Tool>
      <Tool label={S.undo} keys={keysFor('undo', S)[0]} shortcut={`${mod}+Z`} disabled={!canUndo} onClick={onUndo}>
        <Undo2 aria-hidden />
      </Tool>
      <Tool label={S.redo} keys={keysFor('redo', S)[0]} shortcut={MAC ? 'Meta+Shift+Z' : 'Control+Shift+Z Control+Y'} disabled={!canRedo} onClick={onRedo}>
        <Redo2 aria-hidden />
      </Tool>
      <span aria-hidden className="mx-0.5 h-4 w-px shrink-0 bg-border-strong" />
      <Popover open={settingsOpen} onOpenChange={onSettingsOpen}>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" className={TOOL} aria-label={S.settings}>
                <Settings aria-hidden className={cn('transition-transform duration-(--motion-slow) ease-out-expo', settingsOpen && 'rotate-45')} />
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom">{S.settings}</TooltipContent>
        </Tooltip>
        <PopoverContent role="dialog" aria-label={S.settings} align="end" sideOffset={6} collisionPadding={8} className="flex max-h-[min(80vh,36rem)] w-72 max-w-[calc(100vw-1rem)] flex-col overflow-y-auto overscroll-contain p-1">
          <SettingsPanel S={S} keysOpen={keysOpen} onKeysOpen={onKeysOpen} />
        </PopoverContent>
      </Popover>
    </div>
  );
}
