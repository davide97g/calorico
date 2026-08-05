import { Link } from 'react-router-dom'
import { Leaf, ScanBarcode } from 'lucide-react'
import { kcal } from '@/lib/format'
import type { Food } from '@/lib/types'

export function FoodRow({ food, to }: { food: Food; to: string }) {
  return (
    <Link
      to={to}
      className="hover:bg-secondary/70 flex items-center gap-3 rounded-2xl p-2 transition-colors"
    >
      {food.imageUrl ? (
        <img
          src={food.imageUrl}
          alt=""
          loading="lazy"
          className="bg-secondary size-11 shrink-0 rounded-xl object-cover"
        />
      ) : (
        <span className="bg-secondary text-muted-foreground flex size-11 shrink-0 items-center justify-center rounded-xl">
          {food.source === 'generic' ? (
            <Leaf className="size-4" />
          ) : (
            <ScanBarcode className="size-4" />
          )}
        </span>
      )}

      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{food.name}</span>
        <span className="text-muted-foreground block truncate text-xs">
          {food.brand ? `${food.brand} · ` : ''}
          {kcal(food.kcal100)} kcal / 100 {food.unit}
        </span>
      </span>

      <span className="text-muted-foreground shrink-0 text-xs">
        {food.servingSizeG ? `${food.servingSizeG} ${food.unit}` : ''}
      </span>
    </Link>
  )
}
