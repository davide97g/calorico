import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { BarcodeButton } from '@/components/food/barcode-strip'
import { FoodEmojiTile } from '@/components/food/food-emoji-tile'
import { UserAvatar } from '@/components/user-avatar'
import { kcal } from '@/lib/format'
import type { Food, PersonRef } from '@/lib/types'

export function FoodRow({
  food,
  to,
  /** Replaces the pack serving on the right — the recents list puts the remembered portion there. */
  trailing,
  /**
   * The family member who scanned this food, when it was not this user. See
   * useScannedByFood: on a solo account nobody ever qualifies and the row is
   * exactly what it always was.
   */
  scannedBy,
}: {
  food: Food
  to: string
  trailing?: ReactNode
  scannedBy?: PersonRef
}) {
  return (
    // The link and the code are siblings rather than nested: a button inside an
    // anchor is neither valid nor reliably tappable.
    <div className="flex items-center gap-1">
      <Link
        to={to}
        className="hover:bg-secondary/70 flex min-w-0 flex-1 items-center gap-3 rounded-md p-2 transition-colors"
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

        {scannedBy ? (
          <UserAvatar
            user={scannedBy}
            size="sm"
            className="shrink-0"
            title={`Scansionato da ${scannedBy.name}`}
          />
        ) : null}

        <span className="text-muted-foreground shrink-0 text-xs">
          {trailing ??
            (food.servingSizeG ? `${food.servingSizeG} ${food.unit}` : '')}
        </span>
      </Link>

      {/* Anything with a code came off a pack, and its symbol is worth one tap
          from the list too — see BarcodeButton. */}
      <BarcodeButton barcode={food.barcode} name={food.name} />
    </div>
  )
}
