import { useEffect, useState } from 'react'
import { Boxes, Loader2, Plus, Search } from 'lucide-react'
import { AppShell } from '@/components/layout/app-shell'
import { TopBar } from '@/components/layout/top-bar'
import { FoodEmojiTile } from '@/components/food/food-emoji-tile'
import { PantryItemSheet } from '@/components/pantry/pantry-item-sheet'
import { PantryStockSheet } from '@/components/pantry/pantry-stock-sheet'
import { Input } from '@/components/ui/input'
import { Panel } from '@/components/ui/panel'
import { Skeleton } from '@/components/ui/skeleton'
import { useFoodSearch } from '@/hooks/use-foods'
import { usePantry } from '@/hooks/use-pantry'
import { grams } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Food, PantryItem } from '@/lib/types'

/**
 * The cupboard: what the household keeps a count of, and how much of it is
 * left.
 *
 * Only products worth tracking belong here, and putting one in is deliberate.
 * The app used to add every scanned barcode to the shopping list and the list
 * filled with everything anyone had ever picked up; a cupboard that stocked
 * itself from the diary would repeat that with more steps.
 */
export default function PantryPage() {
  const pantry = usePantry()
  const [term, setTerm] = useState('')
  const [debounced, setDebounced] = useState('')
  const [stocking, setStocking] = useState<Food | null>(null)
  const [editing, setEditing] = useState<string | null>(null)

  useEffect(() => {
    const id = setTimeout(() => setDebounced(term.trim()), 350)
    return () => clearTimeout(id)
  }, [term])

  const search = useFoodSearch(debounced)
  const items = pantry.data?.items ?? []
  const lowCount = items.filter((item) => item.low).length
  const editingItem = items.find((item) => item.id === editing) ?? null

  const tracked = new Set(items.map((item) => item.foodId))
  const hits = (search.data?.items ?? [])
    .filter((food) => !tracked.has(food.id))
    .slice(0, 6)

  return (
    <AppShell>
      <TopBar
        eyebrow="Spesa"
        title="Dispensa"
        back="/grocery"
        action={
          lowCount ? (
            <span className="bg-primary text-primary-foreground tabular shrink-0 rounded-full px-2.5 py-1.5 text-micro font-bold">
              {lowCount} in esaurimento
            </span>
          ) : null
        }
      />

      <div className="relative mt-4">
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2" />
        {search.isFetching && debounced.length >= 2 ? (
          <Loader2 className="text-muted-foreground absolute top-1/2 right-4 size-4 -translate-y-1/2 animate-spin" />
        ) : null}
        <Input
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder="Metti un prodotto in dispensa…"
          aria-label="Cerca un prodotto da mettere in dispensa"
          className="bg-card shadow-soft h-13 rounded-full border-transparent pr-11 pl-11 text-sm"
        />
      </div>

      {debounced.length >= 2 && hits.length ? (
        <Panel className="mt-2 p-2">
          <ul>
            {hits.map((food) => (
              <li key={food.id}>
                <button
                  type="button"
                  onClick={() => {
                    setStocking(food)
                    setTerm('')
                    setDebounced('')
                  }}
                  className="hover:bg-secondary/70 flex w-full items-center gap-3 rounded-md p-2 text-left transition-colors"
                >
                  <FoodEmojiTile name={food.name} category={food.category} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{food.name}</span>
                    <span className="text-muted-foreground block truncate text-xs">
                      {food.brand ? `${food.brand} · ` : ''}
                      {food.packageSizeG
                        ? `${grams(food.packageSizeG)} g`
                        : 'peso da indicare'}
                    </span>
                  </span>
                  <Plus className="text-primary-strong size-4" />
                </button>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      <section className="mt-4">
        {pantry.isLoading ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-[76px] rounded-lg" />
            ))}
          </div>
        ) : items.length ? (
          <Panel className="overflow-hidden p-1.5">
            <ul>
              {items.map((item) => (
                <li key={item.id}>
                  <PantryRow item={item} onOpen={() => setEditing(item.id)} />
                </li>
              ))}
            </ul>
          </Panel>
        ) : (
          <Panel className="flex flex-col items-center px-6 py-12 text-center">
            <span className="bg-primary/55 flex size-16 items-center justify-center rounded-lg">
              <Boxes className="text-primary-foreground size-7" />
            </span>
            <h2 className="mt-4 text-base font-bold">Dispensa vuota</h2>
            <p className="text-muted-foreground mt-1 max-w-64 text-sm">
              Metti qui i prodotti che ricompri sempre. Quando stanno per
              finire, vanno da soli nella lista della spesa.
            </p>
          </Panel>
        )}
      </section>

      <PantryStockSheet
        food={stocking}
        onOpenChange={(open) => {
          if (!open) setStocking(null)
        }}
      />
      <PantryItemSheet
        item={editingItem}
        onOpenChange={(open) => {
          if (!open) setEditing(null)
        }}
      />
    </AppShell>
  )
}

function PantryRow({ item, onOpen }: { item: PantryItem; onOpen: () => void }) {
  // Capped at one package: the bar answers "how much of a pack is left", and a
  // full cupboard of six would otherwise flatten every other row to nothing.
  const fill = Math.min(1, item.packagesLeft)

  return (
    <button
      type="button"
      onClick={onOpen}
      className="hover:bg-secondary/40 flex w-full items-center gap-3 rounded-lg px-2.5 py-2.5 text-left transition-colors"
    >
      {item.imageUrl ? (
        <img
          src={item.imageUrl}
          alt=""
          loading="lazy"
          className="bg-secondary size-11 shrink-0 rounded-md object-cover"
        />
      ) : (
        <FoodEmojiTile name={item.name} category={null} size="sm" />
      )}

      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{item.name}</span>
        <span className="text-muted-foreground block truncate text-micro">
          {item.brand ? `${item.brand} · ` : ''}
          {grams(item.totalG)} g
          {item.sealedPackages > 0 ? ` · ${item.sealedPackages} chiuse` : ''}
        </span>
        <span className="bg-secondary mt-1.5 block h-1.5 overflow-hidden rounded-full">
          <span
            className={cn(
              'block h-full rounded-full transition-[width]',
              item.low ? 'bg-destructive' : 'bg-primary',
            )}
            style={{ width: `${Math.max(3, fill * 100)}%` }}
          />
        </span>
      </span>

      {item.low ? (
        <span className="bg-destructive/12 text-destructive shrink-0 rounded-full px-2 py-1 text-micro font-bold">
          Sta finendo
        </span>
      ) : (
        <span className="text-muted-foreground tabular shrink-0 text-xs font-bold">
          ×{item.packagesLeft.toFixed(1)}
        </span>
      )}
    </button>
  )
}
