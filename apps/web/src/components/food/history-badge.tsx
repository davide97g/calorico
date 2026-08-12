import { History } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Says that the quantity next to it came from this user's own history rather
 * than from a default.
 *
 * The quantity field opens pre-filled, and a pre-filled field says nothing about
 * where its number came from: 180 g because that is what was weighed out last
 * Tuesday reads exactly like 100 g because the app had to put something there.
 * The badge is the difference, which is also permission to trust the number and
 * just save.
 *
 * `compact` drops the words for rows that have no space for them — the icon
 * keeps its label for screen readers either way.
 */
export function HistoryBadge({
  label = 'Dalla cronologia',
  compact = false,
  className,
}: {
  label?: string
  compact?: boolean
  className?: string
}) {
  return (
    <span
      className={cn(
        'bg-secondary text-primary-strong inline-flex items-center gap-1 rounded-full text-micro font-semibold',
        compact ? 'size-5 justify-center' : 'px-2 py-0.5',
        className,
      )}
      title={label}
    >
      <History className="size-3 shrink-0" strokeWidth={2.4} aria-hidden />
      <span className={compact ? 'sr-only' : undefined}>{label}</span>
    </span>
  )
}
