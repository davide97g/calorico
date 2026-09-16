import { useRef, useState, type PointerEvent } from 'react'
import { Check, Ellipsis, Minus, Plus, Sparkles, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { UserAvatar } from '@/components/user-avatar'
import { apiUrl } from '@/lib/api'
import { relativeTime } from '@/lib/date'
import { GROCERY_CATEGORY_EMOJI, groceryQuantity } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { GroceryItem, GroceryUnit } from '@/lib/types'

/**
 * How much one tap of the stepper moves the quantity.
 *
 * Pieces are counted one at a time; grams are not. Somebody asking for mince at
 * a counter asks for six hundred grams, and stepping there in ones would be
 * twelve taps to say what one tap should. Kilos and litres stay whole because
 * the quantity is an integer on the wire.
 */
const STEP: Record<GroceryUnit, number> = { pz: 1, g: 50, ml: 50, kg: 1, l: 1 }

function groceryStep(unit: GroceryUnit) {
  return STEP[unit]
}

function Thumbnail({ item }: { item: GroceryItem }) {
  if (item.imagePath) {
    return (
      <img
        src={apiUrl(item.imagePath)}
        alt=""
        loading="lazy"
        className="bg-secondary size-11 shrink-0 rounded-md object-cover"
      />
    )
  }
  return (
    <span
      aria-hidden
      className="bg-secondary flex size-11 shrink-0 items-center justify-center rounded-md text-lg"
    >
      {GROCERY_CATEGORY_EMOJI[item.category]}
    </span>
  )
}

/**
 * One line of the shopping list.
 *
 * Tapping anywhere on it ticks the row off, which is the thing a list is for
 * and the only action that has to survive being done with a trolley in the
 * other hand. Everything else — the aisle, the unit, the photo, deleting —
 * lives behind the ellipsis, so the row stays a row. The swipe is kept as the
 * fast path for deleting.
 */
export function GroceryRow({
  item,
  onToggle,
  onQuantity,
  onOpen,
  onDelete,
}: {
  item: GroceryItem
  onToggle: () => void
  onQuantity: (quantity: number) => void
  onOpen: () => void
  onDelete: () => void
}) {
  const start = useRef<{ x: number; y: number } | null>(null)
  const offsetRef = useRef(0)
  const suppressClick = useRef(false)
  const [offset, setOffset] = useState(0)

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('button')) return
    start.current = { x: event.clientX, y: event.clientY }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!start.current) return
    const dx = event.clientX - start.current.x
    const dy = event.clientY - start.current.y
    if (Math.abs(dy) > Math.abs(dx)) return
    const next = Math.max(-96, Math.min(96, dx))
    offsetRef.current = next
    suppressClick.current = Math.abs(next) > 8
    setOffset(next)
  }

  const finishSwipe = () => {
    if (Math.abs(offsetRef.current) >= 72) onDelete()
    start.current = null
    offsetRef.current = 0
    setOffset(0)
    window.setTimeout(() => {
      suppressClick.current = false
    }, 0)
  }

  const cancelSwipe = () => {
    start.current = null
    offsetRef.current = 0
    suppressClick.current = false
    setOffset(0)
  }

  const step = groceryStep(item.unit)

  return (
    <div className="relative overflow-hidden rounded-lg">
      <div className="bg-destructive/12 text-destructive absolute inset-0 flex items-center justify-between px-5">
        <Trash2 className="size-5" />
        <Trash2 className="size-5" />
      </div>
      <div
        role="button"
        tabIndex={0}
        aria-label={`${item.completed ? 'Ripristina' : 'Completa'} ${item.nameSnapshot}`}
        onClick={() => {
          if (suppressClick.current) {
            suppressClick.current = false
            return
          }
          onToggle()
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            onToggle()
          }
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishSwipe}
        onPointerCancel={cancelSwipe}
        className={cn(
          'bg-card relative flex min-h-[72px] touch-pan-y items-center gap-2.5 rounded-lg px-2.5 py-2 outline-none transition-transform focus-visible:ring-2 focus-visible:ring-ring',
          item.completed && 'text-muted-foreground',
        )}
        style={{ transform: `translateX(${offset}px)` }}
      >
        <span
          aria-hidden
          className={cn(
            'border-border flex size-7 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
            item.completed && 'bg-primary border-primary',
          )}
        >
          {item.completed ? <Check className="text-primary-foreground size-4" strokeWidth={3} /> : null}
        </span>

        <Thumbnail item={item} />

        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className={cn('min-w-0 truncate text-sm font-semibold', item.completed && 'line-through')}>
              {item.nameSnapshot}
            </span>
            {/* A row nobody remembers writing is the one that gets deleted in
                confusion, so the cupboard says it was the one that wrote it. */}
            {item.source === 'auto' ? (
              <span
                title="Aggiunto dalla dispensa: stava finendo"
                className="bg-primary/20 text-primary-strong flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 text-micro font-bold"
              >
                <Sparkles className="size-2.5" />
                Auto
              </span>
            ) : null}
          </span>
          {item.brandSnapshot ? (
            <span className="text-muted-foreground block truncate text-micro">
              {item.brandSnapshot}
            </span>
          ) : null}
          {/* Only worth the extra line once the list is actually shared. */}
          {item.familyId && item.addedBy ? (
            <span className="text-muted-foreground mt-0.5 flex items-center gap-1.5 text-micro">
              <UserAvatar
                user={item.addedBy}
                className="size-4"
                fallbackClassName="text-[7px]"
              />
              <span className="truncate">
                {item.addedBy.name.split(' ')[0]} · {relativeTime(item.createdAt)}
              </span>
            </span>
          ) : null}
        </span>

        {!item.completed ? (
          <span className="bg-secondary flex shrink-0 items-center rounded-full p-0.5" onClick={(event) => event.stopPropagation()}>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              disabled={item.quantity <= step}
              onClick={() => onQuantity(item.quantity - step)}
              aria-label={`Riduci quantità di ${item.nameSnapshot}`}
              className="rounded-full"
            >
              <Minus />
            </Button>
            <span className="tabular min-w-7 text-center text-xs font-bold">
              {groceryQuantity(item.quantity, item.unit)}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              disabled={item.quantity + step > 999}
              onClick={() => onQuantity(item.quantity + step)}
              aria-label={`Aumenta quantità di ${item.nameSnapshot}`}
              className="rounded-full"
            >
              <Plus />
            </Button>
          </span>
        ) : (
          <span className="text-muted-foreground tabular shrink-0 text-xs font-bold">
            ×{groceryQuantity(item.quantity, item.unit)}
          </span>
        )}

        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={(event) => {
            event.stopPropagation()
            onOpen()
          }}
          aria-label={`Opzioni per ${item.nameSnapshot}`}
          className="text-muted-foreground rounded-full"
        >
          <Ellipsis />
        </Button>
      </div>
    </div>
  )
}
