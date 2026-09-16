import { useEffect, useState } from 'react'
import { History, Loader2, Plus, Search } from 'lucide-react'
import { FoodEmojiTile } from '@/components/food/food-emoji-tile'
import { Input } from '@/components/ui/input'
import { Panel } from '@/components/ui/panel'
import { useFoodSearch } from '@/hooks/use-foods'
import { useGrocerySuggestions } from '@/hooks/use-grocery'
import { relativeTime } from '@/lib/date'
import {
  GROCERY_CATEGORY_EMOJI,
  GROCERY_CATEGORY_LABELS,
  GROCERY_CATEGORY_ORDER,
} from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Food, GroceryCategory, GrocerySuggestion } from '@/lib/types'

/**
 * The one field the list is built from, and the three answers it can give: a
 * line this household has bought before, a catalogue product, or whatever was
 * typed.
 *
 * The aisle chips only appear for the free-text answer. A catalogue product is
 * food by definition and a remembered line already knows where it was filed —
 * asking again would be asking the user to repeat themselves.
 */
export function GroceryAdd({
  onAddFood,
  onAddSuggestion,
  onAddText,
  busy,
}: {
  onAddFood: (food: Food) => void
  onAddSuggestion: (suggestion: GrocerySuggestion) => void
  onAddText: (name: string, category: GroceryCategory) => void
  busy: boolean
}) {
  const [term, setTerm] = useState('')
  const [debounced, setDebounced] = useState('')
  const [historyTerm, setHistoryTerm] = useState('')
  const [category, setCategory] = useState<GroceryCategory>('other')

  useEffect(() => {
    const id = setTimeout(() => setDebounced(term.trim()), 350)
    return () => clearTimeout(id)
  }, [term])

  // The history is a local query over rows this list already has, so it can
  // keep up with typing — no reason to make it wait for the OFF debounce.
  useEffect(() => {
    const id = setTimeout(() => setHistoryTerm(term.trim()), 120)
    return () => clearTimeout(id)
  }, [term])

  const search = useFoodSearch(debounced)
  const suggestions = useGrocerySuggestions(historyTerm)

  const history = term.trim() ? (suggestions.data?.items ?? []) : []
  // The same product from both sources reads as a duplicate row. The history one
  // wins: it also says how often this household actually buys it.
  const remembered = new Set(history.map((item) => item.foodId).filter(Boolean))
  const searchHits = (search.data?.items ?? [])
    .filter((food) => !remembered.has(food.id))
    .slice(0, 6)

  const clear = () => {
    setTerm('')
    setDebounced('')
    setCategory('other')
  }

  const addText = () => {
    const name = term.trim()
    if (!name) return
    onAddText(name, category)
    clear()
  }

  return (
    <>
      <div className="relative mt-4">
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2" />
        {search.isFetching && debounced.length >= 2 ? (
          <Loader2 className="text-muted-foreground absolute top-1/2 right-4 size-4 -translate-y-1/2 animate-spin" />
        ) : null}
        <Input
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') addText()
          }}
          placeholder="Aggiungi latte, mele, detersivo…"
          aria-label="Aggiungi alla lista della spesa"
          className="bg-card shadow-soft h-13 rounded-full border-transparent pr-11 pl-11 text-sm"
        />
      </div>

      {term.trim() ? (
        <Panel className="mt-2 p-2">
          {history.length ? (
            <ul>
              {history.map((suggestion) => (
                <li key={suggestion.key}>
                  <button
                    type="button"
                    onClick={() => {
                      onAddSuggestion(suggestion)
                      clear()
                    }}
                    disabled={busy}
                    className="hover:bg-secondary/70 flex w-full items-center gap-3 rounded-md p-2 text-left transition-colors"
                  >
                    <span className="bg-secondary text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-md">
                      <History className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">
                        {suggestion.name}
                      </span>
                      <span className="text-muted-foreground block truncate text-xs">
                        {suggestion.brand ? `${suggestion.brand} · ` : ''}
                        {suggestion.times > 1
                          ? `${suggestion.times} volte · ${relativeTime(suggestion.lastAt)}`
                          : relativeTime(suggestion.lastAt)}
                      </span>
                    </span>
                    <Plus className="text-primary-strong size-4" />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {debounced.length >= 2 && searchHits.length ? (
            <ul
              className={cn(
                'max-h-64 overflow-y-auto',
                history.length && 'border-border mt-1 border-t pt-1',
              )}
            >
              {searchHits.map((food) => (
                <li key={food.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onAddFood(food)
                      clear()
                    }}
                    disabled={busy}
                    className="hover:bg-secondary/70 flex w-full items-center gap-3 rounded-md p-2 text-left transition-colors"
                  >
                    <FoodEmojiTile name={food.name} category={food.category} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{food.name}</span>
                      {food.brand ? (
                        <span className="text-muted-foreground block truncate text-xs">
                          {food.brand}
                        </span>
                      ) : null}
                    </span>
                    <Plus className="text-primary-strong size-4" />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          <div className="border-border flex flex-col gap-2 border-t px-1 pt-3 pb-1 first:border-t-0">
            <div className="flex gap-1.5">
              {GROCERY_CATEGORY_ORDER.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setCategory(option)}
                  aria-pressed={category === option}
                  className={cn(
                    'flex flex-1 items-center justify-center gap-1 rounded-full px-2 py-1.5 text-micro font-semibold transition-colors',
                    category === option
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-secondary text-muted-foreground',
                  )}
                >
                  <span aria-hidden>{GROCERY_CATEGORY_EMOJI[option]}</span>
                  {GROCERY_CATEGORY_LABELS[option]}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={addText}
              disabled={busy}
              className="text-primary-strong flex w-full items-center gap-2 px-2 py-1 text-left text-sm font-semibold"
            >
              <Plus className="size-4" />
              Aggiungi “{term.trim()}”
            </button>
          </div>
        </Panel>
      ) : null}
    </>
  )
}
