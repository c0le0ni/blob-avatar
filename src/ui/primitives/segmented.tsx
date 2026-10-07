import { Fragment, useLayoutEffect, useRef, useState } from 'react';
import type { ComponentType, KeyboardEvent, ReactNode } from 'react';
import { cn } from '../../lib/cn';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  icon?: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  /** tabs only: the panel the tab shows */
  controls?: string;
}

interface SegmentedProps<T extends string> {
  /** what the control chooses, for a screen reader */
  label: string;
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** tabs: arrow keys move between them and each one names its panel */
  tabs?: boolean;
  /** icons only, the label goes to the tooltip-less accessible name */
  iconOnly?: boolean;
  size?: 'sm' | 'md';
  className?: string;
  /** something to wrap each option in (a tooltip) */
  wrap?: (option: SegmentOption<T>, button: ReactNode) => ReactNode;
}

/**
 * A segmented control whose lifted thumb slides to the chosen option. The thumb
 * is measured from the pressed button, so every label keeps its own width.
 */
export function Segmented<T extends string>({ label, options, value, onChange, tabs = false, iconOnly = false, size = 'sm', className, wrap }: SegmentedProps<T>) {
  const group = useRef<HTMLDivElement>(null);
  // mounted at its first measured place, so only a change moves it
  const [thumb, setThumb] = useState<{ left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    const pressed = group.current?.querySelector<HTMLElement>('[data-on="true"]');
    if (!pressed) return setThumb(null);
    const measure = () => setThumb({ left: pressed.offsetLeft, width: pressed.offsetWidth });
    const observer = new ResizeObserver(measure);
    observer.observe(pressed);
    measure();
    return () => observer.disconnect();
  }, [value]);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!tabs) return;
    const at = options.findIndex((o) => o.value === value);
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : step ? (at + step + options.length) % options.length : -1;
    if (next < 0) return;
    event.preventDefault();
    onChange(options[next].value);
    group.current?.querySelectorAll<HTMLButtonElement>('button')[next]?.focus();
  }

  return (
    <div
      ref={group}
      role={tabs ? 'tablist' : 'group'}
      aria-label={label}
      onKeyDown={onKeyDown}
      className={cn('relative flex items-center gap-0.5 rounded-lg bg-surface-sunken p-0.5', className)}
    >
      {thumb === null || thumb.width === 0 ? null : (
        <span
          aria-hidden
          className="absolute top-0.5 bottom-0.5 left-0 rounded-md bg-surface-raised shadow-lift transition-[translate,width] duration-(--motion-slow) ease-out-expo"
          style={{ width: thumb.width, translate: `${thumb.left}px 0` }}
        />
      )}
      {options.map((option) => {
        const on = option.value === value;
        const Icon = option.icon;
        const button = (
          <button
            key={option.value}
            type="button"
            data-on={on}
            {...(tabs ? { role: 'tab', 'aria-selected': on, 'aria-controls': option.controls, tabIndex: on ? 0 : -1 } : { 'aria-pressed': on })}
            aria-label={iconOnly ? option.label : undefined}
            onClick={() => onChange(option.value)}
            className={cn(
              'relative flex flex-1 items-center justify-center gap-1.5 rounded-md font-medium whitespace-nowrap text-foreground-muted',
              'transition-colors duration-(--motion-normal) hover:text-foreground data-[on=true]:text-foreground',
              size === 'sm' ? 'h-6 px-2.5 text-xs touch:h-9' : 'h-7 px-3 text-sm touch:h-9',
              iconOnly && (size === 'sm' ? 'px-2' : 'px-3'),
            )}
          >
            {Icon ? <Icon aria-hidden className={cn('shrink-0', size === 'sm' ? 'size-3.5' : 'size-4')} /> : null}
            {iconOnly ? null : <span>{option.label}</span>}
          </button>
        );
        return wrap ? <Fragment key={option.value}>{wrap(option, button)}</Fragment> : button;
      })}
    </div>
  );
}
