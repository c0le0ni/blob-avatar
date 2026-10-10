import { Palette, Plus, Shapes, Smile } from 'lucide-react';
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { ANIMS, DEFAULT_DUR, EXPRESSIONS, MAX_CLIPS, SHAPES, frame, type Anim, type BlobState } from '../engine';
import { LiveSvg } from '../render/svg';
import type { Strings } from '../i18n/strings';
import { cn } from '../lib/cn';
import { ColorSwatches } from './color-picker';
import type { Edit } from './editor';
import type { Mode } from './player';
import { Segmented } from './primitives/segmented';
import { Tooltip, TooltipContent, TooltipTrigger } from './primitives/tooltip';
import { FULL_VIEW, animLook, animThumb, exprThumb, shapeThumb } from './site';

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

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** an animation's tile: a still of its moment, and the animation itself under the pointer */
function AnimTile({ anim, state, thumb, full, S, onAdd }: { anim: Anim; state: BlobState; thumb: { svg: string; view: string }; full: boolean; S: Strings; onAdd: (a: Anim) => void }) {
  const art = useRef<HTMLSpanElement>(null);
  const run = useRef<number | null>(null);

  const stop = () => {
    if (run.current === null) return;
    cancelAnimationFrame(run.current);
    run.current = null;
    if (art.current) art.current.innerHTML = thumb.svg;
  };

  const start = () => {
    if (run.current !== null || !art.current || reducedMotion()) return;
    const live = new LiveSvg();
    live.el.setAttribute('width', '100%');
    live.el.setAttribute('height', '100%');
    live.el.style.overflow = 'hidden';
    const s = animLook(state, anim);
    const L = DEFAULT_DUR[anim] + 0.9;
    const from = thumb.view.split(' ').map(Number);
    const to = FULL_VIEW.split(' ').map(Number);
    const t0 = performance.now();
    const tick = (now: number) => {
      const t = (now - t0) / 1000;
      // it zooms out from the still to the whole blob as it starts
      const u = 1 - (1 - Math.min(1, t / 0.35)) ** 3;
      live.el.setAttribute('viewBox', from.map((v, i) => v + (to[i] - v) * u).join(' '));
      live.update(frame(s, t % L, { gaze: [0, 0] }));
      run.current = requestAnimationFrame(tick);
    };
    art.current.replaceChildren(live.el);
    run.current = requestAnimationFrame(tick);
  };

  // a new look while playing: the still takes over again
  useEffect(() => stop, [thumb.svg]);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={S.addAnim(S.anims[anim])}
          aria-disabled={full}
          className={cn(TILE, full && 'opacity-50')}
          onClick={() => !full && onAdd(anim)}
          onPointerEnter={(e) => e.pointerType !== 'touch' && start()}
          onPointerLeave={stop}
          onFocus={start}
          onBlur={stop}
        >
          <span ref={art} className={ART} dangerouslySetInnerHTML={{ __html: thumb.svg }} />
          <span className="max-w-full truncate">{S.anims[anim]}</span>
          <span aria-hidden className="absolute top-1 right-1 grid size-4 scale-75 place-items-center rounded-full bg-accent text-accent-foreground opacity-0 transition-[opacity,scale] duration-(--motion-normal) ease-out-expo group-hover/tile:scale-100 group-hover/tile:opacity-100 touch:hidden">
            <Plus className="size-3" strokeWidth={2.5} />
          </span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{full ? S.full : S.addAnim(S.anims[anim])}</TooltipContent>
    </Tooltip>
  );
}

const TABS = [
  { value: 'shape', icon: Shapes },
  { value: 'expression', icon: Smile },
  { value: 'color', icon: Palette },
] as const;

export function OptionsCard({ state, edit, mode, onAdd, S, className }: { state: BlobState; edit: Edit; mode: Mode; onAdd: (a: Anim) => void; S: Strings; className?: string }) {
  const [tab, setTab] = useState<Tab>('shape');
  // the grids redraw a moment after the stage, so dragging a color stays smooth
  const look = useDeferredValue(state);
  const shapes = useMemo(() => Object.fromEntries(SHAPES.map((v) => [v, shapeThumb(look, v)])), [look.color, look.expression]);
  const faces = useMemo(() => Object.fromEntries(EXPRESSIONS.map((v) => [v, exprThumb(look, v)])), [look.color, look.shape]);
  const anims = useMemo(() => (mode === 'animate' ? Object.fromEntries(ANIMS.map((v) => [v, animThumb(look, v)])) : null), [mode, look.color, look.shape, look.expression]);
  const full = state.cycle.length >= MAX_CLIPS;

  return (
    <section aria-label={S.options} className={cn('flex flex-col gap-3 rounded-xl border border-border bg-surface p-3 shadow-lg', className)}>
      {mode === 'customize' ? (
        <>
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
        <div className="grid animate-panel-in grid-cols-4 gap-1.5">
          {ANIMS.map((a) => (anims ? <AnimTile key={a} anim={a} state={look} thumb={anims[a]} full={full} S={S} onAdd={onAdd} /> : null))}
        </div>
      )}
    </section>
  );
}
