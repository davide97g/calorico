import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Check, ChevronRight, Info, Star } from 'lucide-react'
import { toast } from 'sonner'
import { AppShell } from '@/components/layout/app-shell'
import { MacroDonut } from '@/components/charts/macro-donut'
import { FoodEmojiTile } from '@/components/food/food-emoji-tile'
import { FoodGallery } from '@/components/food/food-gallery'
import { Panel, PanelHeader } from '@/components/ui/panel'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useAddEntry, useFood, useToggleFavorite } from '@/hooks/use-diary'
import { todayISO } from '@/lib/date'
import { MEAL_LABELS, MEAL_ORDER, currentMeal, grams, kcal } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Meal } from '@/lib/types'

export default function FoodDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const day = params.get('day') ?? todayISO()

  const { data: food, isLoading } = useFood(id)
  const addEntry = useAddEntry()
  const toggleFavorite = useToggleFavorite()

  const [meal, setMeal] = useState<Meal>(
    (params.get('meal') as Meal | null) ?? currentMeal(),
  )
  // Default portion: the pack's serving size when it has one, else 100 g.
  const defaultQuantity = food?.servingSizeG ?? 100
  const [quantity, setQuantity] = useState<string | null>(null)
  // The field shows the real default rather than hiding it in a placeholder —
  // an empty-looking input while the values below compute on 100 g is a lie.
  const quantityValue = quantity ?? String(defaultQuantity)
  const grams_ = Number(quantityValue.replace(',', '.')) || 0

  const macros = useMemo(() => {
    if (!food) return null
    const f = grams_ / 100
    return {
      kcal: food.kcal100 * f,
      proteinG: food.protein100 * f,
      carbsG: food.carbs100 * f,
      fatG: food.fat100 * f,
      fiberG: food.fiber100 == null ? null : food.fiber100 * f,
      sugarsG: food.sugars100 == null ? null : food.sugars100 * f,
      satFatG: food.satFat100 == null ? null : food.satFat100 * f,
      saltG: food.salt100 == null ? null : food.salt100 * f,
    }
  }, [food, grams_])

  const quickPortions = useMemo(() => {
    if (!food) return []
    const options = new Set<number>([100])
    if (food.servingSizeG) options.add(food.servingSizeG)
    if (food.isLiquid) {
      options.add(200)
      options.add(250)
    } else {
      options.add(50)
      options.add(150)
    }
    return [...options].sort((a, b) => a - b)
  }, [food])

  const handleSave = () => {
    if (!food) return
    addEntry.mutate(
      { foodId: food.id, day, meal, quantityG: grams_ },
      {
        onSuccess: () => {
          toast.success(`${food.name} aggiunto a ${MEAL_LABELS[meal]}`)
          navigate('/', { replace: true })
        },
        onError: () => toast.error('Non è stato possibile salvare la voce'),
      },
    )
  }

  if (isLoading || !food || !macros) {
    return (
      <AppShell nav={false}>
        <Skeleton className="h-10 w-24 rounded-full" />
        <Skeleton className="mt-4 h-40 rounded-[28px]" />
        <Skeleton className="mt-3 h-56 rounded-[28px]" />
      </AppShell>
    )
  }

  return (
    <AppShell nav={false}>
      <header className="mb-3 flex items-center justify-between">
        <Button
          variant="secondary"
          size="icon"
          className="bg-card shadow-soft size-10 rounded-full"
          onClick={() => navigate(-1)}
          aria-label="Torna indietro"
        >
          <ArrowLeft className="size-4" />
        </Button>
        <Button
          variant="secondary"
          size="icon"
          className="bg-card shadow-soft size-10 rounded-full"
          onClick={() =>
            toggleFavorite.mutate({ id: food.id, next: !food.isFavorite })
          }
          aria-label={
            food.isFavorite ? 'Rimuovi dai preferiti' : 'Aggiungi ai preferiti'
          }
        >
          <Star
            className={cn(
              'size-4',
              // Lime fill, darker green outline: the light lime alone is
              // invisible against a white card.
              food.isFavorite && 'fill-primary text-primary-strong',
            )}
          />
        </Button>
      </header>

      <Panel>
        <div className="flex items-start gap-3">
          <FoodEmojiTile
            name={food.name}
            category={food.category}
            size="lg"
          />
          <div className="min-w-0">
            <h1 className="text-lg leading-tight font-bold">{food.name}</h1>
            <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
              {food.category ?? 'Alimento'}
              {food.brand ? ` · ${food.brand}` : ''}
            </p>
          </div>
        </div>
        <Link
          to={`/food/${food.id}/info`}
          className="bg-secondary/70 mt-4 flex h-11 items-center justify-between rounded-2xl px-3 text-xs font-semibold transition-colors active:scale-[0.98]"
        >
          <span className="flex items-center gap-2">
            <Info className="text-primary-strong size-4" />
            Vedi tutti i dati
          </span>
          <ChevronRight className="text-muted-foreground size-4" />
        </Link>
      </Panel>

      <Panel className="mt-3">
        <PanelHeader title="Quantità" />

        {/* One control per row: a number field, a unit and a meal picker
            crammed into one 375 px line was three unrelated jobs. */}
        <div className="mt-3 flex items-center gap-2">
          <div className="relative flex-1">
            <Input
              value={quantityValue}
              onChange={(e) => setQuantity(e.target.value)}
              onFocus={(e) => e.currentTarget.select()}
              inputMode="decimal"
              className="h-13 rounded-2xl pr-12 text-base font-bold"
              aria-label={`Quantità in ${food.unit}`}
            />
            <span className="text-muted-foreground pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-sm font-semibold">
              {food.unit}
            </span>
          </div>
        </div>

        <div className="mt-2 flex flex-wrap gap-2">
          {quickPortions.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setQuantity(String(p))}
              className={cn(
                'h-11 rounded-full px-4 text-xs font-semibold transition-colors',
                grams_ === p
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-secondary-foreground',
              )}
            >
              {p} {food.unit}
              {food.servingSizeG === p && food.servingLabel
                ? ' · porzione'
                : ''}
            </button>
          ))}
        </div>

        {food.packageSizeG ? (
          <p className="text-muted-foreground mt-3 px-1 text-xs">
            {grams(grams_)} {food.unit} su {food.packageSizeLabel ?? `${grams(food.packageSizeG)} ${food.unit}`}
            <span className="ml-1 tabular">
              · {Math.min(100, Math.round((grams_ / food.packageSizeG) * 100))}% confezione
            </span>
          </p>
        ) : null}

        <div className="mt-3">
          <label
            className="text-muted-foreground mb-1.5 block px-1 text-[11px] font-semibold"
            htmlFor="meal-select"
          >
            Pasto
          </label>
          <Select value={meal} onValueChange={(v) => setMeal(v as Meal)}>
            <SelectTrigger
              id="meal-select"
              className="h-13 w-full rounded-2xl font-semibold"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="rounded-2xl">
              {MEAL_ORDER.map((m) => (
                <SelectItem key={m} value={m}>
                  {MEAL_LABELS[m]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Panel>

      <Panel className="mt-3">
        <PanelHeader title={`Valori per ${grams(grams_)} ${food.unit}`} />

        <div className="mt-4 grid grid-cols-[auto_1fr] items-center gap-4">
          <MacroDonut carbsG={macros.carbsG} fatG={macros.fatG} proteinG={macros.proteinG} size={108} />
          <div>
            <p className="text-muted-foreground text-[11px] font-semibold tracking-wide uppercase">Energia</p>
            <p className="font-display tabular mt-1 text-[38px] leading-none font-extrabold tracking-tight">
              {kcal(macros.kcal)}
              <span className="text-muted-foreground ml-1 text-sm font-semibold">kcal</span>
            </p>
            <dl className="mt-3 grid grid-cols-3 gap-2">
              <MacroCell label="Carboidrati" value={macros.carbsG} accent="carbs" />
              <MacroCell label="Grassi" value={macros.fatG} accent="fat" />
              <MacroCell label="Proteine" value={macros.proteinG} accent="protein" />
            </dl>
          </div>
        </div>
        <dl className="border-border/70 mt-4 grid grid-cols-2 gap-x-5 gap-y-2 border-t pt-3 text-xs">
          <NutrientRow label="Zuccheri" value={macros.sugarsG} muted />
          <NutrientRow label="Saturi" value={macros.satFatG} muted />
          <NutrientRow label="Fibre" value={macros.fiberG} muted />
          <NutrientRow label="Sale" value={macros.saltG} muted />
        </dl>
      </Panel>

      <FoodGallery foodId={food.id} name={food.name} images={food.images ?? []} />

      <div className="sticky bottom-0 z-10 -mx-4 mt-4 bg-gradient-to-t from-background via-background to-transparent px-4 pt-7 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <Button
          className="shadow-float h-13 w-full rounded-full text-base font-semibold"
          onClick={handleSave}
          disabled={addEntry.isPending || grams_ <= 0}
        >
          <Check className="size-5" />
          Aggiungi a {MEAL_LABELS[meal]}
        </Button>
      </div>
    </AppShell>
  )
}

function MacroCell({ label, value, accent }: { label: string; value: number; accent: 'carbs' | 'fat' | 'protein' }) {
  const dot = { carbs: 'bg-carbs', fat: 'bg-fat', protein: 'bg-protein' }
  return (
    <div className="bg-secondary/65 min-w-0 rounded-xl px-2 py-2">
      <dt className="text-muted-foreground flex items-center gap-1 text-[9px] leading-none font-medium">
        <span className={cn('size-1.5 shrink-0 rounded-full', dot[accent])} />
        <span className="truncate">{label}</span>
      </dt>
      <dd className="tabular mt-1 text-sm leading-none font-bold">{grams(value)} g</dd>
    </div>
  )
}

function NutrientRow({
  label,
  value,
  accent,
  muted,
}: {
  label: string
  value: number | null
  accent?: 'carbs' | 'fat' | 'protein'
  muted?: boolean
}) {
  if (value == null) return null
  // Tailwind only sees literal class names, so keep the mapping explicit.
  const dot = {
    carbs: 'bg-carbs',
    fat: 'bg-fat',
    protein: 'bg-protein',
  }
  return (
    <div className="flex items-center gap-2">
      {accent ? (
        <span className={cn('size-2 rounded-full', dot[accent])} aria-hidden />
      ) : (
        <span className="size-2" aria-hidden />
      )}
      <dt className={muted ? 'text-muted-foreground' : ''}>{label}</dt>
      <dd
        className={cn(
          'tabular ml-auto font-semibold',
          muted && 'text-muted-foreground font-normal',
        )}
      >
        {grams(value)} g
      </dd>
    </div>
  )
}
