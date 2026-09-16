import { Panel } from '@/components/ui/panel'
import { GroceryRow } from './grocery-row'
import {
  GROCERY_CATEGORY_EMOJI,
  GROCERY_CATEGORY_LABELS,
  GROCERY_CATEGORY_ORDER,
} from '@/lib/format'
import type { GroceryCategory, GroceryItem } from '@/lib/types'

/**
 * The list, grouped by aisle and in the order a trolley goes round — which is
 * also the order a pickup order is picked in, so the screen reads like the walk
 * rather than like the order things were remembered in.
 *
 * Ticked-off rows leave their aisle and collect at the bottom: what is left to
 * buy is the question the screen is open to answer.
 */
export function GroceryList({
  items,
  onToggle,
  onQuantity,
  onOpen,
  onDelete,
}: {
  items: GroceryItem[]
  onToggle: (item: GroceryItem) => void
  onQuantity: (item: GroceryItem, quantity: number) => void
  onOpen: (item: GroceryItem) => void
  onDelete: (item: GroceryItem) => void
}) {
  const active = items.filter((item) => !item.completed)
  const done = items.filter((item) => item.completed)

  const groups = GROCERY_CATEGORY_ORDER.map((category) => ({
    category,
    rows: active.filter((item) => item.category === category),
  })).filter((group) => group.rows.length > 0)

  const row = (item: GroceryItem) => (
    <li key={item.id}>
      <GroceryRow
        item={item}
        onToggle={() => onToggle(item)}
        onQuantity={(quantity) => onQuantity(item, quantity)}
        onOpen={() => onOpen(item)}
        onDelete={() => onDelete(item)}
      />
    </li>
  )

  return (
    <div className="flex flex-col gap-3">
      {groups.map((group) => (
        <section key={group.category}>
          {/* Only worth a heading once the list actually spans aisles. */}
          {groups.length > 1 ? (
            <h2 className="text-muted-foreground mb-1 flex items-center gap-1.5 px-1 text-micro font-bold tracking-wide uppercase">
              <span aria-hidden>{GROCERY_CATEGORY_EMOJI[group.category]}</span>
              {GROCERY_CATEGORY_LABELS[group.category as GroceryCategory]}
              <span className="tabular">· {group.rows.length}</span>
            </h2>
          ) : null}
          <Panel className="overflow-hidden p-1.5">
            <ul>{group.rows.map(row)}</ul>
          </Panel>
        </section>
      ))}

      {done.length ? (
        <section>
          <h2 className="text-muted-foreground mb-1 px-1 text-micro font-bold tracking-wide uppercase">
            Presi · {done.length}
          </h2>
          <Panel className="overflow-hidden p-1.5">
            <ul>{done.map(row)}</ul>
          </Panel>
        </section>
      ) : null}
    </div>
  )
}
