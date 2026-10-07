import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import type { ComponentProps } from 'react';
import { TOUCH_QUERY, useMediaQuery } from '../../lib/use-media-query';
import { cn } from '../../lib/cn';

function TooltipProvider({
  delayDuration = 400,
  ...props
}: ComponentProps<typeof TooltipPrimitive.Provider>) {
  return <TooltipPrimitive.Provider delayDuration={delayDuration} {...props} />;
}

/**
 * A tooltip names what a pointer is resting on. A finger never rests: on a
 * touch device a tooltip only ever opens because something took focus — a
 * sheet focusing its first button as it opens — and it sits over the screen
 * saying nothing anyone asked. There it never opens, and nothing is drawn.
 * The one place this is decided, for every tooltip in the app.
 */
function Tooltip(props: ComponentProps<typeof TooltipPrimitive.Root>) {
  const touch = useMediaQuery(TOUCH_QUERY);

  return (
    <TooltipPrimitive.Root data-slot="tooltip" {...props} {...(touch ? { open: false } : {})} />
  );
}

function TooltipTrigger(props: ComponentProps<typeof TooltipPrimitive.Trigger>) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />;
}

function TooltipContent({
  className,
  sideOffset = 6,
  children,
  ...props
}: ComponentProps<typeof TooltipPrimitive.Content>) {
  const touch = useMediaQuery(TOUCH_QUERY);

  if (touch) {
    return null;
  }

  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        className={cn(
          'z-50 flex max-w-64 origin-(--radix-tooltip-content-transform-origin) items-center gap-1.5 rounded-md border border-border-strong bg-surface-raised px-2 py-1',
          'text-2xs font-medium text-foreground shadow-md',
          // Radix names the open state by how it opened; both arrive the same way.
          'data-[state=closed]:animate-pop-out data-[state=delayed-open]:animate-pop-in data-[state=instant-open]:animate-pop-in',
          className,
        )}
        {...props}
      >
        {children}
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  );
}

export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger };
