import { clsx } from 'clsx';
import type { ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// tailwind-merge only knows Tailwind's default scales; the type scale and the
// control heights here are Coleoni OS's, so they are declared.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ['2xs'],
      spacing: ['control-sm', 'control', 'control-lg'],
    },
  },
});

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
