import { cn } from '../../lib/cn';

/** a key on the keyboard, as a small cap */
export function Kbd({ children, className }: { children: string; className?: string }) {
  return (
    <kbd className={cn('inline-flex h-4.5 min-w-4.5 items-center justify-center rounded-xs border border-border-strong bg-surface-sunken px-1 font-mono text-2xs leading-none font-medium text-foreground-muted', className)}>
      {children}
    </kbd>
  );
}

/** the keys pressed together for a shortcut, cap by cap */
export function Keys({ keys, className }: { keys: string[]; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-0.5', className)}>
      {keys.map((k, i) => (
        <Kbd key={i}>{k}</Kbd>
      ))}
    </span>
  );
}
