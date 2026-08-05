import { useEffect, useRef, useState, type PointerEvent } from 'react'
import {
  Check,
  Loader2,
  Minus,
  Plus,
  Search,
  ShoppingBasket,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { AppShell } from '@/components/layout/app-shell'
import { FoodEmojiTile } from '@/components/food/food-emoji-tile'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Panel } from '@/components/ui/panel'
import { Skeleton } from '@/components/ui/skeleton'
import {
  useAddGroceryItem,
  useDeleteGroceryItem,
  useGrocery,
  useUpdateGroceryItem,
} from '@/hooks/use-grocery'
import { useFoodSearch } from '@/hooks/use-diary'
import type { Food, GroceryItem } from '@/lib/types'
import { cn } from '@/lib/utils'

export default function GroceryPage() {
  const grocery = useGrocery()
  const addItem = useAddGroceryItem()
  const updateItem = useUpdateGroceryItem()
  const deleteItem = useDeleteGroceryItem()
  const [term, setTerm] = useState('')
  const [debounced, setDebounced] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<GroceryItem | null>(null)

  useEffect(() => {
    const id = setTimeout(() => setDebounced(term.trim()), 350)
    return () => clearTimeout(id)
  }, [term])

  const search = useFoodSearch(debounced)
  const items = grocery.data?.items ?? []
  const activeCount = items.filter((item) => !item.completed).length

  const finishAdd = (label: string) => {
    setTerm('')
    setDebounced('')
    toast.success(`${label} aggiunto alla spesa`)
  }

  const addFood = (food: Food) => {
    addItem.mutate(
      { foodId: food.id },
      {
        onSuccess: () => finishAdd(food.name),
        onError: () => toast.error('Non è stato possibile aggiungere il prodotto'),
      },
    )
  }

  const addFreeText = () => {
    const name = term.trim()
    if (!name) return
    addItem.mutate(
      { name },
      {
        onSuccess: () => finishAdd(name),
        onError: () => toast.error('Non è stato possibile aggiungere la voce'),
      },
    )
  }

  const toggleCompleted = (item: GroceryItem) => {
    const completed = !item.completed
    updateItem.mutate(
      { id: item.id, completed },
      {
        onSuccess: () => {
          if (!completed) return
          toast.success(`${item.nameSnapshot} completato`, {
            duration: 3000,
            action: {
              label: 'Annulla',
              onClick: () =>
                updateItem.mutate({ id: item.id, completed: false }),
            },
          })
        },
        onError: () => toast.error('Aggiornamento non riuscito'),
      },
    )
  }

  const changeQuantity = (item: GroceryItem, next: number) => {
    if (next < 1 || next > 999) return
    updateItem.mutate(
      { id: item.id, quantity: next },
      { onError: () => toast.error('Quantità non aggiornata') },
    )
  }

  const confirmDelete = () => {
    if (!deleteTarget) return
    const target = deleteTarget
    setDeleteTarget(null)
    deleteItem.mutate(target.id, {
      onSuccess: () => toast.success(`${target.nameSnapshot} eliminato`),
      onError: () => toast.error('Eliminazione non riuscita'),
    })
  }

  return (
    <AppShell>
      <header className="flex items-end justify-between px-1">
        <div>
          <p className="text-primary-strong text-[11px] font-bold tracking-[0.16em] uppercase">
            Lista unica
          </p>
          <h1 className="font-display text-[28px] leading-tight font-bold">Spesa</h1>
        </div>
        <span className="bg-primary text-primary-foreground tabular rounded-full px-3 py-1.5 text-xs font-bold">
          {activeCount} da prendere
        </span>
      </header>

      <div className="relative mt-4">
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2" />
        {search.isFetching && debounced.length >= 2 ? (
          <Loader2 className="text-muted-foreground absolute top-1/2 right-4 size-4 -translate-y-1/2 animate-spin" />
        ) : null}
        <Input
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') addFreeText()
          }}
          placeholder="Aggiungi latte, mele, detersivo…"
          aria-label="Aggiungi alla lista della spesa"
          className="bg-card shadow-soft h-13 rounded-full border-transparent pr-11 pl-11 text-sm"
        />
      </div>

      {term.trim() ? (
        <Panel className="mt-2 p-2">
          {debounced.length >= 2 && search.data?.items.length ? (
            <ul className="max-h-64 overflow-y-auto">
              {search.data.items.slice(0, 6).map((food) => (
                <li key={food.id}>
                  <button
                    type="button"
                    onClick={() => addFood(food)}
                    disabled={addItem.isPending}
                    className="hover:bg-secondary/70 flex w-full items-center gap-3 rounded-2xl p-2 text-left transition-colors"
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
          <button
            type="button"
            onClick={addFreeText}
            disabled={addItem.isPending}
            className="border-border text-primary-strong flex w-full items-center gap-2 border-t px-3 pt-3 pb-2 text-left text-sm font-semibold first:border-t-0"
          >
            <Plus className="size-4" />
            Aggiungi “{term.trim()}”
          </button>
        </Panel>
      ) : null}

      <section className="mt-4">
        {grocery.isLoading ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-[76px] rounded-[24px]" />
            ))}
          </div>
        ) : items.length ? (
          <Panel className="overflow-hidden p-1.5">
            <ul>
              {items.map((item) => (
                <li key={item.id}>
                  <GroceryRow
                    item={item}
                    onToggle={() => toggleCompleted(item)}
                    onQuantity={(next) => changeQuantity(item, next)}
                    onDelete={() => setDeleteTarget(item)}
                  />
                </li>
              ))}
            </ul>
          </Panel>
        ) : (
          <Panel className="flex flex-col items-center px-6 py-12 text-center">
            <span className="bg-primary/55 flex size-16 items-center justify-center rounded-[22px]">
              <ShoppingBasket className="text-primary-foreground size-7" />
            </span>
            <h2 className="mt-4 text-base font-bold">Lista vuota</h2>
            <p className="text-muted-foreground mt-1 max-w-56 text-sm">
              Cerca un prodotto, scrivi una voce oppure scansiona un codice.
            </p>
          </Panel>
        )}
      </section>

      <Dialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
      >
        <DialogContent className="max-w-sm rounded-[28px]" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Eliminare “{deleteTarget?.nameSnapshot}”?</DialogTitle>
            <DialogDescription>
              La voce verrà eliminata definitivamente dalla lista.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="grid grid-cols-2 sm:grid-cols-2">
            <DialogClose asChild>
              <Button variant="secondary" className="rounded-full">Annulla</Button>
            </DialogClose>
            <Button variant="destructive" className="rounded-full" onClick={confirmDelete}>
              Elimina
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  )
}

function GroceryRow({
  item,
  onToggle,
  onQuantity,
  onDelete,
}: {
  item: GroceryItem
  onToggle: () => void
  onQuantity: (quantity: number) => void
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

  return (
    <div className="relative overflow-hidden rounded-[22px]">
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
          'bg-card relative flex min-h-[72px] touch-pan-y items-center gap-3 rounded-[22px] px-2.5 py-2 outline-none transition-[transform,opacity] focus-visible:ring-2 focus-visible:ring-ring',
          item.completed && 'opacity-55',
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

        <span className="min-w-0 flex-1">
          <span className={cn('block truncate text-sm font-semibold', item.completed && 'line-through')}>
            {item.nameSnapshot}
          </span>
          {item.brandSnapshot ? (
            <span className="text-muted-foreground block truncate text-[11px]">
              {item.brandSnapshot}
            </span>
          ) : null}
        </span>

        {!item.completed ? (
          <span className="bg-secondary flex shrink-0 items-center rounded-full p-0.5" onClick={(event) => event.stopPropagation()}>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              disabled={item.quantity <= 1}
              onClick={() => onQuantity(item.quantity - 1)}
              aria-label={`Riduci quantità di ${item.nameSnapshot}`}
              className="rounded-full"
            >
              <Minus />
            </Button>
            <span className="tabular min-w-7 text-center text-xs font-bold">{item.quantity}</span>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              disabled={item.quantity >= 999}
              onClick={() => onQuantity(item.quantity + 1)}
              aria-label={`Aumenta quantità di ${item.nameSnapshot}`}
              className="rounded-full"
            >
              <Plus />
            </Button>
          </span>
        ) : (
          <span className="text-muted-foreground tabular shrink-0 text-xs font-bold">
            ×{item.quantity}
          </span>
        )}

        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={(event) => {
            event.stopPropagation()
            onDelete()
          }}
          aria-label={`Elimina ${item.nameSnapshot}`}
          className="text-muted-foreground hover:text-destructive rounded-full"
        >
          <Trash2 />
        </Button>
      </div>
    </div>
  )
}
