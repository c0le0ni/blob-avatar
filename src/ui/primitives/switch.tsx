import type { ComponentProps, MouseEvent } from 'react';
import { cn } from '../../lib/cn';

interface SwitchProps extends Omit<ComponentProps<'button'>, 'onChange'> {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}

/**
 * A binary setting that changes immediately. Native button semantics with
 * `role="switch"`, so Space and Enter toggle it and the focus ring is the
 * global one. The thumb stretches while pressed and the transition is
 * interruptible, both in CSS; reduced motion removes them.
 *
 * State is styled from `aria-checked`, never from `data-state`: a wrapper such
 * as a tooltip trigger owns `data-state` and would overwrite it.
 */
function Switch({ checked, onCheckedChange, className, onClick, ...props }: SwitchProps) {
  // A wrapper composes its own click handler in through `asChild`; it runs
  // first and may cancel the toggle.
  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    onClick?.(event);

    if (!event.defaultPrevented) {
      onCheckedChange(!checked);
    }
  }

  return (
    <button
      type="button"
      {...props}
      role="switch"
      aria-checked={checked}
      data-slot="switch"
      onClick={handleClick}
      className={cn(
        'group relative inline-flex h-4.5 w-8 shrink-0 items-center rounded-full border p-0.5 transition-colors',
        // A finger presses a 40px square around it; the switch itself keeps its size.
        "touch:after:absolute touch:after:-inset-x-1 touch:after:-inset-y-[11px] touch:after:content-['']",
        'border-border-strong bg-surface-sunken aria-checked:border-accent aria-checked:bg-accent',
        'disabled:pointer-events-none disabled:opacity-50',
        className,
      )}
    >
      <span
        data-slot="switch-thumb"
        className={cn(
          'block h-3.5 w-3.5 translate-x-0 rounded-full bg-surface-raised shadow-sm',
          'transition-[translate,width,background-color] duration-(--motion-normal) ease-out-quart',
          'group-aria-checked:translate-x-3.5 group-aria-checked:bg-accent-foreground',
          'group-active:w-4.5 group-active:group-aria-checked:translate-x-2.5',
        )}
      />
    </button>
  );
}

export { Switch };
export type { SwitchProps };
