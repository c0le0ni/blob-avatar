import { Slot } from '@radix-ui/react-slot';
import { cva } from 'class-variance-authority';
import type { VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '../../lib/cn';

const buttonVariants = cva(
  [
    'inline-flex shrink-0 select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-md text-sm font-medium',
    // A press gives way a little under the pointer and springs back on release.
    'transition-[color,background-color,border-color,box-shadow,opacity,scale] duration-(--motion-fast) active:scale-[0.97]',
    'disabled:pointer-events-none disabled:opacity-50',
    '[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  ],
  {
    variants: {
      variant: {
        // The accent is reserved for the one action that matters on a surface.
        primary: 'bg-accent text-accent-foreground hover:bg-accent/90 active:bg-accent/80',
        secondary:
          'border border-border-strong bg-surface text-foreground hover:bg-surface-raised active:bg-surface',
        ghost: 'text-foreground-muted hover:bg-hover hover:text-foreground active:bg-pressed',
        // the one press with no way back
        danger: 'bg-danger text-white hover:bg-danger/90 active:bg-danger/80',
      },
      // The dense desktop scale; on a touch screen every press is a finger wide, 40px
      // at the least.
      size: {
        sm: 'h-control-sm px-2 text-xs touch:h-10',
        md: 'h-control px-2.5 touch:h-10',
        lg: 'h-control-lg px-3 touch:h-10',
        icon: 'size-control touch:size-10',
        'icon-sm': 'size-control-sm [&_svg]:size-3.5 touch:size-10',
      },
    },
    defaultVariants: {
      variant: 'secondary',
      size: 'md',
    },
  },
);

interface ButtonProps extends ComponentProps<'button'>, VariantProps<typeof buttonVariants> {
  /** Render the child element instead of a `<button>`, keeping the styling. */
  asChild?: boolean;
}

function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Component = asChild ? Slot : 'button';

  return (
    <Component
      data-slot="button"
      className={cn(buttonVariants({ variant, size }), className)}
      {...(asChild ? {} : { type: 'button' as const })}
      {...props}
    />
  );
}

export { Button, buttonVariants };
export type { ButtonProps };
