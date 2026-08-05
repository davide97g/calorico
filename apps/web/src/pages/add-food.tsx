import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Clock, Loader2, PlusCircle, ScanBarcode, Search, Star } from 'lucide-react'
import { toast } from 'sonner'
import { AppShell } from '@/components/layout/app-shell'
import { FoodRow } from '@/components/food/food-row'
import { BarcodeScanner } from '@/components/food/barcode-scanner'
import { Panel } from '@/components/ui/panel'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  useBarcodeLookup,
  useFavoriteFoods,
  useFoodSearch,
  useRecentFoods,
} from '@/hooks/use-diary'
import { useAddGroceryItem } from '@/hooks/use-grocery'
import { ApiError } from '@/lib/api'
import { todayISO } from '@/lib/date'
import { currentMeal } from '@/lib/format'
import type { Food, Meal } from '@/lib/types'

export default function AddFoodPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const day = params.get('day') ?? todayISO()
  const meal = (params.get('meal') as Meal | null) ?? currentMeal()

  const [term, setTerm] = useState('')
  const [debounced, setDebounced] = useState('')
  const [scannerOpen, setScannerOpen] = useState(false)

  // OFF calls are slow and rate-limited; wait for a pause in typing.
  useEffect(() => {
    const id = setTimeout(() => setDebounced(term), 350)
    return () => clearTimeout(id)
  }, [term])

  const search = useFoodSearch(debounced)
  const recent = useRecentFoods()
  const favorites = useFavoriteFoods()
  const barcode = useBarcodeLookup()
  const addGroceryItem = useAddGroceryItem()

  const foodLink = (id: string) => `/food/${id}?day=${day}&meal=${meal}`

  const handleDetected = (code: string) => {
    barcode.mutate(code, {
      onSuccess: async (food) => {
        setScannerOpen(false)
        try {
          await addGroceryItem.mutateAsync({ foodId: food.id })
          toast.success(`${food.name} aggiunto alla spesa`)
        } catch {
          toast.error('Scansione riuscita, ma aggiunta alla spesa non riuscita')
        }
        navigate(foodLink(food.id))
      },
      onError: (err) => {
        const message =
          err instanceof ApiError
            ? err.message
            : 'Ricerca del codice a barre non riuscita'
        toast.error(message, {
          description:
            err instanceof ApiError && err.code === 'product_not_found'
              ? 'Puoi crearlo a mano dalla scheda "Crea".'
              : undefined,
        })
      },
    })
  }

  const searching = search.isFetching && debounced.length >= 2

  return (
    <AppShell nav={false}>
      <header className="mb-3 flex items-center gap-2">
        <Button
          variant="secondary"
          size="icon"
          className="bg-card shadow-soft size-10 shrink-0 rounded-full"
          onClick={() => navigate(-1)}
          aria-label="Torna indietro"
        >
          <ArrowLeft className="size-4" />
        </Button>
        <h1 className="text-[17px] font-bold">Aggiungi alimento</h1>
      </header>

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2" />
          {searching ? (
            <Loader2 className="text-muted-foreground absolute top-1/2 right-3.5 size-4 -translate-y-1/2 animate-spin" />
          ) : null}
          <Input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Cerca: pollo, nutella, yogurt greco…"
            className="bg-card shadow-soft h-12 rounded-full border-transparent pl-10 text-sm"
            autoFocus
            aria-label="Cerca alimento"
          />
        </div>
        <Button
          variant="secondary"
          size="icon"
          className="bg-card shadow-soft size-12 shrink-0 rounded-full"
          onClick={() => setScannerOpen(true)}
          aria-label="Scansiona codice a barre"
        >
          <ScanBarcode className="size-5" />
        </Button>
      </div>

      {debounced.length >= 2 ? (
        <Panel className="mt-3 p-2">
          {search.isPending ? (
            <div className="flex flex-col gap-2 p-1">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-14 rounded-2xl" />
              ))}
            </div>
          ) : search.data?.items.length ? (
            <ul>
              {search.data.items.map((food) => (
                <li key={food.id}>
                  <FoodRow food={food} to={foodLink(food.id)} />
                </li>
              ))}
            </ul>
          ) : (
            <div className="p-4 text-center">
              <p className="text-muted-foreground text-sm">
                Nessun risultato per “{debounced}”.
              </p>
              <Button
                variant="secondary"
                className="mt-3 rounded-full"
                onClick={() =>
                  navigate(
                    `/food/new?day=${day}&meal=${meal}&name=${encodeURIComponent(debounced)}`,
                  )
                }
              >
                <PlusCircle className="size-4" />
                Crea “{debounced}”
              </Button>
            </div>
          )}
        </Panel>
      ) : (
        <Tabs defaultValue="recent" className="mt-3">
          <TabsList className="bg-card shadow-soft h-10 w-full rounded-full p-1">
            <TabsTrigger
              value="recent"
              className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-full text-xs data-[state=active]:shadow-none"
            >
              <Clock className="size-3.5" />
              Recenti
            </TabsTrigger>
            <TabsTrigger
              value="favorites"
              className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-full text-xs data-[state=active]:shadow-none"
            >
              <Star className="size-3.5" />
              Preferiti
            </TabsTrigger>
          </TabsList>

          <TabsContent value="recent">
            <FoodList
              items={recent.data?.items}
              loading={recent.isLoading}
              empty="Gli alimenti che registri finiscono qui."
              linkFor={foodLink}
            />
          </TabsContent>
          <TabsContent value="favorites">
            <FoodList
              items={favorites.data?.items}
              loading={favorites.isLoading}
              empty="Segna un alimento con la stella per ritrovarlo qui."
              linkFor={foodLink}
            />
          </TabsContent>
        </Tabs>
      )}

      <Button
        variant="ghost"
        className="text-muted-foreground mt-4 w-full rounded-full"
        onClick={() => navigate(`/food/new?day=${day}&meal=${meal}`)}
      >
        <PlusCircle className="size-4" />
        Crea un alimento personalizzato
      </Button>

      <BarcodeScanner
        open={scannerOpen}
        onOpenChange={setScannerOpen}
        onDetected={handleDetected}
        isLoading={barcode.isPending}
      />
    </AppShell>
  )
}

function FoodList({
  items,
  loading,
  empty,
  linkFor,
}: {
  items?: Food[]
  loading: boolean
  empty: string
  linkFor: (id: string) => string
}) {
  if (loading) {
    return (
      <Panel className="mt-2 flex flex-col gap-2 p-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-14 rounded-2xl" />
        ))}
      </Panel>
    )
  }
  if (!items?.length) {
    return (
      <Panel className="mt-2 p-6">
        <p className="text-muted-foreground text-center text-sm">{empty}</p>
      </Panel>
    )
  }
  return (
    <Panel className="mt-2 p-2">
      <ul>
        {items.map((food) => (
          <li key={food.id}>
            <FoodRow food={food} to={linkFor(food.id)} />
          </li>
        ))}
      </ul>
    </Panel>
  )
}
