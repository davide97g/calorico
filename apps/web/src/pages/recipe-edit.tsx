import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  Check,
  Loader2,
  Minus,
  Plus,
  ScanBarcode,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { AppShell } from '@/components/layout/app-shell'
import { TopBar } from '@/components/layout/top-bar'
import { BarcodeScanner } from '@/components/food/barcode-scanner'
import { FoodEmojiTile } from '@/components/food/food-emoji-tile'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Panel, PanelHeader } from '@/components/ui/panel'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useBarcodeLookup, useFoodSearch } from '@/hooks/use-foods'
import {
  useCreateRecipe,
  useDeleteRecipe,
  useRecipe,
  useUpdateRecipe,
} from '@/hooks/use-recipes'
import { ApiError } from '@/lib/api'
import { todayISO } from '@/lib/date'
import { currentMeal, grams, kcal } from '@/lib/format'
import { composeLines } from '@/lib/nutrition'
import { cn } from '@/lib/utils'
import type { Food } from '@/lib/types'

/**
 * Writing a recipe down: what went in, how much it makes, how many portions.
 *
 * The panel at the bottom is the point of the screen. A recipe is worth
 * building only if it answers "what is a portion of this?", so the answer is
 * live and permanent on screen while the ingredients are still being weighed —
 * the same arithmetic the server will run on save, so the number does not move
 * when the button is pressed.
 */

/** One ingredient while it is being edited. Grams stay a string: so does typing. */
interface Line {
  /** Stable across re-orders and duplicates, which a food id is not. */
  key: string
  foodId: string
  name: string
  category: string | null
  unit: string
  kcal100: number
  protein100: number
  carbs100: number
  fat100: number
  quantity: string
}

const numeric = (value: string) => {
  const n = Number(value.replace(',', '.'))
  return Number.isFinite(n) && n >= 0 ? n : 0
}

let seq = 0
const nextKey = () => `line-${++seq}`

export default function RecipeEditPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const day = params.get('day') ?? todayISO()
  const meal = params.get('meal') ?? currentMeal()

  const editing = Boolean(id)
  const recipe = useRecipe(id)
  const createRecipe = useCreateRecipe()
  const updateRecipe = useUpdateRecipe()
  const deleteRecipe = useDeleteRecipe()

  const [name, setName] = useState(params.get('name') ?? '')
  const [note, setNote] = useState('')
  const [servings, setServings] = useState('1')
  /** Empty means "it weighs what went in" — see the field's own helper text. */
  const [yieldG, setYieldG] = useState('')
  const [lines, setLines] = useState<Line[]>([])
  const [loaded, setLoaded] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const [term, setTerm] = useState('')
  const [debounced, setDebounced] = useState('')
  const [scanning, setScanning] = useState(false)
  const resultsRef = useRef<HTMLUListElement>(null)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(term.trim()), 350)
    return () => clearTimeout(timer)
  }, [term])

  const search = useFoodSearch(debounced)
  const barcode = useBarcodeLookup()

  // The form is filled from the server once and then belongs to the person
  // typing into it: refetching must never overwrite an edit in progress.
  useEffect(() => {
    if (!recipe.data || loaded) return
    setName(recipe.data.name)
    setNote(recipe.data.note ?? '')
    setServings(String(recipe.data.servings))
    setYieldG(
      recipe.data.yieldG === recipe.data.ingredientsG
        ? ''
        : String(recipe.data.yieldG),
    )
    setLines(
      recipe.data.items.map((item) => ({
        key: nextKey(),
        foodId: item.foodId,
        name: item.name,
        category: item.category,
        unit: item.unit,
        kcal100: item.kcal100,
        protein100: item.protein100,
        carbs100: item.carbs100,
        fat100: item.fat100,
        quantity: String(item.quantityG),
      })),
    )
    setLoaded(true)
  }, [recipe.data, loaded])

  const weighed = useMemo(
    () => lines.map((line) => ({ line, quantityG: numeric(line.quantity) })),
    [lines],
  )
  const ingredientsG = weighed.reduce((sum, l) => sum + l.quantityG, 0)
  const servingsValue = Math.max(0.5, numeric(servings) || 1)
  const yieldValue = numeric(yieldG) || ingredientsG
  const totals = useMemo(
    () =>
      composeLines(
        weighed.map(({ line, quantityG }) => ({ per100: line, quantityG })),
      ),
    [weighed],
  )
  const portionG = yieldValue > 0 ? yieldValue / servingsValue : 0
  const perPortionKcal = Math.round(totals.kcal / servingsValue)
  const per100Kcal =
    yieldValue > 0 ? Math.round((totals.kcal / yieldValue) * 100) : 0

  const alreadyIn = new Set(lines.map((line) => line.foodId))
  const hits = (search.data?.items ?? [])
    .filter((food) => !alreadyIn.has(food.id))
    .slice(0, 6)

  /**
   * The panel at the bottom is pinned, so on a short page the hits come up
   * underneath it. Bringing them into view is what a native search field does
   * when the keyboard opens, and without it the first ingredient of every
   * recipe is added blind.
   */
  useEffect(() => {
    if (hits.length === 0) return
    resultsRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [hits.length])

  const addFood = (food: Food) => {
    setLines((current) => [
      ...current,
      {
        key: nextKey(),
        foodId: food.id,
        name: food.name,
        category: food.category,
        unit: food.unit,
        kcal100: food.kcal100,
        protein100: food.protein100,
        carbs100: food.carbs100,
        fat100: food.fat100,
        // The portion the pack declares, when it has one: a yogurt is 150 g far
        // more often than it is 100.
        quantity: String(food.servingSizeG ?? 100),
      },
    ])
    setTerm('')
    setDebounced('')
  }

  /**
   * The pack in your hand is the other way to name an ingredient, and the
   * better one whenever there is a label: no spelling, no picking the right
   * yogurt out of nine. Same lookup as the search screen's scanner, so a
   * product the catalogue has never seen is cached by the scan itself.
   */
  const handleScan = (code: string) => {
    barcode.mutate(code, {
      onSuccess: (food) => {
        setScanning(false)
        if (lines.some((line) => line.foodId === food.id)) {
          toast.info(`${food.name} è già fra gli ingredienti`)
          return
        }
        addFood(food)
        toast.success(`${food.name} aggiunto`, {
          description: 'Scrivi quanti grammi ne metti.',
        })
      },
      onError: (err) =>
        toast.error(
          err instanceof ApiError
            ? err.message
            : 'Ricerca del codice a barre non riuscita',
        ),
    })
  }

  const valid =
    name.trim().length >= 2 &&
    weighed.length > 0 &&
    weighed.every(({ quantityG }) => quantityG > 0) &&
    yieldValue > 0

  const body = () => ({
    name: name.trim(),
    note: note.trim(),
    servings: servingsValue,
    // Sent only when somebody overrode it, so an edited ingredient still moves
    // the weight of a dish nobody cooked down.
    ...(yieldG.trim() ? { yieldG: yieldValue } : {}),
    items: weighed.map(({ line, quantityG }) => ({
      foodId: line.foodId,
      quantityG,
    })),
  })

  const onError = (err: unknown) =>
    toast.error(
      err instanceof ApiError ? err.message : 'Non è stato possibile salvare la ricetta',
    )

  const save = () => {
    if (!valid) return
    if (editing && id) {
      updateRecipe.mutate(
        { id, ...body() },
        {
          onSuccess: () => {
            toast.success('Ricetta aggiornata')
            navigate('/recipes', { replace: true })
          },
          onError,
        },
      )
      return
    }
    createRecipe.mutate(body(), {
      onSuccess: (created) => {
        toast.success('Ricetta salvata', {
          description: 'La trovi nella ricerca come qualsiasi altro alimento.',
        })
        // Straight to the portion field, on one portion: somebody who writes a
        // recipe down at the stove is usually about to eat it.
        navigate(
          `/food/${created.food.id}?day=${day}&meal=${meal}&q=${created.portionG}`,
          { replace: true },
        )
      },
      onError,
    })
  }

  const saving = createRecipe.isPending || updateRecipe.isPending

  if (editing && recipe.isLoading) {
    return (
      <AppShell nav={false}>
        <Skeleton className="h-11 w-40 rounded-full" />
        <Skeleton className="mt-4 h-32 rounded-lg" />
        <Skeleton className="mt-3 h-64 rounded-lg" />
      </AppShell>
    )
  }

  return (
    <AppShell nav={false}>
      <TopBar
        eyebrow="Cucina"
        title={editing ? 'Modifica ricetta' : 'Nuova ricetta'}
        back="/recipes"
        avatar={false}
        action={
          editing ? (
            <Button
              variant="secondary"
              size="icon"
              className="bg-card text-destructive shadow-soft size-11 shrink-0 rounded-full"
              onClick={() => setConfirmingDelete(true)}
              aria-label="Elimina ricetta"
            >
              <Trash2 className="size-4" />
            </Button>
          ) : null
        }
      />

      <Panel>
        <PanelHeader title="La ricetta" />
        <div className="mt-3 flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-muted-foreground text-xs font-medium">Nome</span>
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Pancake proteici"
              className="h-12 rounded-md text-base font-semibold"
              autoFocus={!editing}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-muted-foreground text-xs font-medium">
              Nota (facoltativa)
            </span>
            <Input
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Padella antiaderente, 3 minuti per lato"
              className="h-11 rounded-md"
            />
          </label>
        </div>
      </Panel>

      <Panel className="mt-3">
        <PanelHeader
          title="Ingredienti"
          action={
            ingredientsG > 0 ? (
              <span className="text-muted-foreground tabular text-xs font-semibold">
                {grams(ingredientsG)} g in tutto
              </span>
            ) : null
          }
        />

        {lines.length ? (
          <ul className="mt-3 flex flex-col gap-2">
            {weighed.map(({ line, quantityG }) => (
              <li
                key={line.key}
                className="bg-secondary/45 flex items-center gap-2 rounded-md p-2"
              >
                <FoodEmojiTile name={line.name} category={line.category} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">
                    {line.name}
                  </span>
                  <span className="text-muted-foreground tabular block text-micro">
                    {kcal((line.kcal100 * quantityG) / 100)} kcal ·{' '}
                    {kcal(line.kcal100)} kcal/100 {line.unit}
                  </span>
                </span>
                <span className="relative w-24 shrink-0">
                  <Input
                    value={line.quantity}
                    onChange={(event) =>
                      setLines((current) =>
                        current.map((l) =>
                          l.key === line.key
                            ? { ...l, quantity: event.target.value }
                            : l,
                        ),
                      )
                    }
                    onFocus={(event) => event.currentTarget.select()}
                    inputMode="decimal"
                    aria-label={`Quantità di ${line.name} in ${line.unit}`}
                    className={cn(
                      'tabular bg-card h-11 rounded-md pr-8 text-right text-sm font-bold',
                      quantityG <= 0 && 'border-destructive',
                    )}
                  />
                  <span className="text-muted-foreground pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-micro font-semibold">
                    {line.unit}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setLines((current) =>
                      current.filter((l) => l.key !== line.key),
                    )
                  }
                  className="text-muted-foreground hover:bg-secondary flex size-11 shrink-0 items-center justify-center rounded-full transition-colors"
                  aria-label={`Togli ${line.name} dalla ricetta`}
                >
                  <X className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground mt-3 text-sm">
            Cerca gli alimenti uno alla volta e scrivi quanti grammi ne metti.
          </p>
        )}

        {/* Typed or scanned, side by side, exactly as on the search screen: an
            ingredient is a food like any other and gets both ways in. */}
        <div className="mt-3 flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2" />
            {search.isFetching && debounced.length >= 2 ? (
              <Loader2 className="text-muted-foreground absolute top-1/2 right-3.5 size-4 -translate-y-1/2 animate-spin" />
            ) : null}
            <Input
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              placeholder="Aggiungi un ingrediente…"
              aria-label="Cerca un ingrediente"
              className="h-12 rounded-full pr-10 pl-10 text-sm"
            />
          </div>
          <Button
            variant="secondary"
            size="icon"
            className="bg-secondary size-12 shrink-0 rounded-full"
            onClick={() => setScanning(true)}
            aria-label="Scansiona il codice a barre di un ingrediente"
          >
            <ScanBarcode className="text-primary-strong size-5" />
          </Button>
        </div>

        {debounced.length >= 2 ? (
          hits.length ? (
            <ul ref={resultsRef} className="mt-2">
              {hits.map((food) => (
                <li key={food.id}>
                  <button
                    type="button"
                    onClick={() => addFood(food)}
                    className="hover:bg-secondary/70 flex w-full items-center gap-3 rounded-md p-2 text-left transition-colors"
                  >
                    <FoodEmojiTile
                      name={food.name}
                      category={food.category}
                      size="sm"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {food.name}
                      </span>
                      <span className="text-muted-foreground tabular block truncate text-micro">
                        {food.brand ? `${food.brand} · ` : ''}
                        {kcal(food.kcal100)} kcal/100 {food.unit}
                      </span>
                    </span>
                    <Plus className="text-primary-strong size-4 shrink-0" />
                  </button>
                </li>
              ))}
            </ul>
          ) : !search.isFetching ? (
            <p className="text-muted-foreground mt-3 px-1 text-xs">
              Nessun risultato per “{debounced}”. Creane uno dalla ricerca
              alimenti e torna qui.
            </p>
          ) : null
        ) : null}
      </Panel>

      <Panel className="mt-3">
        <PanelHeader title="Quanto ne viene" />

        <div className="mt-3 flex items-center justify-between gap-3">
          <span className="min-w-0">
            <span className="block text-sm font-semibold">Porzioni</span>
            <span className="text-muted-foreground block text-micro">
              In quante parti la dividi
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-1">
            <Button
              variant="secondary"
              size="icon"
              className="size-11 rounded-full"
              onClick={() =>
                setServings(String(Math.max(1, Math.round(servingsValue) - 1)))
              }
              disabled={servingsValue <= 1}
              aria-label="Una porzione in meno"
            >
              <Minus className="size-4" />
            </Button>
            <Input
              value={servings}
              onChange={(event) => setServings(event.target.value)}
              onFocus={(event) => event.currentTarget.select()}
              inputMode="decimal"
              aria-label="Numero di porzioni"
              className="tabular h-11 w-14 rounded-md text-center text-base font-bold"
            />
            <Button
              variant="secondary"
              size="icon"
              className="size-11 rounded-full"
              onClick={() =>
                setServings(String(Math.min(99, Math.round(servingsValue) + 1)))
              }
              disabled={servingsValue >= 99}
              aria-label="Una porzione in più"
            >
              <Plus className="size-4" />
            </Button>
          </span>
        </div>

        <label className="mt-4 flex flex-col gap-1.5">
          <span className="text-muted-foreground text-xs font-medium">
            Peso a fine cottura (g)
          </span>
          <Input
            value={yieldG}
            onChange={(event) => setYieldG(event.target.value)}
            inputMode="decimal"
            placeholder={ingredientsG > 0 ? String(Math.round(ingredientsG)) : '0'}
            className="tabular h-11 rounded-md"
          />
          <span className="text-muted-foreground text-micro leading-relaxed">
            Lascialo vuoto se non cuoce: vale il peso degli ingredienti. Pesa la
            pentola piena se hai cotto — è quello che cambia le calorie per 100 g.
          </span>
        </label>
      </Panel>

      {/* The answer, always on screen. It is the reason to write a recipe down:
          a portion in grams and in calories, before anything has been saved. */}
      {/* `pointer-events-none` on the strip and back on again inside it: the
          transparent half of the gradient covers real content, and a tap that
          lands on nothing is worse than one that scrolls. */}
      <div className="pointer-events-none sticky bottom-0 z-10 -mx-4 mt-4 bg-gradient-to-t from-background via-background to-transparent px-4 pt-7 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {/* Nothing to say before the first ingredient — and saying "0 kcal"
            there costs the search field and the scan button the room they
            need, on the one screen state where they are the whole job. */}
        {lines.length ? (
          <div className="bg-card shadow-float pointer-events-auto rounded-lg p-3">
            <div className="flex items-end justify-between gap-3">
              <div className="min-w-0">
                <p className="text-muted-foreground text-micro font-semibold tracking-wide uppercase">
                  Una porzione
                </p>
                <p className="font-display tabular mt-1 text-2xl leading-none font-extrabold tracking-tight">
                  {kcal(perPortionKcal)}
                  <span className="text-muted-foreground ml-1 text-sm font-semibold">
                    kcal
                  </span>
                </p>
                <p className="text-muted-foreground tabular mt-1 text-micro">
                  {grams(portionG)} g · {kcal(per100Kcal)} kcal/100 g
                </p>
              </div>
              <dl className="flex shrink-0 gap-1.5">
                <MacroPill
                  label="C"
                  value={totals.carbsG / servingsValue}
                  accent="bg-carbs"
                />
                <MacroPill
                  label="G"
                  value={totals.fatG / servingsValue}
                  accent="bg-fat"
                />
                <MacroPill
                  label="P"
                  value={totals.proteinG / servingsValue}
                  accent="bg-protein"
                />
              </dl>
            </div>
          </div>
        ) : null}

        <Button
          className="shadow-float pointer-events-auto mt-2 h-13 w-full rounded-full text-base font-semibold"
          onClick={save}
          disabled={!valid || saving}
        >
          {saving ? (
            <Loader2 className="size-5 animate-spin" />
          ) : (
            <Check className="size-5" />
          )}
          {editing ? 'Salva le modifiche' : 'Salva la ricetta'}
        </Button>
      </div>

      <BarcodeScanner
        open={scanning}
        onOpenChange={setScanning}
        onDetected={handleScan}
        isLoading={barcode.isPending}
      />

      <Dialog open={confirmingDelete} onOpenChange={setConfirmingDelete}>
        <DialogContent className="max-w-sm rounded-xl">
          <DialogHeader>
            <DialogTitle>Eliminare “{name}”?</DialogTitle>
            <DialogDescription>
              Sparisce dalla ricerca e non potrai più registrarla. Quello che hai
              già mangiato resta nel diario.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              variant="secondary"
              className="h-12 rounded-full"
              onClick={() => setConfirmingDelete(false)}
            >
              Annulla
            </Button>
            <Button
              variant="destructive"
              className="h-12 rounded-full font-semibold"
              disabled={deleteRecipe.isPending}
              onClick={() => {
                if (!id) return
                deleteRecipe.mutate(id, {
                  onSuccess: () => {
                    toast.success('Ricetta eliminata')
                    navigate('/recipes', { replace: true })
                  },
                  onError,
                })
              }}
            >
              Elimina
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  )
}

function MacroPill({
  label,
  value,
  accent,
}: {
  label: string
  value: number
  accent: string
}) {
  return (
    <div className="bg-secondary/65 rounded-md px-2 py-1.5 text-center">
      <dt className="text-muted-foreground flex items-center justify-center gap-1 text-micro leading-none font-medium">
        <span className={cn('size-1.5 rounded-full', accent)} />
        {label}
      </dt>
      <dd className="tabular mt-1 text-xs leading-none font-bold">
        {grams(value)}
      </dd>
    </div>
  )
}
