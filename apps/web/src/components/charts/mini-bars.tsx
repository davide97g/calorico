import type { DailyStat } from '@/lib/types'
import { longDayLabel, shortDayLabel, weekdayLabel } from '@/lib/date'
import { cn } from '@/lib/utils'

const labelOf = (day: DailyStat) => longDayLabel(day.day)

interface MiniBarsProps {
  days: DailyStat[]
  target: number
  /** Colours each bar by where it landed. Without it every logged day is lime. */
  band?: { min: number; max: number } | null
  labels?: 'weekday' | 'date' | 'none'
  selectedDay?: string
  onSelectDay?: (day: string) => void
  height?: number
  className?: string
}

/**
 * A week of days as bars, small enough to sit inside a card next to a figure.
 *
 * Deliberately not a chart library: at this size axes and tooltips are noise,
 * and what the bars have to answer is "how did the days sit against the band" —
 * so the colour carries the verdict and the dashed line carries the target.
 */
export function MiniBars({
  days,
  target,
  band = null,
  labels = 'none',
  selectedDay,
  onSelectDay,
  height = 44,
  className,
}: MiniBarsProps) {
  // Headroom above the target so an over-target day still has bar left to draw.
  const ceiling = Math.max(target * 1.15, ...days.map((d) => d.kcal), 1)
  const targetOffset = target > 0 ? (target / ceiling) * 100 : 0

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <div className="relative flex items-end gap-1" style={{ height }}>
        {target > 0 ? (
          <span
            aria-hidden
            className="border-border absolute inset-x-0 border-t border-dashed"
            style={{ bottom: `${Math.min(100, targetOffset)}%` }}
          />
        ) : null}

        {days.map((day) => {
          const empty = day.entries === 0
          const over = band ? day.kcal > band.max : false
          const under = band ? day.kcal < band.min : false

          const bar = (
            <span
              className={cn(
                'w-full rounded-[4px] transition-[height,background-color] duration-500',
                empty
                  ? 'bg-secondary'
                  : over
                    ? 'bg-over-warn'
                    : under
                      ? 'bg-ring-track'
                      : 'bg-primary',
                selectedDay === day.day && 'ring-primary-strong ring-2',
              )}
              style={{
                height: empty
                  ? 3
                  : `${Math.max(6, Math.min(100, (day.kcal / ceiling) * 100))}%`,
              }}
            />
          )

          return onSelectDay ? (
            <button
              key={day.day}
              type="button"
              onClick={() => onSelectDay(day.day)}
              aria-label={`${labelOf(day)}, ${Math.round(day.kcal)} kcal`}
              className="flex h-full flex-1 items-end"
            >
              {bar}
            </button>
          ) : (
            <div key={day.day} className="flex h-full flex-1 items-end">
              {bar}
            </div>
          )
        })}
      </div>

      {labels === 'none' ? null : (
        <div className="text-muted-foreground flex gap-1 text-micro">
          {days.map((day) => (
            <span
              key={day.day}
              className={cn(
                'flex-1 text-center',
                selectedDay === day.day && 'text-foreground font-bold',
              )}
            >
              {labels === 'weekday'
                ? weekdayLabel(day.day)
                : shortDayLabel(day.day)}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
