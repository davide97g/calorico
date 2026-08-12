import type { Meal, MealShare } from '@/lib/types'
import { kcal, MEAL_EMOJI, MEAL_LABELS, MEAL_ORDER } from '@/lib/format'
import { cn } from '@/lib/utils'

const MEAL_FILL: Record<Meal, string> = {
  breakfast: 'bg-meal-breakfast',
  lunch: 'bg-meal-lunch',
  dinner: 'bg-meal-dinner',
  snack: 'bg-meal-snack',
}

interface MealSplitProps {
  rows: MealShare[]
  /** "media" on a period, where each figure is per day the meal was eaten. */
  perDay?: boolean
  className?: string
}

/**
 * Where the calories arrive during the day, as one bar plus its four lines.
 *
 * The four meal hues are the diary's own, so a block of colour means the same
 * thing on both screens. Meals that were never logged still get a line: a
 * missing breakfast is the finding, and a legend that hides it hides the point.
 */
export function MealSplit({ rows, perDay = false, className }: MealSplitProps) {
  const ordered = MEAL_ORDER.map(
    (meal) =>
      rows.find((r) => r.meal === meal) ?? {
        meal,
        kcal: 0,
        share: 0,
        avgKcal: 0,
        days: 0,
        entries: 0,
      },
  )
  const total = ordered.reduce((s, r) => s + r.kcal, 0)

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div className="bg-secondary flex h-3 overflow-hidden rounded-full">
        {total === 0 ? null : (
          ordered.map((row) => (
            <span
              key={row.meal}
              className={cn(MEAL_FILL[row.meal], 'transition-[width]')}
              style={{ width: `${(row.kcal / total) * 100}%` }}
              aria-hidden
            />
          ))
        )}
      </div>

      <ul className="flex flex-col gap-2">
        {ordered.map((row) => (
          <li key={row.meal} className="flex items-center gap-2.5 text-xs">
            <span
              className={cn('size-2.5 shrink-0 rounded-[3px]', MEAL_FILL[row.meal])}
              aria-hidden
            />
            <span className="truncate">
              <span aria-hidden>{MEAL_EMOJI[row.meal]} </span>
              {MEAL_LABELS[row.meal]}
            </span>
            <span className="text-muted-foreground tabular ml-auto shrink-0">
              {row.share === 0 ? '—' : `${Math.round(row.share)}%`}
            </span>
            <span className="tabular w-20 shrink-0 text-right font-semibold">
              {kcal(perDay ? row.avgKcal : row.kcal)}
              <span className="text-muted-foreground font-normal"> kcal</span>
            </span>
          </li>
        ))}
      </ul>

      {perDay ? (
        <p className="text-muted-foreground text-micro">
          Media per giorno in cui il pasto è stato registrato.
        </p>
      ) : null}
    </div>
  )
}
