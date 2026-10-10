import { Check, ChevronDown, Globe, Moon, Sun } from 'lucide-react';
import type { KeyboardEvent, ReactNode } from 'react';
import { STRINGS, type Strings } from '../i18n/strings';
import { cn } from '../lib/cn';
import { BlobWordmark, ColeoniLockup, ColeoniSymbol } from './brand';
import { useTheme } from './hooks';
import { Button } from './primitives/button';
import { Popover, PopoverContent, PopoverTrigger } from './primitives/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from './primitives/tooltip';
import { coleoniHome } from './site';

export function ThemeToggle({ S }: { S: Strings }) {
  const { theme, toggle } = useTheme();
  const label = theme === 'light' ? S.toDark : S.toLight;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" className="size-8 touch:size-10" aria-label={label} onClick={toggle}>
          <span className="relative grid size-4 place-items-center">
            <Sun aria-hidden className={cn('absolute transition-[opacity,rotate,scale] duration-(--motion-slow) ease-out-expo', theme === 'light' ? 'scale-50 -rotate-90 opacity-0' : 'opacity-100')} />
            <Moon aria-hidden className={cn('absolute transition-[opacity,rotate,scale] duration-(--motion-slow) ease-out-expo', theme === 'light' ? 'opacity-100' : 'scale-50 rotate-90 opacity-0')} />
          </span>
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}

const ITEM = cn(
  'flex min-h-9 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-sm text-foreground outline-none select-none touch:min-h-11',
  'transition-colors duration-(--motion-fast) hover:bg-hover focus-visible:bg-hover',
);

export function LanguageMenu({ S }: { S: Strings }) {
  const langs = [STRINGS.en, STRINGS.pt];
  function moveFocus(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const items = [...event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitemradio"]')];
    const at = items.indexOf(document.activeElement as HTMLElement);
    items[(at + 1) % items.length]?.focus();
  }
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" className="h-8 gap-1 px-2 text-sm touch:h-10" aria-haspopup="menu">
          <Globe aria-hidden />
          <span className="sr-only">{S.language}: </span>
          <span className="font-medium">{S.lang.toUpperCase()}</span>
          <ChevronDown aria-hidden className="size-3.5! text-foreground-subtle" />
        </Button>
      </PopoverTrigger>
      <PopoverContent role="menu" aria-label={S.language} align="end" className="w-44 p-1" onKeyDown={moveFocus}>
        {langs.map((L) => {
          const on = L.lang === S.lang;
          return (
            <a
              key={L.lang}
              role="menuitemradio"
              aria-checked={on}
              href={L.path}
              hrefLang={L.htmlLang}
              lang={L.htmlLang}
              className={ITEM}
              onClick={(e) => {
                // the choice is saved (it beats the automatic redirect) and keeps the avatar
                try {
                  localStorage.setItem('coleoni-lang', L.lang);
                } catch {}
                e.currentTarget.href = L.path + location.hash;
              }}
            >
              <span className="flex-1">{L.lang === 'pt' ? 'Português' : 'English'}</span>
              {on ? <Check aria-hidden className="size-4 text-foreground-muted" /> : null}
            </a>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}

interface TopBarProps {
  S: Strings;
  center: ReactNode;
  end: ReactNode;
  onWordmark: (draw: (now: number) => void, host: HTMLElement) => void;
  className?: string;
}

export function TopBar({ S, center, end, onWordmark, className }: TopBarProps) {
  return (
    <header className={cn('relative z-30 flex h-14 shrink-0 items-center gap-3 px-3 sm:px-5', className)}>
      <div className="flex min-w-0 items-center gap-3">
        <a href={coleoniHome(S)} rel="noopener" aria-label={S.coleoni} data-intro="translateX(-6px)" className="flex shrink-0 rounded-sm text-foreground transition-opacity hover:opacity-80">
          <ColeoniLockup className="max-sm:hidden" />
          <ColeoniSymbol className="sm:hidden" />
        </a>
        <span aria-hidden data-intro="scaleY(0)" className="h-4.5 w-px shrink-0 -skew-x-[18deg] bg-border-strong" />
        <a href={S.path} aria-label={S.home} className="flex shrink-0 rounded-sm text-foreground">
          <BlobWordmark onLive={onWordmark} />
        </a>
      </div>
      <div className="absolute left-1/2 -translate-x-1/2 max-md:hidden">{center}</div>
      <div className="ml-auto flex items-center gap-1">{end}</div>
    </header>
  );
}
