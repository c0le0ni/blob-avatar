import { ChevronDown, CodeXml, Copy, Download, Film, Image, Link, LoaderCircle, Sparkles, Spline } from 'lucide-react';
import { useState } from 'react';
import type { ComponentType, KeyboardEvent, ReactNode } from 'react';
import { IDLE_CYCLE, loopLength, type BlobState } from 'blob-avatar/engine';
import { toHash } from 'blob-avatar/engine/codec';
import { copyPng, copySvg, downloadAnimatedSvg, downloadGif, downloadPng, downloadSvg, type ExportOptions } from '../export';
import type { Strings } from '../i18n/strings';
import { cn } from '../lib/cn';
import { GIF_LONG, gifFrames, secs } from './animate/format';
import { ColorPicker } from './color-picker';
import { toast } from './hooks';
import type { Mode } from './player';
import { SIZES, settings, type Settings } from './prefs';
import { Button } from './primitives/button';
import { Popover, PopoverContent, PopoverTrigger } from './primitives/popover';
import { Segmented } from './primitives/segmented';
import { Switch } from './primitives/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from './primitives/tooltip';
import { embedCode } from './site';

/** the export options, from the settings (kept on this device) */
export function exportOptions(o: Settings): ExportOptions {
  const custom = Math.round(Number(o.custom));
  const size = o.size === 'custom' && custom > 0 ? Math.max(16, Math.min(2048, custom)) : Number(o.size) || 512;
  return { size, bg: o.bg ? o.bgColor : null, round: o.round };
}

const ITEM = cn(
  'flex min-h-9 w-full min-w-0 items-center gap-2.5 rounded-md px-2.5 text-left text-sm text-foreground outline-none select-none touch:min-h-11',
  'transition-colors duration-(--motion-fast) hover:bg-hover focus-visible:bg-hover disabled:pointer-events-none disabled:opacity-60',
);

const SIDE = cn(
  'flex size-9 shrink-0 items-center justify-center rounded-md text-foreground-subtle outline-none touch:size-11',
  'transition-colors duration-(--motion-fast) hover:bg-hover hover:text-foreground focus-visible:bg-hover focus-visible:text-foreground disabled:opacity-60',
);

const Separator = () => <div role="separator" className="mx-1.5 my-1 h-px shrink-0 bg-border" />;

export function ExportMenu({ state, mode, S }: { state: BlobState; mode: Mode; S: Strings }) {
  // the export options are remembered on this device
  const saved = settings.use();
  const save = settings.set;
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [open, setOpen] = useState(false);
  const o = exportOptions(saved);
  // the animated formats take the cycle while animating, the idle loop otherwise
  const moving: BlobState = mode === 'animate' ? state : { ...state, cycle: IDLE_CYCLE };

  async function run(id: string, work: () => unknown, done?: string) {
    if (busy) return;
    setBusy(id);
    setProgress(0);
    try {
      const ok = await work();
      if (ok === false) toast(S.copyFailed);
      else if (done) toast(done);
    } catch {
      toast(S.copyFailed);
    } finally {
      setBusy(null);
    }
  }

  const copyText = (text: string) => navigator.clipboard.writeText(text).then(() => true, () => false);

  const actions = {
    png: () => run('png', () => downloadPng(state, o)),
    svg: () => run('svg', () => downloadSvg(state, o)),
    gif: () => run('gif', () => downloadGif(moving, o, setProgress)),
    anim: () => run('anim', () => downloadAnimatedSvg(moving, o)),
    copyPng: () => run('copyPng', () => copyPng(state, o), S.copied),
    copySvg: () => run('copySvg', () => copySvg(state, o), S.copied),
    link: () =>
      run(
        'link',
        () => {
          history.replaceState(null, '', `#${toHash(state)}`);
          return copyText(location.href);
        },
        S.linkCopied,
      ),
    embed: () => run('embed', () => copyText(embedCode(moving, { gaze: saved.follow, reaction: saved.react })), S.embedCopied),
  };

  const spin = (id: string, Icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>) =>
    busy === id ? <LoaderCircle aria-hidden className="size-4 shrink-0 animate-spin text-foreground-subtle" /> : <Icon aria-hidden className="size-4 shrink-0 text-foreground-subtle" />;

  const row = (id: keyof typeof actions, Icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>, label: string, hint?: ReactNode, side?: ReactNode, note?: string) => (
    <div className="flex items-center">
      <button type="button" data-item className={cn(ITEM, note && 'items-start py-2')} disabled={!!busy && busy !== id} aria-busy={busy === id} onClick={actions[id]}>
        <span className={cn('flex shrink-0', note && 'pt-0.5')}>{spin(id, Icon)}</span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate">{label}</span>
            {hint}
          </span>
          {note ? <span className="text-2xs text-foreground-subtle">{note}</span> : null}
        </span>
      </button>
      {side}
    </div>
  );

  // a long cycle makes a heavy GIF: the row says how long and how many frames, and what stays light
  const length = loopLength(moving);
  const long = mode === 'animate' && length > GIF_LONG;
  const gifHint =
    busy === 'gif' ? (
      <span className="font-mono text-2xs text-foreground-subtle tabular-nums">{Math.round(progress * 100)}%</span>
    ) : long ? (
      <span className="font-mono text-2xs whitespace-nowrap text-foreground-subtle tabular-nums">{S.gifFrames(secs(S, length), gifFrames(length))}</span>
    ) : null;

  const copy = (id: 'copyPng' | 'copySvg', label: string) => (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" data-item aria-label={label} className={SIDE} disabled={!!busy && busy !== id} onClick={actions[id]}>
          {busy === id ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : <Copy aria-hidden className="size-4" />}
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );

  // arrow keys walk the actions, as in a menu
  function moveFocus(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    if ((event.target as HTMLElement).closest('[role="slider"],[role="tablist"],[role="group"],input')) return;
    const items = [...event.currentTarget.querySelectorAll<HTMLElement>('[data-item]:not(:disabled)')];
    const at = items.indexOf(document.activeElement as HTMLElement);
    event.preventDefault();
    items[(at + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
  }

  const main = mode === 'animate' ? { id: 'gif' as const, label: S.exportGif } : { id: 'png' as const, label: S.exportPng };

  return (
    <div className="flex items-center">
      {/* under 400px the top bar is short of room, and the label hides from the eye */}
      <Button variant="primary" size="lg" className="rounded-r-none pr-2.5 pl-3 max-[400px]:px-2.5" aria-busy={busy === main.id} disabled={!!busy} onClick={actions[main.id]}>
        {busy === main.id ? <LoaderCircle aria-hidden className="animate-spin" /> : <Download aria-hidden />}
        <span className="max-sm:hidden">{busy === 'gif' ? `${Math.round(progress * 100)}%` : main.label}</span>
        <span className={cn('sm:hidden', busy !== 'gif' && 'max-[400px]:sr-only')}>{busy === 'gif' ? `${Math.round(progress * 100)}%` : S.export}</span>
      </Button>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="primary" size="lg" aria-label={S.moreFormats} className="w-7 rounded-l-none border-l border-accent-foreground/15 px-0 touch:w-9">
            <ChevronDown aria-hidden className={cn('transition-transform duration-(--motion-normal) ease-out-expo', open && 'rotate-180')} />
          </Button>
        </PopoverTrigger>
        <PopoverContent role="dialog" aria-label={S.moreFormats} align="end" sideOffset={6} collisionPadding={8} className="flex max-h-[min(80vh,36rem)] w-72 max-w-[calc(100vw-1rem)] flex-col overflow-y-auto overscroll-contain p-1" onKeyDown={moveFocus}>
          {row('png', Image, S.downloadPng, null, copy('copyPng', S.copyImage))}
          {row('svg', Spline, S.downloadSvg, null, copy('copySvg', S.copySvg))}
          {row('gif', Film, S.downloadGif, gifHint, null, long ? S.gifLighter : undefined)}
          {row('anim', Sparkles, S.downloadAnimSvg)}
          <Separator />
          <div className="flex flex-col gap-1 px-2.5 py-1.5">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-foreground-muted">{S.size}</span>
              <div className="flex items-center gap-1.5">
                <Segmented
                  label={S.size}
                  value={saved.size === 'custom' ? ('' as never) : (saved.size as (typeof SIZES)[number])}
                  onChange={(v) => save({ size: v })}
                  options={SIZES.map((v) => ({ value: v, label: v }))}
                  className="font-mono"
                />
                <input
                  inputMode="numeric"
                  aria-label={`${S.size}, ${S.custom}`}
                  placeholder={S.custom}
                  value={saved.custom}
                  maxLength={4}
                  className={cn('h-7 w-14 rounded-md border bg-surface-sunken px-1.5 text-center font-mono text-xs text-foreground outline-none placeholder:font-sans placeholder:text-foreground-subtle touch:h-9', saved.size === 'custom' ? 'border-foreground-subtle' : 'border-border-strong')}
                  onFocus={() => saved.custom && save({ size: 'custom' })}
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, '');
                    save({ custom: v, size: v ? 'custom' : saved.size === 'custom' ? '512' : saved.size });
                  }}
                />
              </div>
            </div>
          </div>
          <div className="flex min-h-9 items-center justify-between gap-3 px-2.5">
            <span className="text-sm text-foreground-muted">{S.background}</span>
            <div className="flex items-center gap-2">
              {saved.bg ? (
                <Popover>
                  <PopoverTrigger asChild>
                    <button type="button" aria-label={S.backgroundColor} className="size-5 animate-pop-in rounded-full shadow-[inset_0_0_0_1px_var(--pulse-border-strong)] transition-transform hover:scale-110" style={{ background: saved.bgColor }} />
                  </PopoverTrigger>
                  <PopoverContent side="left" align="center" className="w-60 p-3">
                    <ColorPicker value={saved.bgColor} onChange={(hex) => save({ bgColor: hex })} S={S} />
                  </PopoverContent>
                </Popover>
              ) : null}
              <Switch aria-label={S.background} checked={saved.bg} onCheckedChange={(bg) => save({ bg })} />
            </div>
          </div>
          <div className="flex min-h-9 items-center justify-between gap-3 px-2.5">
            <span className="text-sm text-foreground-muted">{S.round}</span>
            <Switch aria-label={S.round} checked={saved.round} onCheckedChange={(round) => save({ round })} />
          </div>
          <Separator />
          {row('link', Link, S.copyLink)}
          {row('embed', CodeXml, S.copyEmbed)}
        </PopoverContent>
      </Popover>
    </div>
  );
}
