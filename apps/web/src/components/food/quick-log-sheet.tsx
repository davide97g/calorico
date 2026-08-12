import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, ChevronRight, Loader2, ScanBarcode, Search } from 'lucide-react'
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { FoodEmojiTile } from '@/components/food/food-emoji-tile'
import { ScanSheet } from '@/components/food/scan-sheet'
import { WhenBar } from '@/components/food/when-picker'
import { useRecentFoods } from '@/hooks/use-diary'
import { useQuickLog } from '@/hooks/use-quick-log'
import { todayISO } from '@/lib/date'
import { currentMeal, grams, kcal } from '@/lib/format'
import type { When } from '@/lib/when'
import type { RecentFood } from '@/lib/types'

/**
 * The bar's primary action: log a food that has been logged before.
 *
 * The list leads because the list is the answer nine times out of ten — the
 * same foods, in the same portions, day after day. Searching and scanning are
 * still here, one row down, for the food that is new.
 */
export function QuickLogSheet({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const navigate = useNavigate()
  const [when, setWhen] = useState<When>({
    day: todayISO(),
    meal: currentMeal(),
  })
  const [scanning, setScanning] = useState(false)
  // Breakfast is rarely one food. The sheet stays open across taps, so each row
  // has to say for itself that it landed.
  const [logged, setLogged] = useState<string[]>([])

  const { data, isLoading } = useRecentFoods(when.meal)
  const { log, loggingFoodId } = useQuickLog()

  // A sheet reopened an hour later is a new decision, not the old draft.
  useEffect(() => {
    if (open) {
      setWhen({ day: todayISO(), meal: currentMeal() })
      setLogged([])
    }
  }, [open])

  const items = data?.items ?? []

  const handleLog = (food: RecentFood) => {
    log({ food, quantityG: food.lastQuantityG, day: when.day, meal: when.meal })
    setLogged((prev) => [...prev, food.id])
  }

  const leave = (to: string) => {
    onOpenChange(false)
    navigate(to)
  }

  return (
    <>
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="mx-auto flex max-h-[92dvh] max-w-[440px] flex-col rounded-t-[28px]">
          <DrawerHeader className="shrink-0">
            <DrawerTitle>Registra in fretta</DrawerTitle>
            <DrawerDescription>
              Quello che mangi di solito, nella porzione di sempre.
            </DrawerDescription>
          </DrawerHeader>

          <div className="shrink-0 px-4">
            <WhenBar value={when} onChange={setWhen} variant="inset" />
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-3">
            {isLoading ? (
              <div className="flex flex-col gap-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 rounded-[22px]" />
                ))}
              </div>
            ) : items.length === 0 ? (
              <p className="text-muted-foreground px-1 py-8 text-center text-sm">
                Qui finiscono gli alimenti che registri, con la porzione che usi.
                Cercane uno per iniziare.
              </p>
            ) : (
              <ul className="flex flex-col gap-1">
                {items.map((food) => (
                  <li key={food.id}>
                    <QuickLogRow
                      food={food}
                      busy={loggingFoodId === food.id}
                      done={logged.includes(food.id)}
                      onLog={() => handleLog(food)}
                      onAdjust={() =>
                        leave(
                          `/food/${food.id}?day=${when.day}&meal=${when.meal}`,
                        )
                      }
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* The cold paths. Below the list, because a new food is the exception. */}
          <div className="bg-background border-border/60 shrink-0 border-t px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="secondary"
                className="h-12 rounded-full text-sm font-semibold"
                onClick={() =>
                  leave(`/add?day=${when.day}&meal=${when.meal}&focus=1`)
                }
              >
                <Search className="size-4" />
                Cerca alimento
              </Button>
              <Button
                variant="secondary"
                className="h-12 rounded-full text-sm font-semibold"
                onClick={() => {
                  onOpenChange(false)
                  setScanning(true)
                }}
              >
                <ScanBarcode className="text-primary-strong size-4" />
                Scansiona
              </Button>
            </div>
          </div>
        </DrawerContent>
      </Drawer>

      <ScanSheet
        open={scanning}
        onOpenChange={setScanning}
        day={when.day}
        meal={when.meal}
      />
    </>
  )
}

function QuickLogRow({
  food,
  busy,
  done,
  onLog,
  onAdjust,
}: {
  food: RecentFood
  busy: boolean
  done: boolean
  onLog: () => void
  onAdjust: () => void
}) {
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={onLog}
        disabled={busy}
        className="hover:bg-secondary/60 active:bg-secondary flex min-h-16 min-w-0 flex-1 items-center gap-3 rounded-[22px] p-2 text-left transition-colors disabled:opacity-60"
        aria-label={`Registra ${food.name}, ${grams(food.lastQuantityG)} ${food.unit}`}
      >
        {busy ? (
          <span className="bg-secondary flex size-11 shrink-0 items-center justify-center rounded-xl">
            <Loader2 className="text-primary-strong size-4 animate-spin" />
          </span>
        ) : done ? (
          <span className="bg-primary text-primary-foreground flex size-11 shrink-0 items-center justify-center rounded-xl">
            <Check className="size-5" strokeWidth={2.6} />
          </span>
        ) : (
          <FoodEmojiTile name={food.name} category={food.category} />
        )}

        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">
            {food.name}
          </span>
          <span className="text-muted-foreground block truncate text-xs">
            {food.brand ? `${food.brand} · ` : ''}
            <span className="tabular">
              {grams(food.lastQuantityG)} {food.unit}
            </span>
            {food.times > 1 ? ` · ${food.times} volte` : ''}
          </span>
        </span>

        <span className="tabular shrink-0 pr-1 text-sm font-bold">
          {kcal((food.kcal100 * food.lastQuantityG) / 100)}
        </span>
      </button>

      {/* The escape hatch from the remembered portion: same food, different day
          on the scale. */}
      <button
        type="button"
        onClick={onAdjust}
        className="text-muted-foreground hover:bg-secondary active:bg-secondary flex size-11 shrink-0 items-center justify-center rounded-full transition-colors"
        aria-label={`Cambia porzione di ${food.name}`}
      >
        <ChevronRight className="size-4" />
      </button>
    </div>
  )
}
