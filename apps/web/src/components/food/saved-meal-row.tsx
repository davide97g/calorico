import type { ReactNode } from 'react'
import { Loader2, Utensils } from 'lucide-react'
import { FoodEmojiTile } from '@/components/food/food-emoji-tile'
import { grams, kcal } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { SavedMeal } from '@/lib/types'

export function SavedMealChip({
  meal,
  busy,
  onLog,
}: {
  meal: SavedMeal
  busy: boolean
  onLog: () => void
}) {
  const first = meal.items[0]
  return (
    <button
      type="button"
      onClick={onLog}
      disabled={busy}
      className={cn(
        'bg-card shadow-soft flex min-h-[60px] w-[11.5rem] shrink-0 items-center gap-2.5 rounded-lg p-2 text-left',
        'ring-primary/25 ring-1',
        'transition-transform active:scale-[0.97] disabled:opacity-60',
      )}
      aria-label={`Registra ${meal.name}, ${meal.items.length} alimenti`}
    >
      {busy ? (
        <span className="bg-secondary flex size-9 shrink-0 items-center justify-center rounded-md">
          <Loader2 className="text-primary-strong size-4 animate-spin" />
        </span>
      ) : first ? (
        <FoodEmojiTile name={first.name} category={first.category} size="sm" />
      ) : (
        <span className="bg-secondary flex size-9 shrink-0 items-center justify-center rounded-md">
          <Utensils className="text-primary-strong size-4" strokeWidth={2.2} />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{meal.name}</span>
        <span className="text-muted-foreground tabular block truncate text-micro">
          {meal.items.length} alimenti · {kcal(meal.kcal)} kcal
        </span>
      </span>
    </button>
  )
}

export function SavedMealListRow({
  meal,
  busy,
  onLog,
  trailing,
}: {
  meal: SavedMeal
  busy?: boolean
  onLog: () => void
  trailing?: ReactNode
}) {
  const first = meal.items[0]
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={onLog}
        disabled={busy}
        className="hover:bg-secondary/60 active:bg-secondary flex min-h-16 min-w-0 flex-1 items-center gap-3 rounded-lg p-2 text-left transition-colors disabled:opacity-60"
        aria-label={`Registra ${meal.name}`}
      >
        {busy ? (
          <span className="bg-secondary flex size-11 shrink-0 items-center justify-center rounded-md">
            <Loader2 className="text-primary-strong size-4 animate-spin" />
          </span>
        ) : (
          <FoodEmojiTile
            name={first?.name ?? meal.name}
            category={first?.category}
          />
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{meal.name}</span>
          <span className="text-muted-foreground block truncate text-xs">
            {meal.items
              .slice(0, 3)
              .map((i) => `${i.name} ${grams(i.quantityG)}${i.unit}`)
              .join(' · ')}
            {meal.items.length > 3 ? '…' : ''}
          </span>
        </span>
        <span className="tabular shrink-0 pr-1 text-sm font-bold">
          {kcal(meal.kcal)}
        </span>
      </button>
      {trailing}
    </div>
  )
}
