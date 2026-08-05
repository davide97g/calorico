import { useMemo, useState } from 'react'
import { Loader2, Repeat2 } from 'lucide-react'
import { toast } from 'sonner'
import { FoodEmojiTile } from '@/components/food/food-emoji-tile'
import { Skeleton } from '@/components/ui/skeleton'
import {
  useAddEntry,
  useDeleteEntry,
  useFavoriteFoods,
  useRecentFoods,
} from '@/hooks/use-diary'
import { MEAL_LABELS, kcal } from '@/lib/format'
import type { Food, Meal } from '@/lib/types'

interface QuickAddStripProps {
  day: string
  meal: Meal
}

/** Portion a one-tap add should use: the pack's serving, else 100 g. */
const portionOf = (food: Food) => food.servingSizeG ?? 100

/**
 * The fastest way to log: the things this user already eats, one tap each.
 * Favourites lead, recents fill the rest. Every add is undoable, because a
 * single-tap write with no escape hatch is a trap.
 */
export function QuickAddStrip({ day, meal }: QuickAddStripProps) {
  const favorites = useFavoriteFoods()
  const recent = useRecentFoods()
  const addEntry = useAddEntry()
  const deleteEntry = useDeleteEntry()
  const [pendingId, setPendingId] = useState<string | null>(null)

  const items = useMemo(() => {
    const seen = new Set<string>()
    const out: Food[] = []
    for (const food of [
      ...(favorites.data?.items ?? []),
      ...(recent.data?.items ?? []),
    ]) {
      if (seen.has(food.id)) continue
      seen.add(food.id)
      out.push(food)
      if (out.length === 8) break
    }
    return out
  }, [favorites.data, recent.data])

  const loading = favorites.isLoading || recent.isLoading

  const handleAdd = (food: Food) => {
    const quantityG = portionOf(food)
    setPendingId(food.id)
    addEntry.mutate(
      { foodId: food.id, day, meal, quantityG },
      {
        onSuccess: (entry) => {
          toast.success(`${food.name} in ${MEAL_LABELS[meal]}`, {
            description: `${quantityG} ${food.unit}`,
            action: {
              label: 'Annulla',
              onClick: () => deleteEntry.mutate({ id: entry.id, day }),
            },
          })
        },
        onError: () => toast.error('Non è stato possibile salvare la voce'),
        onSettled: () => setPendingId(null),
      },
    )
  }

  if (loading) {
    return (
      <div className="flex gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-[104px] w-[132px] shrink-0 rounded-3xl" />
        ))}
      </div>
    )
  }

  if (!items.length) return null

  return (
    <section>
      <header className="mb-2 flex items-baseline gap-2 px-1">
        <h2 className="flex items-center gap-1.5 text-[13px] font-bold">
          <Repeat2 className="size-4" strokeWidth={2.4} />
          Ripeti
        </h2>
        <p className="text-muted-foreground text-[11px] font-medium">
          un tocco, va in {MEAL_LABELS[meal].toLowerCase()}
        </p>
      </header>

      <ul className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-2 overflow-x-auto px-4 pb-1">
        {items.map((food) => {
          const portion = portionOf(food)
          const pending = pendingId === food.id
          return (
            <li key={food.id} className="snap-start">
              <button
                type="button"
                onClick={() => handleAdd(food)}
                disabled={pending}
                className="bg-card shadow-soft relative flex h-[104px] w-[132px] flex-col items-start gap-1.5 rounded-3xl p-3 text-left transition-transform active:scale-[0.97] disabled:opacity-60"
              >
                {pending ? (
                  <Loader2 className="text-primary-strong absolute top-3 right-3 size-4 animate-spin" />
                ) : null}
                <FoodEmojiTile name={food.name} category={food.category} size="sm" />
                <span className="line-clamp-2 text-xs leading-tight font-semibold">
                  {food.name}
                </span>
                <span className="text-muted-foreground tabular mt-auto text-[10px] font-semibold">
                  {kcal((food.kcal100 * portion) / 100)} kcal · {portion}{' '}
                  {food.unit}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
