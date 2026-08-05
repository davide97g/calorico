import { Link } from 'react-router-dom'
import { Plus, Trash2 } from 'lucide-react'
import { Panel } from '@/components/ui/panel'
import { Button } from '@/components/ui/button'
import { FoodEmojiTile } from '@/components/food/food-emoji-tile'
import { MEAL_EMOJI, MEAL_LABELS, grams, kcal } from '@/lib/format'
import type { DiaryEntry, Meal } from '@/lib/types'

interface MealSectionProps {
  meal: Meal
  entries: DiaryEntry[]
  day: string
  onDelete: (entry: DiaryEntry) => void
}

export function MealSection({ meal, entries, day, onDelete }: MealSectionProps) {
  const total = entries.reduce((s, e) => s + e.kcal, 0)

  return (
    <Panel className="p-3">
      <header className="flex items-center gap-2.5 px-1">
        <span className="bg-secondary flex size-8 items-center justify-center rounded-full text-base">
          {MEAL_EMOJI[meal]}
        </span>
        <h3 className="text-[15px] font-semibold">{MEAL_LABELS[meal]}</h3>
        <span className="tabular text-muted-foreground ml-auto text-xs font-medium">
          {kcal(total)} kcal
        </span>
        <Button
          asChild
          variant="secondary"
          size="icon-sm"
          className="rounded-full"
        >
          <Link
            to={`/add?meal=${meal}&day=${day}`}
            aria-label={`Aggiungi a ${MEAL_LABELS[meal]}`}
          >
            <Plus className="size-4" />
          </Link>
        </Button>
      </header>

      {entries.length === 0 ? (
        <p className="text-muted-foreground px-1 pt-3 pb-1 text-xs">
          Niente ancora. Tocca + per aggiungere.
        </p>
      ) : (
        <ul className="mt-2 flex flex-col">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className="group hover:bg-secondary/60 flex items-center gap-3 rounded-2xl px-1 py-2 transition-colors"
            >
              <Link
                to={`/entry/${entry.id}?day=${day}`}
                className="flex min-w-0 flex-1 items-center gap-3"
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
                <span className="tabular shrink-0 text-sm font-semibold">
                  {kcal(entry.kcal)}
                </span>
              </Link>
              <button
                type="button"
                onClick={() => onDelete(entry)}
                className="text-muted-foreground hover:text-destructive shrink-0 p-1 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                aria-label={`Rimuovi ${entry.nameSnapshot}`}
              >
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}
