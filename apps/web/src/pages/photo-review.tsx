import { useMemo, useState } from 'react'
import {
  Link,
  Navigate,
  useLocation,
  useNavigate,
  useSearchParams,
} from 'react-router-dom'
import { toast } from 'sonner'
import { Check, ChevronLeft, Plus, Sparkles, Trash2, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FoodEmojiTile } from '@/components/food/food-emoji-tile'
import { useAddEntries } from '@/hooks/use-diary'
import { ApiError } from '@/lib/api'
import { todayISO } from '@/lib/date'
import { currentMeal, kcal as fmtKcal, MEAL_LABELS } from '@/lib/format'
import { scalePer100 } from '@/lib/nutrition'
import { cn } from '@/lib/utils'
import type {
  AnalyzedItem,
  BatchEntryInput,
  Food,
  Meal,
  MealAnalysis,
  Nutrients100,
} from '@/lib/types'

/** An analysed item once the user has started editing it. */
interface Row {
  key: string
  label: string
  quantityG: number
  confidence: AnalyzedItem['confidence']
  basis: string
  isLiquid: boolean
  /** Chosen catalogue food, or null when running on the model's estimate. */
  food: Food | null
  candidates: Food[]
  estimate: Nutrients100 | null
}

function toRows(items: AnalyzedItem[]): Row[] {
  return items.map((item, i) => ({
    key: `${i}-${item.label}`,
    label: item.label,
    quantityG: item.quantityG,
    confidence: item.confidence,
    basis: item.basis,
    isLiquid: item.isLiquid,
    food: item.matched ? (item.candidates[0] ?? null) : null,
    candidates: item.candidates,
    estimate: item.nutrients100,
  }))
}

/** Per-100 values for a row: the chosen food if there is one, else the estimate. */
function per100Of(row: Row): Nutrients100 | null {
  if (row.food) {
    return {
      kcal100: row.food.kcal100,
      protein100: row.food.protein100,
      carbs100: row.food.carbs100,
      fat100: row.food.fat100,
      fiber100: row.food.fiber100,
    }
  }
  return row.estimate
}

function rowKcal(row: Row): number | null {
  const per100 = per100Of(row)
  return per100 ? scalePer100(per100, row.quantityG).kcal : null
}

export default function PhotoReviewPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const addEntries = useAddEntries()

  const day = params.get('day') ?? todayISO()
  const meal = (params.get('meal') as Meal | null) ?? currentMeal()

  const analysis = (location.state as { analysis?: MealAnalysis } | null)?.analysis
  const [rows, setRows] = useState<Row[]>(() => toRows(analysis?.items ?? []))
  const [openPicker, setOpenPicker] = useState<string | null>(null)

  const total = useMemo(
    () => rows.reduce((sum, row) => sum + (rowKcal(row) ?? 0), 0),
    [rows],
  )

  // Reached by refresh or a direct link: the analysis lives in router state and
  // is deliberately not persisted, so there is nothing to review.
  if (!analysis) return <Navigate to="/" replace />

  const update = (key: string, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)))

  const remove = (key: string) =>
    setRows((prev) => prev.filter((r) => r.key !== key))

  /** A row with neither a food nor an estimate cannot be turned into an entry. */
  const unresolved = rows.filter((r) => per100Of(r) === null)
  const canSave = rows.length > 0 && unresolved.length === 0

  const handleSave = () => {
    const items: BatchEntryInput[] = rows.flatMap((row): BatchEntryInput[] => {
      if (row.food) return [{ foodId: row.food.id, quantityG: row.quantityG }]
      if (!row.estimate) return []
      return [
        {
          newFood: {
            name: row.label,
            kcal100: row.estimate.kcal100,
            protein100: row.estimate.protein100,
            carbs100: row.estimate.carbs100,
            fat100: row.estimate.fat100,
            ...(row.estimate.fiber100 != null
              ? { fiber100: row.estimate.fiber100 }
              : {}),
            isLiquid: row.isLiquid,
          },
          quantityG: row.quantityG,
        },
      ]
    })

    addEntries.mutate(
      { day, meal, items },
      {
        onSuccess: () => {
          toast.success(`${items.length} alimenti aggiunti a ${MEAL_LABELS[meal]}`)
          navigate('/', { replace: true })
        },
        onError: (err) =>
          toast.error(
            err instanceof ApiError ? err.message : 'Salvataggio non riuscito',
          ),
      },
    )
  }

  return (
    <div className="px-4 pt-3 pb-4">
      <div className="mb-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="text-muted-foreground -ml-2 flex size-9 items-center justify-center"
          aria-label="Indietro"
        >
          <ChevronLeft className="size-5" strokeWidth={2.5} />
        </button>
        <div className="min-w-0">
          <h1 className="truncate text-[17px] font-bold">Controlla il pasto</h1>
          <p className="text-muted-foreground text-[11px] font-medium">
            Stime da foto · {MEAL_LABELS[meal]}
          </p>
        </div>
      </div>

      <p className="text-muted-foreground bg-secondary/60 mb-3 flex items-start gap-2 rounded-2xl px-3 py-2.5 text-[11px] font-medium">
        <Sparkles className="text-primary-strong mt-0.5 size-3.5 shrink-0" strokeWidth={2.4} />
        Le quantità sono stimate dalla foto: controllale, sono la parte più
        facile da sbagliare.
      </p>

      <ul className="space-y-2">
        {rows.map((row) => {
          const rowTotal = rowKcal(row)
          const picking = openPicker === row.key
          return (
            <li key={row.key} className="bg-card shadow-soft rounded-[22px] p-3">
              <div className="flex items-start gap-3">
                <FoodEmojiTile
                  name={row.food?.name ?? row.label}
                  category={row.food?.category}
                />

                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => setOpenPicker(picking ? null : row.key)}
                    className="block w-full text-left"
                  >
                    <p className="truncate text-sm font-bold">
                      {row.food?.name ?? row.label}
                    </p>
                    <p className="text-muted-foreground truncate text-[11px] font-medium">
                      {row.food
                        ? (row.food.brand ?? 'Dal database')
                        : 'Stima nutrizionale · tocca per cercare'}
                    </p>
                  </button>

                  <div className="mt-2 flex items-center gap-2">
                    <div className="relative w-24">
                      <Input
                        type="number"
                        inputMode="decimal"
                        min={1}
                        value={row.quantityG}
                        onChange={(e) =>
                          update(row.key, {
                            quantityG: Math.max(0, Number(e.target.value) || 0),
                          })
                        }
                        className="h-10 pr-8 text-sm font-semibold"
                        aria-label={`Quantità di ${row.label}`}
                      />
                      <span className="text-muted-foreground pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-[11px] font-semibold">
                        {row.isLiquid ? 'ml' : 'g'}
                      </span>
                    </div>

                    <span className="tabular text-sm font-bold">
                      {rowTotal == null ? '—' : `${fmtKcal(rowTotal)} kcal`}
                    </span>

                    <button
                      type="button"
                      onClick={() => remove(row.key)}
                      className="text-muted-foreground hover:text-destructive ml-auto flex size-9 items-center justify-center"
                      aria-label={`Rimuovi ${row.label}`}
                    >
                      <Trash2 className="size-4" strokeWidth={2.2} />
                    </button>
                  </div>

                  {row.confidence === 'low' && row.basis && (
                    <p className="text-muted-foreground mt-2 flex items-start gap-1.5 text-[11px] font-medium">
                      <TriangleAlert className="mt-0.5 size-3 shrink-0" strokeWidth={2.4} />
                      <span>Stima incerta. {row.basis}</span>
                    </p>
                  )}
                </div>
              </div>

              {picking && (
                <div className="border-border/70 mt-3 space-y-1 border-t pt-3">
                  {row.candidates.length === 0 && (
                    <p className="text-muted-foreground px-1 text-[11px] font-medium">
                      Nessuna corrispondenza nel database.
                    </p>
                  )}
                  {row.candidates.map((candidate) => (
                    <button
                      key={candidate.id}
                      type="button"
                      onClick={() => {
                        update(row.key, { food: candidate })
                        setOpenPicker(null)
                      }}
                      className={cn(
                        'flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left',
                        row.food?.id === candidate.id
                          ? 'bg-primary/10'
                          : 'hover:bg-secondary/60',
                      )}
                    >
                      <FoodEmojiTile
                        name={candidate.name}
                        category={candidate.category}
                        size="sm"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-semibold">
                          {candidate.name}
                        </span>
                        <span className="text-muted-foreground block truncate text-[10px] font-medium">
                          {candidate.brand ?? 'Generico'} ·{' '}
                          {fmtKcal(candidate.kcal100)} kcal/100
                          {candidate.isLiquid ? 'ml' : 'g'}
                        </span>
                      </span>
                    </button>
                  ))}

                  {row.estimate && (
                    <button
                      type="button"
                      onClick={() => {
                        update(row.key, { food: null })
                        setOpenPicker(null)
                      }}
                      className={cn(
                        'flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left',
                        row.food === null ? 'bg-primary/10' : 'hover:bg-secondary/60',
                      )}
                    >
                      <span className="bg-secondary flex size-9 shrink-0 items-center justify-center rounded-xl">
                        <Sparkles className="text-primary-strong size-4" strokeWidth={2.4} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-semibold">
                          Usa la stima ({fmtKcal(row.estimate.kcal100)} kcal/100
                          {row.isLiquid ? 'ml' : 'g'})
                        </span>
                        <span className="text-muted-foreground block text-[10px] font-medium">
                          Salvato tra i tuoi alimenti
                        </span>
                      </span>
                    </button>
                  )}

                  <Link
                    to={`/add?day=${day}&meal=${meal}`}
                    className="text-primary-strong block px-2 py-2 text-xs font-semibold"
                  >
                    Cerca un altro alimento →
                  </Link>
                </div>
              )}
            </li>
          )
        })}
      </ul>

      <Link
        to={`/add?day=${day}&meal=${meal}`}
        className="text-muted-foreground border-border/70 mt-2 flex min-h-12 items-center justify-center gap-2 rounded-[22px] border border-dashed text-xs font-semibold"
      >
        <Plus className="size-4" strokeWidth={2.5} />
        Aggiungi quello che manca
      </Link>

      <div className="sticky bottom-0 z-10 -mx-4 mt-4 bg-gradient-to-t from-background via-background to-transparent px-4 pt-7 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {unresolved.length > 0 && (
          <p className="text-muted-foreground mb-2 text-center text-[11px] font-medium">
            {unresolved.length === 1
              ? 'Una voce non ha dati nutrizionali: scegli un alimento oppure rimuovila.'
              : `${unresolved.length} voci non hanno dati nutrizionali: scegli un alimento oppure rimuovile.`}
          </p>
        )}
        <Button
          className="shadow-float h-13 w-full rounded-full text-base font-semibold"
          onClick={handleSave}
          disabled={!canSave || addEntries.isPending}
        >
          <Check className="size-5" />
          Aggiungi {rows.length} a {MEAL_LABELS[meal]} · {fmtKcal(total)} kcal
        </Button>
      </div>
    </div>
  )
}
