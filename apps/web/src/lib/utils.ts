import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

/**
 * tailwind-merge has to be told about the type scale in index.css.
 *
 * It reads `text-*` as a colour unless it recognises the value as a size, so a
 * custom size next to a colour — `cn('text-micro', 'text-muted-foreground')` —
 * looked like two colours and the size was thrown away, leaving the text at the
 * inherited 16px. That is what blew the nav labels up.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [
        'text-micro',
        'text-display-sm',
        'text-display',
        'text-hero',
      ],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
