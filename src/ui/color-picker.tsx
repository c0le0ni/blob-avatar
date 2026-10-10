import { Pipette, Plus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import { PALETTE } from '../engine';
import type { Strings } from '../i18n/strings';
import { cn } from '../lib/cn';
import { hexToHsv, hsvToHex, normalizeHex, type Hsv } from './color';
import { Popover, PopoverContent, PopoverTrigger } from './primitives/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from './primitives/tooltip';

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/** follow a press across an element, as fractions of its box, until it lets go */
function track(event: ReactPointerEvent<HTMLElement>, onPoint: (x: number, y: number) => void) {
  if (event.button !== 0) return;
  const el = event.currentTarget;
  el.setPointerCapture(event.pointerId);
  el.focus({ preventScroll: true });
  const at = (e: { clientX: number; clientY: number }) => {
    const r = el.getBoundingClientRect();
    onPoint(clamp01((e.clientX - r.left) / r.width), clamp01((e.clientY - r.top) / r.height));
  };
  at(event);
  const move = (e: PointerEvent) => at(e);
  const end = () => {
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerup', end);
    el.removeEventListener('pointercancel', end);
  };
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
}

const THUMB = 'pointer-events-none absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgb(0_0_0/0.25),0_1px_3px_rgb(0_0_0/0.35)]';
const SLIDER = 'relative touch-none outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

type EyeDropperCtor = new () => { open: () => Promise<{ sRGBHex: string }> };

/** any color: the shade area, the hue strip and the hex field */
export function ColorPicker({ value, onChange, S }: { value: string; onChange: (hex: string) => void; S: Strings }) {
  // the picker keeps its own hue, so a grey or a black does not lose it
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(value));
  const [text, setText] = useState(value.slice(1));
  const live = useRef(hsv);
  live.current = hsv;

  useEffect(() => {
    if (hsvToHex(live.current) !== value) setHsv(hexToHsv(value));
    setText(value.slice(1));
  }, [value]);

  const set = (next: Hsv) => {
    setHsv(next);
    onChange(hsvToHex(next));
  };

  const keys = (event: KeyboardEvent, axis: 'shade' | 'hue') => {
    const step = event.shiftKey ? 0.1 : 0.01;
    const h = live.current;
    const moves: Record<string, Hsv> =
      axis === 'shade'
        ? { ArrowRight: { ...h, s: clamp01(h.s + step) }, ArrowLeft: { ...h, s: clamp01(h.s - step) }, ArrowUp: { ...h, v: clamp01(h.v + step) }, ArrowDown: { ...h, v: clamp01(h.v - step) } }
        : { ArrowRight: { ...h, h: Math.min(360, h.h + step * 360) }, ArrowUp: { ...h, h: Math.min(360, h.h + step * 360) }, ArrowLeft: { ...h, h: Math.max(0, h.h - step * 360) }, ArrowDown: { ...h, h: Math.max(0, h.h - step * 360) }, Home: { ...h, h: 0 }, End: { ...h, h: 360 } };
    const next = moves[event.key];
    if (!next) return;
    event.preventDefault();
    set(next);
  };

  const dropper = (window as Window & { EyeDropper?: EyeDropperCtor }).EyeDropper;
  const hex = hsvToHex(hsv);

  return (
    <div className="flex flex-col gap-3">
      <div
        role="slider"
        tabIndex={0}
        aria-label={S.shade}
        aria-valuetext={`${Math.round(hsv.s * 100)}%, ${Math.round(hsv.v * 100)}%`}
        className={cn(SLIDER, 'h-36 w-full cursor-crosshair rounded-md')}
        style={{ background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${hsv.h} 100% 50%))` }}
        onPointerDown={(e) => track(e, (x, y) => set({ ...live.current, s: x, v: 1 - y }))}
        onKeyDown={(e) => keys(e, 'shade')}
      >
        <span className={THUMB} style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: hex }} />
      </div>
      <div
        role="slider"
        tabIndex={0}
        aria-label={S.hue}
        aria-valuemin={0}
        aria-valuemax={360}
        aria-valuenow={Math.round(hsv.h)}
        className={cn(SLIDER, 'h-3 w-full cursor-pointer rounded-full')}
        style={{ background: 'linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)' }}
        onPointerDown={(e) => track(e, (x) => set({ ...live.current, h: x * 360 }))}
        onKeyDown={(e) => keys(e, 'hue')}
      >
        <span className={cn(THUMB, 'top-1/2')} style={{ left: `${(hsv.h / 360) * 100}%`, background: `hsl(${hsv.h} 100% 50%)` }} />
      </div>
      <div className="flex items-center gap-2">
        <label className="flex h-control-lg min-w-0 flex-1 items-center gap-1 rounded-md border border-border-strong bg-surface-sunken px-2.5 transition-colors focus-within:border-foreground-subtle hover:border-foreground-subtle touch:h-10">
          <span aria-hidden className="size-3.5 shrink-0 rounded-full shadow-[inset_0_0_0_1px_var(--pulse-border-strong)]" style={{ background: hex }} />
          <span aria-hidden className="ml-1 font-mono text-sm text-foreground-subtle">#</span>
          <input
            value={text}
            aria-label={S.hex}
            spellCheck={false}
            autoComplete="off"
            maxLength={7}
            className="w-full min-w-0 bg-transparent font-mono text-sm text-foreground uppercase outline-none"
            onChange={(e) => {
              setText(e.target.value.replace('#', ''));
              const n = normalizeHex(e.target.value);
              if (n && e.target.value.replace('#', '').length === 6) set(hexToHsv(n));
            }}
            onBlur={() => {
              const n = normalizeHex(text);
              if (n) set(hexToHsv(n));
              else setText(value.slice(1));
            }}
            onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
          />
        </label>
        {dropper ? (
          <button
            type="button"
            aria-label="Eyedropper"
            className="flex size-control-lg shrink-0 items-center justify-center rounded-md border border-border-strong bg-surface text-foreground-muted transition-colors hover:bg-surface-raised hover:text-foreground touch:size-10"
            onClick={async () => {
              try {
                const { sRGBHex } = await new dropper().open();
                const n = normalizeHex(sRGBHex);
                if (n) set(hexToHsv(n));
              } catch {}
            }}
          >
            <Pipette aria-hidden className="size-4" />
          </button>
        ) : null}
      </div>
    </div>
  );
}

const SWATCH = cn(
  'relative aspect-square w-full rounded-full shadow-[inset_0_0_0_1px_var(--pulse-border-strong)] outline-offset-4',
  'transition-[scale,box-shadow] duration-(--motion-normal) ease-out-expo hover:scale-108 active:scale-95',
  'data-[on=true]:shadow-[inset_0_0_0_1px_var(--pulse-border-strong),0_0_0_2px_var(--pulse-surface),0_0_0_4px_var(--pulse-foreground)]',
);

/**
 * The twelve colors and a way to any other. A drag in the picker or a walk with the
 * arrows comes with a key, so it makes one undo step.
 */
export function ColorSwatches({ value, onChange, S }: { value: string; onChange: (hex: string, key?: string) => void; S: Strings }) {
  const own = !PALETTE.some((p) => p.hex === value);
  const group = useRef<HTMLDivElement>(null);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const at = PALETTE.findIndex((p) => p.hex === value);
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (!step || !(event.target as HTMLElement).matches('[role="radio"]')) return;
    event.preventDefault();
    const next = (Math.max(0, at) + step + PALETTE.length) % PALETTE.length;
    onChange(PALETTE[next].hex, 'swatches');
    group.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next]?.focus();
  }

  return (
    <div className="grid grid-cols-7 gap-2.5">
      <div ref={group} role="radiogroup" aria-label={S.color} className="contents" onKeyDown={onKeyDown}>
        {PALETTE.map((p, i) => {
          const on = p.hex === value;
          return (
            <Tooltip key={p.id}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  role="radio"
                  aria-checked={on}
                  data-on={on}
                  aria-label={S.palette[p.id]}
                  tabIndex={on || (own && i === 0) ? 0 : -1}
                  className={SWATCH}
                  style={{ background: p.hex }}
                  onClick={() => onChange(p.hex)}
                />
              </TooltipTrigger>
              <TooltipContent>{S.palette[p.id]}</TooltipContent>
            </Tooltip>
          );
        })}
      </div>
      <Popover>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label={S.anyColor}
                data-on={own}
                className={cn(SWATCH, 'grid place-items-center')}
                style={{ background: own ? value : 'conic-gradient(from 90deg, #f43f5e, #f59e0b, #aefa0e, #22d3ee, #6366f1, #d946ef, #f43f5e)' }}
              >
                {own ? null : (
                  <span className="grid size-4.5 place-items-center rounded-full bg-surface text-foreground shadow-sm">
                    <Plus aria-hidden className="size-3" strokeWidth={2.5} />
                  </span>
                )}
              </button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent>{S.anyColor}</TooltipContent>
        </Tooltip>
        <PopoverContent side="bottom" align="end" collisionPadding={12} className="w-64 p-3">
          <ColorPicker value={value} onChange={(hex) => onChange(hex, 'picker')} S={S} />
        </PopoverContent>
      </Popover>
    </div>
  );
}
