import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Check, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { AppShell } from '@/components/layout/app-shell'
import { Panel, PanelHeader } from '@/components/ui/panel'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { useDeleteEntry, useDiary, useUpdateEntry } from '@/hooks/use-diary'
import { todayISO } from '@/lib/date'
import { MEAL_LABELS, MEAL_ORDER, grams, kcal } from '@/lib/format'
import type { Meal } from '@/lib/types'

export default function EntryDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const day = params.get('day') ?? todayISO()

  const { data, isLoading } = useDiary(day)
  const entry = data?.entries.find((e) => e.id === id)

  const updateEntry = useUpdateEntry()
  const deleteEntry = useDeleteEntry()

  const [quantity, setQuantity] = useState('')
  const [meal, setMeal] = useState<Meal>('snack')

  useEffect(() => {
    if (entry) {
      setQuantity(String(entry.quantityG))
      setMeal(entry.meal)
    }
  }, [entry])

  if (isLoading) {
    return (
      <AppShell nav={false}>
        <Skeleton className="h-40 rounded-[28px]" />
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
    updateEntry.mutate(
      { id: entry.id, quantityG: nextGrams, meal },
      {
        onSuccess: () => {
          toast.success('Voce aggiornata')
          navigate(-1)
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
          className="bg-card shadow-soft size-10 rounded-full"
          onClick={() => navigate(-1)}
          aria-label="Torna indietro"
        >
          <ArrowLeft className="size-4" />
        </Button>
        <Button
          variant="secondary"
          size="icon"
          className="bg-card text-destructive shadow-soft size-10 rounded-full"
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
        <h1 className="text-lg leading-tight font-bold">{entry.nameSnapshot}</h1>
        {entry.brandSnapshot ? (
          <p className="text-muted-foreground mt-1 text-xs">
            {entry.brandSnapshot}
          </p>
        ) : null}
      </Panel>

      <Panel className="mt-3">
        <PanelHeader title="Modifica" />
        <div className="mt-3 flex items-center gap-2">
          <Input
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            inputMode="decimal"
            className="h-12 rounded-2xl text-base font-semibold"
            aria-label="Quantità"
          />
          <span className="text-muted-foreground w-8 text-sm">
            {entry.unit ?? 'g'}
          </span>
          <Select value={meal} onValueChange={(v) => setMeal(v as Meal)}>
            <SelectTrigger className="h-12 flex-1 rounded-2xl" aria-label="Pasto">
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

        <dl className="mt-4 grid grid-cols-4 gap-2 text-center">
          <Cell label="kcal" value={kcal(entry.kcal * scale)} />
          <Cell label="carb" value={`${grams(entry.carbsG * scale)} g`} />
          <Cell label="gras" value={`${grams(entry.fatG * scale)} g`} />
          <Cell label="prot" value={`${grams(entry.proteinG * scale)} g`} />
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
    <div className="bg-secondary/60 rounded-2xl py-2">
      <dt className="text-muted-foreground text-[10px] uppercase">{label}</dt>
      <dd className="tabular text-sm font-bold">{value}</dd>
    </div>
  )
}
