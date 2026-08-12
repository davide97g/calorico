import { Link } from 'react-router-dom'
import { Loader2, RotateCcw } from 'lucide-react'
import { FoodEmojiTile } from '@/components/food/food-emoji-tile'
import { SavedMealChip } from '@/components/food/saved-meal-row'
import { Skeleton } from '@/components/ui/skeleton'
import { useRecentFoods } from '@/hooks/use-diary'
import { useLogMeal, useSavedMeals } from '@/hooks/use-meals'
import { useQuickLog } from '@/hooks/use-quick-log'
import { rememberedPortion } from '@/lib/portion'
import { MEAL_LABELS, currentMeal, grams, kcal } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { RecentFood } from '@/lib/types'

/** Enough to cover a normal week of habits without becoming a second search. */
const SHOWN = 10
const PIATTI = 5

/**
 * The warm path onto the dashboard: the foods this user actually eats, each with
 * the portion they usually eat, one tap from being logged.
 *
 * Everything else on this screen starts a search. Repeating a food is the thing
 * people do every day, and it used to cost five taps and two network waits —
 * dashboard, search screen, recents tab, food page, save.
 */
export function QuickLog({ day }: { day: string }) {
  const meal = currentMeal()
  const { data, isLoading } = useRecentFoods(meal)
  const piatti = useSavedMeals(meal)
  const { log, loggingFoodId } = useQuickLog()
  const logMeal = useLogMeal()

  const items = data?.items.slice(0, SHOWN) ?? []
  const saved =
    piatti.data?.items.filter((p) => p.meal === meal).slice(0, PIATTI) ?? []

  // Nothing logged yet: the strip has nothing to remember, and an empty rail
  // teaching the feature would push the diary further down the screen.
  if (!isLoading && !piatti.isLoading && items.length === 0 && saved.length === 0)
    return null

  return (
    <section>
      <header className="mb-2 flex items-baseline justify-between px-1">
        <h2 className="flex items-center gap-1.5 text-sm font-bold">
          <RotateCcw className="text-primary-strong size-3.5" strokeWidth={2.4} />
          Di nuovo in {MEAL_LABELS[meal].toLowerCase()}
        </h2>
        <Link
          to={`/add?day=${day}&meal=${meal}`}
          className="text-primary-strong text-micro font-bold"
        >
          Cerca altro
        </Link>
      </header>

      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {isLoading || piatti.isLoading
          ? Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-[60px] w-[10.5rem] shrink-0 rounded-lg" />
            ))
          : (
            <>
              {saved.map((plate) => (
                <SavedMealChip
                  key={plate.id}
                  meal={plate}
                  busy={logMeal.isPending && logMeal.variables?.id === plate.id}
                  onLog={() => logMeal.mutate({ id: plate.id, day, meal })}
                />
              ))}
              {items.map((food) => (
                <QuickLogChip
                  key={food.id}
                  food={food}
                  busy={loggingFoodId === food.id}
                  onLog={() =>
                    log({
                      food,
                      quantityG: rememberedPortion(food).grams,
                      day,
                      meal,
                    })
                  }
                />
              ))}
            </>
          )}
      </div>
    </section>
  )
}

function QuickLogChip({
  food,
  busy,
  onLog,
}: {
  food: RecentFood
  busy: boolean
  onLog: () => void
}) {
  // This strip asks for logged foods only, so the portion is all but always the
  // remembered one; the fallback is here so the type never has to be lied about.
  const { grams: portion } = rememberedPortion(food)

  return (
    <button
      type="button"
      onClick={onLog}
      disabled={busy}
      className={cn(
        'bg-card shadow-soft flex min-h-[60px] w-[10.5rem] shrink-0 items-center gap-2.5 rounded-lg p-2 text-left',
        'transition-transform active:scale-[0.97] disabled:opacity-60',
      )}
      // The portion is half of what this button does, so it is in the label.
      aria-label={`Registra ${food.name}, ${grams(portion)} ${food.unit}`}
    >
      {busy ? (
        <span className="bg-secondary flex size-9 shrink-0 items-center justify-center rounded-md">
          <Loader2 className="text-primary-strong size-4 animate-spin" />
        </span>
      ) : (
        <FoodEmojiTile name={food.name} category={food.category} size="sm" />
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">
          {food.name}
        </span>
        <span className="text-muted-foreground tabular block truncate text-micro">
          {grams(portion)} {food.unit} ·{' '}
          {kcal((food.kcal100 * portion) / 100)} kcal
        </span>
      </span>
    </button>
  )
}
