import { useState } from 'react'
import { Scale, TrendingDown, TrendingUp } from 'lucide-react'
import { toast } from 'sonner'
import { AppShell } from '@/components/layout/app-shell'
import { TopBar } from '@/components/layout/top-bar'
import { WeightChart } from '@/components/charts/weight-chart'
import { Panel, PanelHeader } from '@/components/ui/panel'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { useLogWeight, useWeight } from '@/hooks/use-diary'
import { longDayLabel, todayISO } from '@/lib/date'
import { signed } from '@/lib/format'

export default function WeightPage() {
  const { data, isLoading } = useWeight()
  const logWeight = useLogWeight()
  const [value, setValue] = useState('')

  const handleSave = () => {
    const weightKg = Number(value.replace(',', '.'))
    if (!Number.isFinite(weightKg) || weightKg < 25 || weightKg > 400) {
      toast.error('Inserisci un peso valido')
      return
    }
    logWeight.mutate(
      { day: todayISO(), weightKg },
      {
        onSuccess: () => {
          toast.success('Peso registrato')
          setValue('')
        },
        onError: () => toast.error('Salvataggio non riuscito'),
      },
    )
  }

  const toGoal =
    data?.latest && data.targetWeightKg
      ? Math.round((data.latest.weightKg - data.targetWeightKg) * 10) / 10
      : null

  return (
    <AppShell>
      <TopBar title="Peso" back />

      {isLoading || !data ? (
        <Skeleton className="h-64 rounded-lg" />
      ) : (
        <div className="flex flex-col gap-3">
          <Panel className="bg-primary text-primary-foreground">
            <div className="flex items-center gap-2">
              <span className="bg-primary-foreground/12 flex size-8 items-center justify-center rounded-full">
                <Scale className="size-4" />
              </span>
              <h2 className="text-base font-semibold">Peso attuale</h2>
            </div>
            <div className="mt-3 flex items-end justify-between">
              <p className="tabular text-display leading-none font-extrabold">
                {data.latest ? data.latest.weightKg : '—'}
                <span className="ml-1 text-base font-semibold">kg</span>
              </p>
              {data.items.length > 1 ? (
                <p className="flex items-center gap-1 text-sm font-semibold">
                  {data.changeKg <= 0 ? (
                    <TrendingDown className="size-4" />
                  ) : (
                    <TrendingUp className="size-4" />
                  )}
                  <span className="tabular">{signed(data.changeKg)} kg</span>
                </p>
              ) : null}
            </div>
            <p className="text-primary-foreground/75 mt-2 text-xs">
              {data.latest
                ? `Ultima pesata: ${longDayLabel(data.latest.day)}`
                : 'Nessuna pesata registrata'}
              {data.bmi ? ` · BMI ${data.bmi}` : ''}
            </p>
          </Panel>

          <Panel>
            <PanelHeader title="Registra oggi" />
            <div className="mt-3 flex gap-2">
              <Input
                value={value}
                onChange={(e) => setValue(e.target.value)}
                inputMode="decimal"
                placeholder={data.latest ? String(data.latest.weightKg) : '75,0'}
                className="h-12 rounded-md text-base font-semibold"
                aria-label="Peso in kg"
              />
              <Button
                className="h-12 rounded-md px-6"
                onClick={handleSave}
                disabled={logWeight.isPending}
              >
                Salva
              </Button>
            </div>
          </Panel>

          <Panel>
            <PanelHeader title="Andamento" />
            <WeightChart
              items={data.items}
              targetWeightKg={data.targetWeightKg}
            />
          </Panel>

          <Panel>
            <dl className="grid grid-cols-3 gap-2 text-center">
              <Metric
                label="Iniziale"
                value={data.startWeightKg ? `${data.startWeightKg} kg` : '—'}
              />
              <Metric
                label="Obiettivo"
                value={data.targetWeightKg ? `${data.targetWeightKg} kg` : '—'}
              />
              <Metric
                label="Mancano"
                value={toGoal == null ? '—' : `${Math.abs(toGoal)} kg`}
              />
            </dl>
          </Panel>
        </div>
      )}
    </AppShell>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-secondary/60 rounded-md py-3">
      <dt className="text-muted-foreground text-micro">{label}</dt>
      <dd className="tabular mt-0.5 text-sm font-bold">{value}</dd>
    </div>
  )
}
