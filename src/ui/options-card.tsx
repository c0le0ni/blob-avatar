import { Palette, Shapes, Smile } from 'lucide-react';
import { useDeferredValue, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { EXPRESSIONS, SHAPES, type BlobState } from 'blob-avatar/engine';
import type { Strings } from '../i18n/strings';
import { cn } from '../lib/cn';
import { ColorSwatches } from './color-picker';
import type { Edit } from './editor';
import type { Mode } from './player';
import { Segmented } from './primitives/segmented';
import { Tooltip, TooltipContent, TooltipTrigger } from './primitives/tooltip';
import { PRESETS, hasLook } from '../presets';
import { describe, exprThumb, lookThumb, shapeThumb } from './site';

type Tab = 'shape' | 'expression' | 'color';

const TILE = cn(
  'group/tile relative flex min-w-0 flex-col items-center gap-1 rounded-lg px-1 pt-1.5 pb-1.5 text-2xs font-medium text-foreground-muted outline-offset-0',
  'transition-[background-color,color,box-shadow] duration-(--motion-normal) hover:bg-hover hover:text-foreground',
  'data-[on=true]:bg-surface-raised data-[on=true]:text-foreground data-[on=true]:shadow-lift',
);

const ART = 'block size-12 transition-transform duration-(--motion-slow) ease-out-expo group-hover/tile:scale-108 group-active/tile:scale-95 [&_svg]:block';

/** a radio group of tiles: arrow keys move the choice, as radios do (a walk with the arrows is one undo step) */
function TileGroup<T extends string>({ label, values, value, onChange, children }: { label: string; values: readonly T[]; value: T; onChange: (v: T, key?: string) => void; children: (v: T, on: boolean) => ReactNode }) {
  const group = useRef<HTMLDivElement>(null);
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const cols = 4;
    const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols }[event.key];
    if (!step) return;
    event.preventDefault();
    const at = values.indexOf(value);
    const next = Math.max(0, Math.min(values.length - 1, at + step));
    onChange(values[next], label);
    group.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next]?.focus();
  }
  return (
    <div ref={group} role="radiogroup" aria-label={label} className="grid animate-panel-in grid-cols-4 gap-1.5" onKeyDown={onKeyDown}>
      {values.map((v) => children(v, v === value))}
    </div>
  );
}

const CHIP = cn(
  'group/chip grid size-9 shrink-0 snap-start place-items-center rounded-lg outline-offset-0 touch:size-10',
  'transition-[background-color,box-shadow] duration-(--motion-normal) hover:bg-hover',
  'data-[on=true]:bg-surface-raised data-[on=true]:shadow-lift',
);

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** the ready-made blobs: a row of looks to start from, each one marked while it is the avatar's */
function Presets({ state, edit, S }: { state: BlobState; edit: Edit; S: Strings }) {
  const thumbs = useMemo(() => PRESETS.map((p) => lookThumb(p)), []);
  return (
    <div role="group" aria-label={S.presets} className="-m-1 flex snap-x snap-mandatory justify-between gap-1 overflow-x-auto touch:gap-0.5 overscroll-x-contain p-1 [scrollbar-width:none]">
      {PRESETS.map((p, i) => {
        const on = hasLook(state, p);
        const name = capital(describe({ ...state, ...p }, S));
        return (
          <Tooltip key={i}>
            <TooltipTrigger asChild>
              <button type="button" aria-pressed={on} aria-label={name} data-on={on} className={CHIP} onClick={() => edit((s) => Object.assign(s, p))}>
                <span aria-hidden className="block size-7 transition-transform duration-(--motion-slow) ease-out-expo group-hover/chip:scale-110 group-active/chip:scale-95 [&_svg]:block" dangerouslySetInnerHTML={{ __html: thumbs[i] }} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{name}</TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}

const TABS = [
  { value: 'shape', icon: Shapes },
  { value: 'expression', icon: Smile },
  { value: 'color', icon: Palette },
] as const;

/** the panel by the stage: the look in Customize, the animation library (handed in) in Animate */
export function OptionsCard({ state, edit, mode, library, S, className }: { state: BlobState; edit: Edit; mode: Mode; library: ReactNode; S: Strings; className?: string }) {
  const [tab, setTab] = useState<Tab>('shape');
  // the grids redraw a moment after the stage, so dragging a color stays smooth
  const look = useDeferredValue(state);
  const shapes = useMemo(() => Object.fromEntries(SHAPES.map((v) => [v, shapeThumb(look, v)])), [look.color, look.expression]);
  const faces = useMemo(() => Object.fromEntries(EXPRESSIONS.map((v) => [v, exprThumb(look, v)])), [look.color, look.shape]);

  return (
    <section aria-label={S.options} className={cn('flex flex-col gap-3 rounded-xl border border-border bg-surface p-3 shadow-lg', className)}>
      {mode === 'customize' ? (
        <>
          <Presets state={state} edit={edit} S={S} />
          <Segmented
            tabs
            iconOnly
            size="md"
            label={S.options}
            value={tab}
            onChange={setTab}
            options={TABS.map((t) => ({ ...t, label: S[t.value], controls: `panel-${t.value}` }))}
            wrap={(o, button) => (
              <Tooltip>
                <TooltipTrigger asChild>{button}</TooltipTrigger>
                <TooltipContent side="bottom">{o.label}</TooltipContent>
              </Tooltip>
            )}
          />
          <div role="tabpanel" id={`panel-${tab}`} aria-label={S[tab]} className="min-h-0">
            {tab === 'shape' ? (
              <TileGroup label={S.shape} values={SHAPES} value={state.shape} onChange={(v, key) => edit((s) => (s.shape = v), key)}>
                {(v, on) => (
                  <button key={v} type="button" role="radio" aria-checked={on} data-on={on} tabIndex={on ? 0 : -1} className={TILE} onClick={() => edit((s) => (s.shape = v))}>
                    <span className={ART} dangerouslySetInnerHTML={{ __html: shapes[v] }} />
                    <span className="max-w-full truncate">{S.shapes[v]}</span>
                  </button>
                )}
              </TileGroup>
            ) : tab === 'expression' ? (
              <TileGroup label={S.expression} values={EXPRESSIONS} value={state.expression} onChange={(v, key) => edit((s) => (s.expression = v), key)}>
                {(v, on) => (
                  <button key={v} type="button" role="radio" aria-checked={on} data-on={on} tabIndex={on ? 0 : -1} className={TILE} onClick={() => edit((s) => (s.expression = v))}>
                    <span className={ART} dangerouslySetInnerHTML={{ __html: faces[v] }} />
                    <span className="max-w-full truncate">{S.expressions[v]}</span>
                  </button>
                )}
              </TileGroup>
            ) : (
              <div className="animate-panel-in">
                <ColorSwatches value={state.color} onChange={(hex, key) => edit((s) => (s.color = hex), key)} S={S} />
              </div>
            )}
          </div>
        </>
      ) : (
        library
      )}
    </section>
  );
}
