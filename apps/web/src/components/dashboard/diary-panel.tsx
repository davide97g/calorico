import { useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { BookmarkPlus, CopyPlus, Plus, Trash2 } from 'lucide-react'
import { Panel } from '@/components/ui/panel'
import { Button } from '@/components/ui/button'
import { FoodEmojiTile } from '@/components/food/food-emoji-tile'
import { SaveMealDialog } from '@/components/food/save-meal-dialog'
import { MEAL_ACCENT, MEAL_ICON } from '@/components/food/meal-icon'
import { mealItemsFromEntries } from '@/hooks/use-meals'
import { MEAL_LABELS, MEAL_ORDER, grams, kcal } from '@/lib/format'
import { isFutureDay } from '@/lib/date'
import { cn } from '@/lib/utils'
import type { DiaryEntry, Meal } from '@/lib/types'

interface DiaryPanelProps {
  day: string
  byMeal: Record<Meal, DiaryEntry[]>
  total: number
  onDelete: (entry: DiaryEntry) => void
  /** Offered inside the panel, but only while the day is still empty. */
  onCopyYesterday: () => void
  /** Copies one meal from yesterday onto this day. */
  onCopyMeal: (meal: Meal) => void
  copying?: boolean
}

/**
 * One panel for the whole day rather than four cards. An empty meal costs a
 * single row here; before it cost a full card, so a morning screen was four
 * cards of "nothing yet".
 */
export function DiaryPanel({
  day,
  byMeal,
  total,
  onDelete,
  onCopyYesterday,
  onCopyMeal,
  copying,
}: DiaryPanelProps) {
  const empty = MEAL_ORDER.every((meal) => !byMeal[meal]?.length)

  return (
    <section>
      <header className="mb-2 flex items-baseline justify-between px-1">
        <h2 className="text-sm font-bold">
          {isFutureDay(day) ? 'Piano' : 'Diario'}
        </h2>
        <span className="tabular text-muted-foreground text-micro font-medium">
          {kcal(total)} kcal {isFutureDay(day) ? 'pianificate' : 'registrate'}
        </span>
      </header>

      {/* Each meal carries its own tint, so the four blocks separate on colour
          alone — no rule between them to do the job. */}
      <Panel className="flex flex-col gap-1.5 p-2">
        {MEAL_ORDER.map((meal) => (
          <MealGroup
            key={meal}
            meal={meal}
            day={day}
            entries={byMeal[meal] ?? []}
            onDelete={onDelete}
            onCopyMeal={empty ? undefined : onCopyMeal}
            copying={copying}
          />
        ))}

        {/* Repeating yesterday only makes sense while there is nothing here to
            repeat it onto, so it lives with the empty day rather than taking a
            permanent tile on the dashboard. */}
        {empty ? (
          <Button
            variant="secondary"
            className="mt-1 h-12 w-full rounded-full text-sm font-semibold"
            onClick={onCopyYesterday}
            disabled={copying}
          >
            <CopyPlus className="text-primary-strong size-4" />
            {copying ? 'Copio…' : 'Copia il giorno prima'}
          </Button>
        ) : null}
      </Panel>
    </section>
  )
}

function MealGroup({
  meal,
  day,
  entries,
  onDelete,
  onCopyMeal,
  copying,
}: {
  meal: Meal
  day: string
  entries: DiaryEntry[]
  onDelete: (entry: DiaryEntry) => void
  onCopyMeal?: (meal: Meal) => void
  copying?: boolean
}) {
  const Icon = MEAL_ICON[meal]
  const total = entries.reduce((sum, e) => sum + e.kcal, 0)
  const [saving, setSaving] = useState(false)
  const saveItems = mealItemsFromEntries(entries)

  return (
    <div
      className="rounded-lg p-0.5 pb-1"
      style={
        {
          '--meal': MEAL_ACCENT[meal],
          // Strongest at the header and gone by the last row, so the tint
          // labels the meal without colouring the food underneath it.
          backgroundImage:
            'linear-gradient(150deg, color-mix(in oklab, var(--meal) 34%, transparent), color-mix(in oklab, var(--meal) 8%, transparent) 58%, transparent 92%)',
        } as CSSProperties
      }
    >
      <header className="flex items-center gap-2.5 py-1 pl-1.5">
        <span
          className="flex size-7 shrink-0 items-center justify-center rounded-full text-[oklch(0.24_0.03_145)]"
          style={{
            backgroundImage:
              'linear-gradient(140deg, var(--meal), color-mix(in oklab, var(--meal) 62%, white))',
          }}
        >
          <Icon className="size-3.5" strokeWidth={2.2} />
        </span>
        <h3 className="text-sm font-semibold">{MEAL_LABELS[meal]}</h3>
        {/* Always a number: an em dash next to the + button read as a stepper. */}
        <span className="tabular text-muted-foreground ml-auto text-micro font-medium">
          {kcal(total)} kcal
        </span>
        {saveItems.length > 0 ? (
          <button
            type="button"
            onClick={() => setSaving(true)}
            className="hover:bg-secondary active:bg-secondary text-muted-foreground flex size-11 shrink-0 items-center justify-center rounded-full transition-colors"
            aria-label={`Salva ${MEAL_LABELS[meal]} come piatto`}
          >
            <BookmarkPlus className="size-4" strokeWidth={2.4} />
          </button>
        ) : null}
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
                className="hover:bg-secondary/60 active:bg-secondary flex min-w-0 flex-1 items-center gap-3 rounded-md px-2 py-2 transition-colors"
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
      ) : onCopyMeal ? (
        <button
          type="button"
          onClick={() => onCopyMeal(meal)}
          disabled={copying}
          className="text-muted-foreground hover:bg-secondary/60 active:bg-secondary mx-1 mb-1 flex h-9 w-[calc(100%-0.5rem)] items-center justify-center gap-1.5 rounded-md text-xs font-semibold transition-colors"
        >
          <CopyPlus className="size-3.5" strokeWidth={2.4} />
          Copia da ieri
        </button>
      ) : null}

      <SaveMealDialog
        open={saving}
        onOpenChange={setSaving}
        meal={meal}
        items={saveItems}
        defaultName={MEAL_LABELS[meal]}
      />
    </div>
  )
}
