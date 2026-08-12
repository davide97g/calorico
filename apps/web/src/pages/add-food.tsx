import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft,
  Camera,
  Clock,
  Loader2,
  PlusCircle,
  ScanBarcode,
  Search,
  Star,
} from 'lucide-react'
import { toast } from 'sonner'
import { AppShell } from '@/components/layout/app-shell'
import { FoodRow } from '@/components/food/food-row'
import { HistoryBadge } from '@/components/food/history-badge'
import { BarcodeScanner } from '@/components/food/barcode-scanner'
import { PhotoMealSheet } from '@/components/food/photo-meal-sheet'
import { WhenBar } from '@/components/food/when-picker'
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
  useVisionStatus,
} from '@/hooks/use-diary'
import { useGroceryOffer } from '@/hooks/use-grocery'
import { ApiError } from '@/lib/api'
import { todayISO } from '@/lib/date'
import { currentMeal, grams } from '@/lib/format'
import type { When } from '@/lib/when'
import type { Food, Meal, RecentFood } from '@/lib/types'

export default function AddFoodPage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const day = params.get('day') ?? todayISO()
  const meal = (params.get('meal') as Meal | null) ?? currentMeal()

  // The target lives in the URL so every link out of this screen — the food
  // page, the new-food form, the scanner — carries it without extra plumbing.
  const setWhen = (next: When) => {
    const updated = new URLSearchParams(params)
    updated.set('day', next.day)
    updated.set('meal', next.meal)
    setParams(updated, { replace: true })
  }

  const [term, setTerm] = useState('')
  const [debounced, setDebounced] = useState('')
  const [scannerOpen, setScannerOpen] = useState(false)
  const [photographing, setPhotographing] = useState(false)
  // No provider configured on the server means no dead-end button.
  const photoEnabled = useVisionStatus().data?.enabled ?? false

  /**
   * The keyboard opens only when the user came here to type. Arriving from a
   * "search" button is that; landing here to pick from Recenti is not, and the
   * keyboard used to cover the very list that answers most days.
   */
  const searchIntent = params.get('focus') === '1'

  // OFF calls are slow and rate-limited; wait for a pause in typing.
  useEffect(() => {
    const id = setTimeout(() => setDebounced(term), 350)
    return () => clearTimeout(id)
  }, [term])

  const search = useFoodSearch(debounced)
  /**
   * `all`: this tab is where someone comes back looking for the thing they
   * scanned, searched out or typed in an hour ago, whether or not they got as
   * far as saving it. The dashboard strip stays on logged foods only — it
   * promises a portion with one tap.
   */
  const recent = useRecentFoods(meal, 'all')
  const favorites = useFavoriteFoods()
  const barcode = useBarcodeLookup()
  const offerGrocery = useGroceryOffer()

  const foodLink = (id: string) => `/food/${id}?day=${day}&meal=${meal}`
  /**
   * A food already eaten opens on the portion it was eaten in. One only ever
   * scanned or created has no such portion, and passing none lets the food
   * screen fall back to the pack serving.
   */
  const recentLink = (food: RecentFood) =>
    food.lastQuantityG == null
      ? foodLink(food.id)
      : `${foodLink(food.id)}&q=${food.lastQuantityG}`

  const handleDetected = (code: string) => {
    barcode.mutate(code, {
      onSuccess: (food) => {
        setScannerOpen(false)
        navigate(foodLink(food.id))
        // The shopping list is a separate intention, so it is offered, not done.
        offerGrocery(food, 'Scegli la porzione e salva.')
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
          className="bg-card shadow-soft size-11 shrink-0 rounded-full"
          onClick={() => navigate(-1)}
          aria-label="Torna indietro"
        >
          <ArrowLeft className="size-4" />
        </Button>
        <h1 className="text-lg font-bold">Aggiungi alimento</h1>
      </header>

      <WhenBar value={{ day, meal }} onChange={setWhen} className="mb-3" />

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
            autoFocus={searchIntent}
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
                <Skeleton key={i} className="h-14 rounded-md" />
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
          <TabsList className="bg-card shadow-soft h-12 w-full rounded-full p-1">
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
              empty="Gli alimenti che registri, scansioni o crei finiscono qui."
              linkFor={(food) => recentLink(food as RecentFood)}
              trailingFor={(food) => {
                const { lastQuantityG } = food as RecentFood
                if (lastQuantityG == null) return null
                // The remembered portion, marked as remembered: this row opens
                // on that number, and it is worth knowing it is the user's own.
                return (
                  <span className="flex items-center gap-1.5">
                    <HistoryBadge compact />
                    <span className="tabular">
                      {grams(lastQuantityG)} {food.unit}
                    </span>
                  </span>
                )
              }}
            />
          </TabsContent>
          <TabsContent value="favorites">
            <FoodList
              items={favorites.data?.items}
              loading={favorites.isLoading}
              empty="Segna un alimento con la stella per ritrovarlo qui."
              linkFor={(food) => foodLink(food.id)}
            />
          </TabsContent>
        </Tabs>
      )}

      {/* Both last resorts, so both sit here in the same quiet weight: a food
          the catalogue has never heard of, and a restaurant plate nobody can
          weigh. */}
      <div className="mt-4 flex flex-col gap-1">
        {photoEnabled ? (
          <Button
            variant="ghost"
            className="text-muted-foreground w-full rounded-full"
            onClick={() => setPhotographing(true)}
          >
            <Camera className="size-4" />
            Stima un piatto da una foto
          </Button>
        ) : null}
        <Button
          variant="ghost"
          className="text-muted-foreground w-full rounded-full"
          onClick={() => navigate(`/food/new?day=${day}&meal=${meal}`)}
        >
          <PlusCircle className="size-4" />
          Crea un alimento personalizzato
        </Button>
      </div>

      <BarcodeScanner
        open={scannerOpen}
        onOpenChange={setScannerOpen}
        onDetected={handleDetected}
        isLoading={barcode.isPending}
      />
      {photoEnabled ? (
        <PhotoMealSheet
          open={photographing}
          onOpenChange={setPhotographing}
          day={day}
          meal={meal}
        />
      ) : null}
    </AppShell>
  )
}

function FoodList({
  items,
  loading,
  empty,
  linkFor,
  trailingFor,
}: {
  items?: Food[]
  loading: boolean
  empty: string
  linkFor: (food: Food) => string
  trailingFor?: (food: Food) => ReactNode
}) {
  if (loading) {
    return (
      <Panel className="mt-2 flex flex-col gap-2 p-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-14 rounded-md" />
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
            <FoodRow
              food={food}
              to={linkFor(food)}
              trailing={trailingFor?.(food)}
            />
          </li>
        ))}
      </ul>
    </Panel>
  )
}
