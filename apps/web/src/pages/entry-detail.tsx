import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Check, Info, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { AppShell } from '@/components/layout/app-shell'
import { FoodEmojiTile } from '@/components/food/food-emoji-tile'
import { FoodGallery } from '@/components/food/food-gallery'
import { PortionChips, portionOptions } from '@/components/food/portion-chips'
import { Panel, PanelHeader } from '@/components/ui/panel'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { WhenBar } from '@/components/food/when-picker'
import type { When } from '@/lib/when'
import { useDeleteEntry, useDiary, useUpdateEntry } from '@/hooks/use-diary'
import { useFoodPortions } from '@/hooks/use-foods'
import { todayISO } from '@/lib/date'
import { grams, kcal } from '@/lib/format'

export default function EntryDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const day = params.get('day') ?? todayISO()

  const { data, isLoading } = useDiary(day)
  const entry = data?.entries.find((e) => e.id === id)
  // A snapshot-only entry — its food was deleted — has no history to offer.
  const { data: portions } = useFoodPortions(entry?.foodId)

  const updateEntry = useUpdateEntry()
  const deleteEntry = useDeleteEntry()

  const [quantity, setQuantity] = useState('')
  const [when, setWhen] = useState<When>({ day, meal: 'snack' })

  useEffect(() => {
    if (entry) {
      setQuantity(String(entry.quantityG))
      setWhen({ day: entry.day, meal: entry.meal })
    }
  }, [entry])

  if (isLoading) {
    return (
      <AppShell nav={false}>
        <Skeleton className="h-40 rounded-lg" />
      </AppShell>
    )
  }

  if (!entry) {
    return (
      <AppShell nav={false}>
        <p className="text-muted-foreground py-12 text-center text-sm">
          Voce non trovata.
        </p>
        <Button className="w-full rounded-full" onClick={() => navigate('/')}>
          Torna al diario
        </Button>
      </AppShell>
    )
  }

  const nextGrams = Number(quantity.replace(',', '.')) || entry.quantityG
  const scale = nextGrams / entry.quantityG

  const handleSave = () => {
    const moved = when.day !== entry.day
    updateEntry.mutate(
      { id: entry.id, quantityG: nextGrams, meal: when.meal, day: when.day },
      {
        onSuccess: () => {
          toast.success(moved ? 'Voce spostata' : 'Voce aggiornata')
          // The screen behind this one is showing the day the entry just left.
          if (moved) navigate(`/?day=${when.day}`, { replace: true })
          else navigate(-1)
        },
        onError: () => toast.error('Aggiornamento non riuscito'),
      },
    )
  }

  return (
    <AppShell nav={false}>
      <header className="mb-3 flex items-center justify-between">
        <Button
          variant="secondary"
          size="icon"
          className="bg-card shadow-soft size-11 rounded-full"
          onClick={() => navigate(-1)}
          aria-label="Torna indietro"
        >
          <ArrowLeft className="size-4" />
        </Button>
        <Button
          variant="secondary"
          size="icon"
          className="bg-card text-destructive shadow-soft size-11 rounded-full"
          onClick={() =>
            deleteEntry.mutate(
              { id: entry.id, day },
              {
                onSuccess: () => {
                  toast.success('Voce rimossa')
                  navigate(-1)
                },
              },
            )
          }
          aria-label="Rimuovi voce"
        >
          <Trash2 className="size-4" />
        </Button>
      </header>

      <Panel>
        <div className="flex items-start gap-3">
          <FoodEmojiTile name={entry.nameSnapshot} size="lg" />
          <div className="min-w-0">
            <h1 className="text-lg leading-tight font-bold">
              {entry.nameSnapshot}
            </h1>
            {entry.brandSnapshot ? (
              <p className="text-muted-foreground mt-1 text-xs">
                {entry.brandSnapshot}
              </p>
            ) : null}
          </div>
        </div>
        {entry.foodId ? (
          <Button
            variant="secondary"
            className="mt-4 h-10 w-full rounded-md text-xs font-semibold"
            onClick={() => navigate(`/food/${entry.foodId}/info`)}
          >
            <Info className="size-4" />
            Vedi tutti i dati alimento
          </Button>
        ) : null}
      </Panel>

      <FoodGallery foodId={entry.foodId} name={entry.nameSnapshot} />

      <Panel className="mt-3">
        <PanelHeader title="Modifica" />
        <div className="relative mt-3">
          <Input
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            onFocus={(e) => e.currentTarget.select()}
            inputMode="decimal"
            className="h-13 rounded-md pr-12 text-base font-bold"
            aria-label={`Quantità in ${entry.unit ?? 'g'}`}
          />
          <span className="text-muted-foreground pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-sm font-semibold">
            {entry.unit ?? 'g'}
          </span>
        </div>

        {/* Same portions as the food screen offers: the common edit is "actually
            it was the usual amount", not an arbitrary new number. */}
        <PortionChips
          className="mt-2"
          options={portionOptions({}, portions)}
          value={nextGrams}
          unit={entry.unit ?? 'g'}
          onSelect={(next) => setQuantity(String(next))}
        />

        <WhenBar
          value={when}
          onChange={setWhen}
          variant="inset"
          className="mt-2"
        />

        {/* Spelled out, as everywhere else in the app: "carb / gras / prot" was
            three abbreviations this product uses nowhere. */}
        <dl className="mt-4 grid grid-cols-2 gap-2">
          <Cell label="Energia" value={`${kcal(entry.kcal * scale)} kcal`} />
          <Cell
            label="Carboidrati"
            value={`${grams(entry.carbsG * scale)} g`}
          />
          <Cell label="Grassi" value={`${grams(entry.fatG * scale)} g`} />
          <Cell label="Proteine" value={`${grams(entry.proteinG * scale)} g`} />
        </dl>
      </Panel>

      <Button
        className="mt-4 h-13 w-full rounded-full text-base font-semibold"
        onClick={handleSave}
        disabled={updateEntry.isPending}
      >
        <Check className="size-5" />
        Salva
      </Button>
    </AppShell>
  )
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-secondary/60 rounded-md px-3 py-2">
      <dt className="text-muted-foreground text-micro font-medium">{label}</dt>
      <dd className="tabular mt-0.5 text-sm font-bold">{value}</dd>
    </div>
  )
}
