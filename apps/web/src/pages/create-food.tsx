import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Check } from 'lucide-react'
import { toast } from 'sonner'
import { AppShell } from '@/components/layout/app-shell'
import { Panel, PanelHeader } from '@/components/ui/panel'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useCreateFood } from '@/hooks/use-diary'
import { todayISO } from '@/lib/date'
import { currentMeal } from '@/lib/format'

const numeric = (v: string) => {
  const n = Number(v.replace(',', '.'))
  return Number.isFinite(n) && n >= 0 ? n : 0
}

export default function CreateFoodPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const day = params.get('day') ?? todayISO()
  const meal = params.get('meal') ?? currentMeal()

  const createFood = useCreateFood()

  const [form, setForm] = useState({
    name: params.get('name') ?? '',
    brand: '',
    kcal100: '',
    protein100: '',
    carbs100: '',
    fat100: '',
    fiber100: '',
    sugars100: '',
    satFat100: '',
    salt100: '',
    servingSizeG: '',
    isLiquid: false,
  })

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  const kcalValue = numeric(form.kcal100)
  const valid = form.name.trim().length >= 2 && kcalValue > 0 && kcalValue <= 950

  const handleSubmit = () => {
    createFood.mutate(
      {
        name: form.name.trim(),
        brand: form.brand.trim() || undefined,
        kcal100: kcalValue,
        protein100: numeric(form.protein100),
        carbs100: numeric(form.carbs100),
        fat100: numeric(form.fat100),
        fiber100: form.fiber100 ? numeric(form.fiber100) : undefined,
        sugars100: form.sugars100 ? numeric(form.sugars100) : undefined,
        satFat100: form.satFat100 ? numeric(form.satFat100) : undefined,
        salt100: form.salt100 ? numeric(form.salt100) : undefined,
        servingSizeG: form.servingSizeG
          ? numeric(form.servingSizeG)
          : undefined,
        isLiquid: form.isLiquid,
      },
      {
        onSuccess: (food) => {
          toast.success('Alimento creato')
          navigate(`/food/${food.id}?day=${day}&meal=${meal}`, {
            replace: true,
          })
        },
        onError: () => toast.error('Creazione non riuscita'),
      },
    )
  }

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
        <h1 className="text-lg font-bold">Nuovo alimento</h1>
      </header>

      <Panel>
        <PanelHeader title="Descrizione" />
        <div className="mt-3 flex flex-col gap-3">
          <Field label="Nome">
            <Input
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="Insalata di riso della nonna"
              className="h-11 rounded-md"
            />
          </Field>
          <Field label="Marca (facoltativo)">
            <Input
              value={form.brand}
              onChange={(e) => set('brand', e.target.value)}
              className="h-11 rounded-md"
            />
          </Field>
          <div className="flex items-center justify-between">
            <Label htmlFor="liquid" className="text-sm font-normal">
              È una bevanda (valori per 100 ml)
            </Label>
            <Switch
              id="liquid"
              checked={form.isLiquid}
              onCheckedChange={(v) => set('isLiquid', v)}
            />
          </div>
        </div>
      </Panel>

      <Panel className="mt-3">
        <PanelHeader
          title={`Valori per 100 ${form.isLiquid ? 'ml' : 'g'}`}
        />
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Field label="Calorie (kcal)">
            <Input
              value={form.kcal100}
              onChange={(e) => set('kcal100', e.target.value)}
              inputMode="decimal"
              className="h-11 rounded-md"
            />
          </Field>
          <Field label="Proteine (g)">
            <Input
              value={form.protein100}
              onChange={(e) => set('protein100', e.target.value)}
              inputMode="decimal"
              className="h-11 rounded-md"
            />
          </Field>
          <Field label="Carboidrati (g)">
            <Input
              value={form.carbs100}
              onChange={(e) => set('carbs100', e.target.value)}
              inputMode="decimal"
              className="h-11 rounded-md"
            />
          </Field>
          <Field label="Grassi (g)">
            <Input
              value={form.fat100}
              onChange={(e) => set('fat100', e.target.value)}
              inputMode="decimal"
              className="h-11 rounded-md"
            />
          </Field>
          <Field label="Fibre (g)">
            <Input
              value={form.fiber100}
              onChange={(e) => set('fiber100', e.target.value)}
              inputMode="decimal"
              className="h-11 rounded-md"
            />
          </Field>
          <Field label="Zuccheri (g)">
            <Input
              value={form.sugars100}
              onChange={(e) => set('sugars100', e.target.value)}
              inputMode="decimal"
              className="h-11 rounded-md"
            />
          </Field>
          <Field label="Grassi saturi (g)">
            <Input
              value={form.satFat100}
              onChange={(e) => set('satFat100', e.target.value)}
              inputMode="decimal"
              className="h-11 rounded-md"
            />
          </Field>
          <Field label="Sale (g)">
            <Input
              value={form.salt100}
              onChange={(e) => set('salt100', e.target.value)}
              inputMode="decimal"
              className="h-11 rounded-md"
            />
          </Field>
          <Field label="Porzione (g)">
            <Input
              value={form.servingSizeG}
              onChange={(e) => set('servingSizeG', e.target.value)}
              inputMode="decimal"
              className="h-11 rounded-md"
            />
          </Field>
        </div>
      </Panel>

      <Button
        className="mt-4 h-13 w-full rounded-full text-base font-semibold"
        onClick={handleSubmit}
        disabled={!valid || createFood.isPending}
      >
        <Check className="size-5" />
        Crea e continua
      </Button>
    </AppShell>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-muted-foreground text-xs font-medium">{label}</span>
      {children}
    </label>
  )
}
