import { Link } from 'react-router-dom'
import { Plus, Trash2 } from 'lucide-react'
import { Panel } from '@/components/ui/panel'
import { FoodEmojiTile } from '@/components/food/food-emoji-tile'
import { MEAL_ICON } from '@/components/food/meal-icon'
import { MEAL_LABELS, MEAL_ORDER, grams, kcal } from '@/lib/format'
import { isFutureDay } from '@/lib/date'
import { cn } from '@/lib/utils'
import type { DiaryEntry, Meal } from '@/lib/types'

interface DiaryPanelProps {
  day: string
  byMeal: Record<Meal, DiaryEntry[]>
  total: number
  onDelete: (entry: DiaryEntry) => void
}

/**
 * One panel for the whole day rather than four cards. An empty meal costs a
 * single row here; before it cost a full card, so a morning screen was four
 * cards of "nothing yet".
 */
export function DiaryPanel({ day, byMeal, total, onDelete }: DiaryPanelProps) {
  return (
    <section>
      <header className="mb-2 flex items-baseline justify-between px-1">
        <h2 className="text-[13px] font-bold">
          {isFutureDay(day) ? 'Piano' : 'Diario'}
        </h2>
        <span className="tabular text-muted-foreground text-[11px] font-semibold">
          {kcal(total)} kcal {isFutureDay(day) ? 'pianificate' : 'registrate'}
        </span>
      </header>

      <Panel className="p-2">
        {MEAL_ORDER.map((meal, index) => (
          <MealGroup
            key={meal}
            meal={meal}
            day={day}
            entries={byMeal[meal] ?? []}
            onDelete={onDelete}
            className={index > 0 ? 'border-border/60 mt-1 border-t pt-1' : ''}
          />
        ))}
      </Panel>
    </section>
  )
}

function MealGroup({
  meal,
  day,
  entries,
  onDelete,
  className,
}: {
  meal: Meal
  day: string
  entries: DiaryEntry[]
  onDelete: (entry: DiaryEntry) => void
  className?: string
}) {
  const Icon = MEAL_ICON[meal]
  const total = entries.reduce((sum, e) => sum + e.kcal, 0)

  return (
    <div className={className}>
      <header className="flex items-center gap-2.5 py-1 pl-2">
        <span className="bg-secondary text-foreground/70 flex size-7 shrink-0 items-center justify-center rounded-full">
          <Icon className="size-3.5" strokeWidth={2.2} />
        </span>
        <h3 className="text-sm font-semibold">{MEAL_LABELS[meal]}</h3>
        {/* Always a number: an em dash next to the + button read as a stepper. */}
        <span className="tabular text-muted-foreground ml-auto text-[11px] font-semibold">
          {kcal(total)} kcal
        </span>
        <Link
          to={`/add?meal=${meal}&day=${day}`}
          className="hover:bg-secondary active:bg-secondary text-muted-foreground flex size-11 shrink-0 items-center justify-center rounded-full transition-colors"
          aria-label={`Aggiungi a ${MEAL_LABELS[meal]}`}
        >
          <Plus className="size-4" strokeWidth={2.4} />
        </Link>
      </header>

      {entries.length ? (
        <ul className="flex flex-col">
          {entries.map((entry) => (
            <li key={entry.id} className="flex items-center gap-2">
              <Link
                to={`/entry/${entry.id}?day=${day}`}
                className="hover:bg-secondary/60 active:bg-secondary flex min-w-0 flex-1 items-center gap-3 rounded-2xl px-2 py-2 transition-colors"
              >
                <FoodEmojiTile name={entry.nameSnapshot} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {entry.nameSnapshot}
                  </span>
                  <span className="text-muted-foreground block truncate text-xs">
                    {entry.brandSnapshot ? `${entry.brandSnapshot} · ` : ''}
                    {grams(entry.quantityG)} {entry.unit ?? 'g'}
                  </span>
                </span>
                <span className="tabular shrink-0 text-sm font-bold">
                  {kcal(entry.kcal)}
                </span>
              </Link>
              {/* Always visible: there is no hover on a phone, and this used to
                  be the only way to remove a line. */}
              <button
                type="button"
                onClick={() => onDelete(entry)}
                className={cn(
                  'text-muted-foreground hover:text-destructive active:text-destructive',
                  'flex size-11 shrink-0 items-center justify-center rounded-full transition-colors',
                )}
                aria-label={`Rimuovi ${entry.nameSnapshot}`}
              >
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
