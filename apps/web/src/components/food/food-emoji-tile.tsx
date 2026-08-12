import { foodEmoji } from '@/lib/food-emoji'
import { cn } from '@/lib/utils'

// Emoji sits at ~55% of the tile: big enough to read, small enough to breathe.
const SIZES = {
  sm: 'size-9 rounded-md text-xl',
  md: 'size-11 rounded-md text-2xl',
  lg: 'size-16 rounded-md text-4xl',
} as const

/**
 * Square emoji tile for a food, guessed from its name.
 *
 * Lists and grouped views use this and never a product photo: a column of
 * packshots at 36 px is noise, while one emoji per row scans. Real photos live
 * on the detail pages, in `FoodGallery`.
 */
export function FoodEmojiTile({
  name,
  category,
  size = 'md',
  className,
}: {
  name: string
  category?: string | null
  size?: keyof typeof SIZES
  className?: string
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'bg-secondary flex shrink-0 items-center justify-center leading-none select-none',
        SIZES[size],
        className,
      )}
    >
      {foodEmoji(name, category)}
    </span>
  )
}
