import { CirclePause, Image, Keyboard, MousePointerClick, ScanEye, Settings } from 'lucide-react';
import { Fragment } from 'react';
import type { ComponentType } from 'react';
import type { Strings } from '../i18n/strings';
import { cn } from '../lib/cn';
import { settings, type Settings as Prefs } from './prefs';
import { Button } from './primitives/button';
import { Keys } from './primitives/kbd';
import { Modal } from './primitives/modal';
import { Popover, PopoverContent, PopoverTrigger } from './primitives/popover';
import { Switch } from './primitives/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from './primitives/tooltip';
import { ACTIONS, TRACK_KEYS, keysFor, trackKeysFor } from './shortcuts';

// The page's settings, in the top bar with the theme and the language: each one an
// icon, its name and a switch, and the keyboard shortcuts, which open in a modal.

const ROW = 'flex min-h-10 items-center gap-2.5 rounded-md px-2.5 text-sm text-foreground transition-colors duration-(--motion-fast) hover:bg-hover touch:min-h-12';

type Flag = 'follow' | 'react' | 'showBg' | 'still';

const FLAGS: { key: Flag; icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>; label: (S: Strings) => string }[] = [
  { key: 'follow', icon: ScanEye, label: (S) => S.follow },
  { key: 'react', icon: MousePointerClick, label: (S) => S.react },
  { key: 'showBg', icon: Image, label: (S) => S.showBg },
  { key: 'still', icon: CirclePause, label: (S) => S.stillPreview },
];

interface SettingsMenuProps {
  S: Strings;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onShortcuts: () => void;
}

export function SettingsMenu({ S, open, onOpenChange, onShortcuts }: SettingsMenuProps) {
  const prefs = settings.use();
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="size-8 touch:size-10" aria-label={S.settings}>
              <Settings aria-hidden className={cn('transition-transform duration-(--motion-slow) ease-out-expo', open && 'rotate-45')} />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">{S.settings}</TooltipContent>
      </Tooltip>
      <PopoverContent role="dialog" aria-label={S.settings} align="end" sideOffset={8} collisionPadding={8} className="flex w-72 max-w-[calc(100vw-1rem)] flex-col p-1">
        {FLAGS.map(({ key, icon: Icon, label }) => (
          <div key={key} className={ROW}>
            <Icon aria-hidden className="size-4 shrink-0 text-foreground-subtle" />
            <label htmlFor={`set-${key}`} className="min-w-0 flex-1 cursor-pointer truncate">
              {label(S)}
            </label>
            <Switch id={`set-${key}`} checked={prefs[key]} onCheckedChange={(on) => settings.set({ [key]: on } as Partial<Prefs>)} />
          </div>
        ))}
        <div role="separator" className="mx-1.5 my-1 h-px shrink-0 bg-border" />
        <button
          type="button"
          className={cn(ROW, 'w-full text-left outline-none focus-visible:bg-hover')}
          onClick={() => {
            onOpenChange(false);
            onShortcuts();
          }}
        >
          <Keyboard aria-hidden className="size-4 shrink-0 text-foreground-subtle" />
          <span className="min-w-0 flex-1 truncate">{S.shortcuts}</span>
          <Keys keys={keysFor('help', S)[0]} />
        </button>
      </PopoverContent>
    </Popover>
  );
}

/** every key, the page's and the track's, in a modal */
export function ShortcutsModal({ S, open, onOpenChange }: { S: Strings; open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Modal open={open} onOpenChange={onOpenChange} title={S.shortcuts} closeLabel={S.close} className="sm:w-[26rem]">
      <dl className="flex flex-col gap-2">
        {ACTIONS.map((a) => (
          <div key={a} className="flex min-h-6 items-center justify-between gap-3">
            <dt className="text-sm text-foreground-muted">{S.keys[a]}</dt>
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
      <div role="separator" className="h-px shrink-0 bg-border" />
      <dl aria-label={S.inTimeline} className="flex flex-col gap-2">
        {TRACK_KEYS.map((k) => (
          <div key={k} className="flex min-h-6 items-center justify-between gap-3">
            <dt className="text-sm text-foreground-muted">{S.trackKeys[k]}</dt>
            <dd className="flex shrink-0 items-center">
              <Keys keys={trackKeysFor(k)} />
            </dd>
          </div>
        ))}
      </dl>
    </Modal>
  );
}
