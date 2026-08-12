import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { FoodEmojiTile } from '@/components/food/food-emoji-tile'
import { kcal } from '@/lib/format'
import type { Food } from '@/lib/types'

export function FoodRow({
  food,
  to,
  /** Replaces the pack serving on the right — the recents list puts the remembered portion there. */
  trailing,
}: {
  food: Food
  to: string
  trailing?: ReactNode
}) {
  return (
    <Link
      to={to}
      className="hover:bg-secondary/70 flex items-center gap-3 rounded-md p-2 transition-colors"
    >
      <FoodEmojiTile name={food.name} category={food.category} />

      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{food.name}</span>
        <span className="text-muted-foreground block truncate text-xs">
          {/* Unpackaged food has no brand to show, and saying so is the point:
              it tells someone hunting for a peach that this row is the fruit
              and not a peach-flavoured product. */}
          {food.brand
            ? `${food.brand} · `
            : food.source === 'generic'
              ? 'Generico · '
              : ''}
          {kcal(food.kcal100)} kcal / 100 {food.unit}
        </span>
      </span>

      <span className="text-muted-foreground shrink-0 text-xs">
        {trailing ??
          (food.servingSizeG ? `${food.servingSizeG} ${food.unit}` : '')}
      </span>
    </Link>
  )
}
