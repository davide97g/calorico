import { kcal, WEEKDAY_INITIALS, WEEKDAY_NAMES } from '@/lib/format'
import { cn } from '@/lib/utils'

/** Monday first, the way an Italian week reads; the data is Sunday-indexed. */
const DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0]

interface WeekdayPatternProps {
  rows: { dow: number; avgKcal: number; loggedDays: number }[]
  target: number
  className?: string
}

/**
 * Average calories per weekday over the whole range. This is the one chart that
 * answers "which day gets away from me" — for most people it is Saturday, and
 * the answer only shows up once the weeks are stacked on top of each other.
 */
export function WeekdayPattern({ rows, target, className }: WeekdayPatternProps) {
  const values = rows.map((r) => r.avgKcal)
  const ceiling = Math.max(target * 1.1, ...values, 1)
  const worst = Math.max(...values)

  return (
    <div className={cn('flex items-end justify-between gap-1.5', className)}>
      {DISPLAY_ORDER.map((dow) => {
        const row = rows.find((r) => r.dow === dow)
        const value = row?.avgKcal ?? 0
        const heaviest = value > 0 && value === worst

        return (
          <div key={dow} className="flex min-w-0 flex-1 flex-col items-center gap-1">
            <span
              className={cn(
                'tabular text-micro font-semibold',
                heaviest ? 'text-foreground' : 'text-muted-foreground',
              )}
            >
              {value === 0 ? '—' : kcal(value)}
            </span>
            <div className="flex h-20 w-full items-end">
              <span
                className={cn(
                  'w-full rounded-[4px]',
                  value === 0
                    ? 'bg-secondary'
                    : heaviest
                      ? 'bg-primary'
                      : 'bg-ring-track',
                )}
                style={{
                  height: value === 0 ? 3 : `${Math.max(8, (value / ceiling) * 100)}%`,
                }}
                aria-label={`${WEEKDAY_NAMES[dow]}: ${kcal(value)} kcal di media su ${row?.loggedDays ?? 0} giorni`}
              />
            </div>
            <span className="text-muted-foreground text-micro font-semibold">
              {WEEKDAY_INITIALS[dow]}
            </span>
          </div>
        )
      })}
    </div>
  )
}
