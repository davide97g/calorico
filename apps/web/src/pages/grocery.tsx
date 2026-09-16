import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Boxes, History, ShoppingBasket } from 'lucide-react'
import { toast } from 'sonner'
import { AppShell } from '@/components/layout/app-shell'
import { TopBar } from '@/components/layout/top-bar'
import { GroceryAdd } from '@/components/grocery/grocery-add'
import { GroceryItemSheet } from '@/components/grocery/grocery-item-sheet'
import { GroceryList } from '@/components/grocery/grocery-list'
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
import { Panel } from '@/components/ui/panel'
import { Skeleton } from '@/components/ui/skeleton'
import {
  useAddGroceryItem,
  useDeleteGroceryItem,
  useGrocery,
  useUpdateGroceryItem,
  type GroceryAddInput,
} from '@/hooks/use-grocery'
import { useFamilies } from '@/hooks/use-family'
import type { GroceryCategory, GroceryItem } from '@/lib/types'

export default function GroceryPage() {
  const grocery = useGrocery()
  const families = useFamilies()
  const addItem = useAddGroceryItem()
  const updateItem = useUpdateGroceryItem()
  const deleteItem = useDeleteGroceryItem()
  const [deleteTarget, setDeleteTarget] = useState<GroceryItem | null>(null)
  const [sheetId, setSheetId] = useState<string | null>(null)

  const items = grocery.data?.items ?? []
  const activeCount = items.filter((item) => !item.completed).length
  // Read out of the list rather than held in state, so the sheet follows the
  // row it is open on instead of showing a copy taken when it opened.
  const sheetItem = items.find((item) => item.id === sheetId) ?? null

  // The eyebrow names the list: one family, several, or nobody but you.
  const familyList = families.data?.families ?? []
  const eyebrow =
    familyList.length === 1
      ? familyList[0]!.name
      : familyList.length > 1
        ? `${familyList.length} famiglie`
        : 'Lista unica'

  const add = (body: GroceryAddInput, label: string) =>
    addItem.mutate(body, {
      onSuccess: () => toast.success(`${label} aggiunto alla spesa`),
      onError: () => toast.error('Non è stato possibile aggiungere la voce'),
    })

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
    setSheetId(null)
    deleteItem.mutate(target.id, {
      onSuccess: () => toast.success(`${target.nameSnapshot} eliminato`),
      onError: () => toast.error('Eliminazione non riuscita'),
    })
  }

  return (
    <AppShell>
      <TopBar
        eyebrow={eyebrow}
        title="Spesa"
        action={
          <>
            <span className="bg-primary text-primary-foreground tabular shrink-0 rounded-full px-2.5 py-1.5 text-micro font-bold">
              {activeCount} da prendere
            </span>
            <Button
              asChild
              variant="secondary"
              size="icon"
              className="shrink-0 rounded-full"
              aria-label="Dispensa"
            >
              <Link to="/pantry">
                <Boxes />
              </Link>
            </Button>
            <Button
              asChild
              variant="secondary"
              size="icon"
              className="shrink-0 rounded-full"
              aria-label="Scansioni"
            >
              <Link to="/scans">
                <History />
              </Link>
            </Button>
          </>
        }
      />

      <GroceryAdd
        busy={addItem.isPending}
        onAddFood={(food) => add({ foodId: food.id }, food.name)}
        onAddSuggestion={(suggestion) =>
          add(
            suggestion.foodId
              ? { foodId: suggestion.foodId }
              : { name: suggestion.name, category: suggestion.category },
            suggestion.name,
          )
        }
        onAddText={(name: string, category: GroceryCategory) =>
          add({ name, category }, name)
        }
      />

      <section className="mt-4">
        {grocery.isLoading ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-[76px] rounded-lg" />
            ))}
          </div>
        ) : items.length ? (
          <GroceryList
            items={items}
            onToggle={toggleCompleted}
            onQuantity={changeQuantity}
            onOpen={(item) => setSheetId(item.id)}
            onDelete={setDeleteTarget}
          />
        ) : (
          <Panel className="flex flex-col items-center px-6 py-12 text-center">
            <span className="bg-primary/55 flex size-16 items-center justify-center rounded-lg">
              <ShoppingBasket className="text-primary-foreground size-7" />
            </span>
            <h2 className="mt-4 text-base font-bold">Lista vuota</h2>
            <p className="text-muted-foreground mt-1 max-w-56 text-sm">
              Cerca un prodotto, scrivi una voce oppure scansiona un codice.
            </p>
          </Panel>
        )}
      </section>

      <GroceryItemSheet
        item={sheetItem}
        imagesEnabled={grocery.data?.imagesEnabled ?? false}
        onOpenChange={(open) => {
          if (!open) setSheetId(null)
        }}
        onDelete={setDeleteTarget}
      />

      <Dialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
      >
        <DialogContent className="max-w-sm rounded-lg" showCloseButton={false}>
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
