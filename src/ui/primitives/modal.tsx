import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { Button } from './button';

/**
 * What opens over the page: one object to work on (a clip) or a list to read (the
 * keys). Centered on a desk, a sheet from the bottom on a phone; it arrives and
 * leaves with motion, and Escape, the backdrop or the close button send it away.
 * Radix underneath for focus, scroll and dismissal, as the popovers.
 */
export function Modal({
  open,
  onOpenChange,
  title,
  closeLabel,
  children,
  className,
  ...props
}: Omit<ComponentProps<typeof DialogPrimitive.Content>, 'title'> & { open: boolean; onOpenChange: (open: boolean) => void; title: ReactNode; closeLabel: string }) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-overlay data-[state=closed]:animate-fade-out data-[state=open]:animate-fade-in" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className={cn(
            'fixed z-50 flex flex-col gap-4 overflow-y-auto overscroll-contain border border-border-strong bg-surface p-4 text-foreground shadow-xl outline-none',
            // a sheet on a phone
            'inset-x-0 bottom-0 max-h-[92dvh] rounded-t-2xl pb-[max(1rem,env(safe-area-inset-bottom))] data-[state=closed]:animate-sheet-out data-[state=open]:animate-sheet-in',
            // a dialog from sm up
            'sm:inset-x-auto sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:max-h-[min(88dvh,44rem)] sm:w-[24rem] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:pb-4 sm:data-[state=closed]:animate-pop-out sm:data-[state=open]:animate-pop-in',
            className,
          )}
          {...props}
        >
          <div className="flex items-center justify-between gap-3">
            <DialogPrimitive.Title className="min-w-0 truncate text-lg font-medium">{title}</DialogPrimitive.Title>
            <DialogPrimitive.Close asChild>
              <Button variant="ghost" size="icon" aria-label={closeLabel} className="-mr-1.5 size-8 touch:size-10">
                <X aria-hidden />
              </Button>
            </DialogPrimitive.Close>
          </div>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
