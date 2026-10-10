// The cycle menu: the templates, the person's own cycles (each can be renamed,
// duplicated or deleted, with an undo) and a new one. Its trigger names the cycle
// on screen.

import { Check, ChevronDown, Copy, Pencil, Plus, Trash2 } from 'lucide-react';
import { useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import type { Clip } from '../../engine';
import type { Strings } from '../../i18n/strings';
import { cn } from '../../lib/cn';
import { NAME_MAX, NEW, TEMPLATES, starts, templateOf, type SavedCycle } from '../cycles';
import type { Cycles } from '../editor';
import { toast } from '../hooks';
import { Button } from '../primitives/button';
import { Popover, PopoverContent, PopoverTrigger } from '../primitives/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '../primitives/tooltip';
import { secs } from './format';

/** a cycle of the person's by its name, or "Cycle n" */
export const savedName = (c: SavedCycle, S: Strings) => c.name ?? S.cycleName(c.n);

/** any cycle's name: a template's, or one of the person's */
export function cycleName(id: string, saved: SavedCycle[], S: Strings): string {
  const t = templateOf(id);
  if (t) return S.templates[t.key];
  const c = saved.find((k) => k.id === id);
  return c ? savedName(c, S) : S.templates.all;
}

const meta = (clips: Clip[], S: Strings) => S.cycleMeta(clips.length, secs(S, starts(clips).length));

const ROW = cn(
  'flex min-h-11 min-w-0 flex-1 items-center gap-2.5 rounded-md py-1 pr-2 pl-2 text-left outline-none select-none touch:min-h-12',
);

/** a row lights up as a whole, its own buttons included */
const LIT = 'transition-colors duration-(--motion-fast) hover:bg-hover has-[[data-item]:focus-visible]:bg-hover';

const Heading = ({ children }: { children: ReactNode }) => <div className="px-2.5 pt-2 pb-1 text-2xs font-medium text-foreground-subtle">{children}</div>;

const Separator = () => <div role="separator" className="mx-1.5 my-1 h-px shrink-0 bg-border" />;

function Row({ id, on, name, info, onPick, actions }: { id: string; on: boolean; name: string; info: string; onPick: () => void; actions?: ReactNode }) {
  return (
    <div data-row={id} className={cn('group/row flex items-center rounded-md', LIT)}>
      <button type="button" data-item aria-current={on || undefined} className={ROW} onClick={onPick}>
        <span className="grid size-4 shrink-0 place-items-center">{on ? <Check aria-hidden className="size-4 text-accent-emphasis" /> : null}</span>
        <span className="flex min-w-0 flex-col leading-tight">
          <span className={cn('truncate text-sm', on ? 'font-medium text-foreground' : 'text-foreground')}>{name}</span>
          <span className="text-2xs text-foreground-subtle tabular-nums">{info}</span>
        </span>
      </button>
      {actions ? <div className="flex shrink-0 items-center gap-0.5 pr-1 opacity-0 transition-opacity duration-(--motion-fast) group-focus-within/row:opacity-100 group-hover/row:opacity-100 touch:opacity-100">{actions}</div> : null}
    </div>
  );
}

function RowAction({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={label} className="text-foreground-subtle touch:size-9" onClick={onClick}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  );
}

function RenameRow({ name, S, onDone }: { name: string; S: Strings; onDone: (name: string | null) => void }) {
  const done = useRef(false);
  const finish = (v: string | null) => {
    if (done.current) return;
    done.current = true;
    onDone(v);
  };
  return (
    <div className="flex min-h-11 items-center gap-2.5 pr-1 pl-2 touch:min-h-12">
      <span className="size-4 shrink-0" />
      <input
        autoFocus
        defaultValue={name}
        aria-label={S.cycleNameField}
        maxLength={NAME_MAX}
        autoComplete="off"
        className="h-8 min-w-0 flex-1 rounded-md border border-foreground-subtle bg-surface-sunken px-2 text-sm text-foreground outline-none"
        onFocus={(e) => e.currentTarget.select()}
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return;
          // the press must not go on to the row that takes the focus next
          e.preventDefault();
          finish(e.currentTarget.value);
        }}
        onBlur={(e) => finish(e.currentTarget.value)}
      />
    </div>
  );
}

export function CycleMenu({ cycles, S, className }: { cycles: Cycles; S: Strings; className?: string }) {
  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const content = useRef<HTMLDivElement>(null);
  /** the row to focus once the list has redrawn (after a rename, a copy or a delete) */
  const focusNext = useRef<string | null>(null);
  /** Escape gave the typing up: the blur that follows saves nothing */
  const cancelled = useRef(false);
  const active = cycles.active;
  const name = cycleName(active, cycles.saved, S);

  useLayoutEffect(() => {
    const id = focusNext.current;
    if (id === null || !content.current) return;
    focusNext.current = null;
    const el = content.current.querySelector<HTMLElement>(`[data-row="${CSS.escape(id)}"] [data-item]`) ?? content.current.querySelector<HTMLElement>('[data-new]');
    el?.focus();
  });

  const pick = (id: string) => {
    cycles.select(id);
    setOpen(false);
  };

  function remove(c: SavedCycle) {
    const list = cycles.saved;
    const at = list.indexOf(c);
    focusNext.current = (list[at + 1] ?? list[at - 1])?.id ?? '';
    toast(S.cycleDeleted, { label: S.undo, run: cycles.remove(c.id) });
  }

  function duplicate(c: SavedCycle) {
    const copy = cycles.copy(c.id, S.copyName(savedName(c, S)));
    if (copy) focusNext.current = copy.id;
  }

  // the arrows walk the rows, as in a menu
  function moveFocus(e: KeyboardEvent<HTMLDivElement>) {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key) || (e.target as HTMLElement).closest('input')) return;
    const items = [...e.currentTarget.querySelectorAll<HTMLElement>('[data-item]')];
    const at = items.indexOf(document.activeElement as HTMLElement);
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : (at + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
    e.preventDefault();
    items[next]?.focus();
  }

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setRenaming(null);
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="ghost" className={cn('h-8 min-w-0 gap-1.5 px-2 touch:h-10', className)}>
          <span className="text-foreground-subtle max-sm:sr-only">{S.cycle}</span>
          <span aria-hidden className="-mx-0.5 text-foreground-subtle max-sm:hidden">
            ·
          </span>
          <span className="min-w-0 truncate text-foreground">{name}</span>
          <ChevronDown aria-hidden className={cn('size-3.5! text-foreground-subtle transition-transform duration-(--motion-normal) ease-out-expo', open && 'rotate-180')} />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        ref={content}
        role="dialog"
        aria-label={S.cycles}
        align="end"
        collisionPadding={8}
        className="flex max-h-[min(72vh,34rem)] w-80 max-w-[calc(100vw-1rem)] flex-col overflow-y-auto overscroll-contain p-1"
        onKeyDown={moveFocus}
        onOpenAutoFocus={(e) => {
          // the cycle on screen takes the focus, as a select would
          e.preventDefault();
          content.current?.querySelector<HTMLElement>('[aria-current="true"]')?.focus();
        }}
        onEscapeKeyDown={(e) => {
          // Escape while renaming gives the typing up, and leaves the menu open
          if (!renaming) return;
          e.preventDefault();
          cancelled.current = true;
          focusNext.current = renaming;
          setRenaming(null);
        }}
      >
        <Heading>{S.readyMade}</Heading>
        <div role="group" aria-label={S.readyMade}>
          {TEMPLATES.map((t) => (
            <Row key={t.id} id={t.id} on={active === t.id} name={S.templates[t.key]} info={meta(t.clips, S)} onPick={() => pick(t.id)} />
          ))}
        </div>
        <Separator />
        <Heading>{S.myCycles}</Heading>
        <div role="group" aria-label={S.myCycles}>
          {cycles.saved.length ? (
            cycles.saved.map((c) =>
              renaming === c.id ? (
                <RenameRow
                  key={c.id}
                  name={savedName(c, S)}
                  S={S}
                  onDone={(v) => {
                    if (v !== null && !cancelled.current) cycles.rename(c.id, v);
                    focusNext.current = c.id;
                    setRenaming(null);
                  }}
                />
              ) : (
                <Row
                  key={c.id}
                  id={c.id}
                  on={active === c.id}
                  name={savedName(c, S)}
                  info={meta(c.clips, S)}
                  onPick={() => pick(c.id)}
                  actions={
                    <>
                      <RowAction
                        label={S.rename(savedName(c, S))}
                        onClick={() => {
                          cancelled.current = false;
                          setRenaming(c.id);
                        }}
                      >
                        <Pencil aria-hidden />
                      </RowAction>
                      <RowAction label={S.duplicateCycle(savedName(c, S))} onClick={() => duplicate(c)}>
                        <Copy aria-hidden />
                      </RowAction>
                      <RowAction label={S.deleteCycle(savedName(c, S))} onClick={() => remove(c)}>
                        <Trash2 aria-hidden />
                      </RowAction>
                    </>
                  }
                />
              ),
            )
          ) : (
            <p className="px-2.5 pt-0.5 pb-2 text-xs text-foreground-subtle">{S.noCycles}</p>
          )}
        </div>
        <Separator />
        <button type="button" data-item data-new className={cn(ROW, LIT, 'min-h-9 flex-none focus-visible:bg-hover touch:min-h-11')} onClick={() => pick(NEW)}>
          <Plus aria-hidden className="size-4 shrink-0 text-foreground-subtle" />
          <span className="text-sm text-foreground">{S.newCycle}</span>
        </button>
      </PopoverContent>
    </Popover>
  );
}
