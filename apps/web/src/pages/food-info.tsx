import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Barcode, Package, Sparkles } from 'lucide-react'
import { AppShell } from '@/components/layout/app-shell'
import { FoodEmojiTile } from '@/components/food/food-emoji-tile'
import { FoodGallery } from '@/components/food/food-gallery'
import { Panel, PanelHeader } from '@/components/ui/panel'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useFood } from '@/hooks/use-diary'
import { grams, kcal } from '@/lib/format'

export default function FoodInfoPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: food, isLoading } = useFood(id)

  if (isLoading || !food) {
    return (
      <AppShell nav={false}>
        <Skeleton className="h-10 w-24 rounded-full" />
        <Skeleton className="mt-4 h-44 rounded-[28px]" />
        <Skeleton className="mt-3 h-72 rounded-[28px]" />
      </AppShell>
    )
  }

  const source = food.source === 'off' ? 'Open Food Facts' : food.source === 'generic' ? 'Tabelle di composizione' : 'Alimento personale'
  const nutrients: Array<[string, string | null]> = [
    ['Energia', `${kcal(food.kcal100)} kcal`],
    ['Grassi', value(food.fat100)],
    ['di cui saturi', value(food.satFat100)],
    ['Carboidrati', value(food.carbs100)],
    ['di cui zuccheri', value(food.sugars100)],
    ['Proteine', value(food.protein100)],
    ['Fibre', value(food.fiber100)],
    ['Sale', value(food.salt100)],
  ]

  return (
    <AppShell nav={false}>
      <header className="mb-3 flex items-center">
        <Button variant="secondary" size="icon" className="bg-card shadow-soft size-10 rounded-full" onClick={() => navigate(-1)} aria-label="Torna indietro">
          <ArrowLeft className="size-4" />
        </Button>
      </header>

      <Panel>
        <div className="flex items-start gap-3">
          <FoodEmojiTile name={food.name} category={food.category} size="lg" />
          <div className="min-w-0">
            <p className="text-primary-strong text-[11px] font-bold tracking-wide uppercase">Scheda alimento</p>
            <h1 className="mt-1 text-xl leading-tight font-bold tracking-tight">{food.name}</h1>
            <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
              {food.category ?? 'Alimento'}{food.brand ? ` · ${food.brand}` : ''}
            </p>
          </div>
        </div>
      </Panel>

      <Panel className="mt-3">
        <PanelHeader title="Informazioni prodotto" icon={<Package />} />
        <dl className="mt-4 divide-border/70 divide-y text-sm">
          <InfoRow label="Fonte" value={source} />
          {food.packageSizeLabel ? <InfoRow label="Confezione" value={food.packageSizeLabel} /> : null}
          {food.servingLabel ? <InfoRow label="Porzione" value={food.servingLabel} /> : null}
          {food.barcode ? <InfoRow label="Codice a barre" value={food.barcode} tabular /> : null}
        </dl>
      </Panel>

      <Panel className="mt-3">
        <PanelHeader title={`Dichiarazione nutrizionale · 100 ${food.unit}`} icon={<Sparkles />} />
        <dl className="mt-4 divide-border/70 divide-y text-sm">
          {nutrients.flatMap(([label, amount]) => amount == null ? [] : [
            <InfoRow key={label} label={label} value={amount} muted={label.startsWith('di cui')} />,
          ])}
        </dl>
      </Panel>

      {food.barcode ? (
        <p className="text-muted-foreground mt-3 flex items-center justify-center gap-1.5 text-[11px]">
          <Barcode className="size-3.5" /> Dati forniti da {source}
        </p>
      ) : null}

      <FoodGallery foodId={food.id} name={food.name} images={food.images ?? []} uploadEnabled={food.imageUploadEnabled} />
    </AppShell>
  )
}

function value(amount: number | null) {
  return amount == null ? null : `${grams(amount)} g`
}

function InfoRow({ label, value, muted = false, tabular = false }: { label: string; value: string; muted?: boolean; tabular?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5 first:pt-0 last:pb-0">
      <dt className={muted ? 'text-muted-foreground pl-3 text-xs' : ''}>{label}</dt>
      <dd className={`${tabular ? 'tabular' : ''} shrink-0 text-right font-semibold`}>{value}</dd>
    </div>
  )
}
