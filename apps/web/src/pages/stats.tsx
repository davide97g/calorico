import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Flame, Info, PieChart } from 'lucide-react'
import { AppShell } from '@/components/layout/app-shell'
import { WeeklyBars } from '@/components/charts/weekly-bars'
import { MacroDonut, MacroLegend } from '@/components/charts/macro-donut'
import { Panel, PanelHeader } from '@/components/ui/panel'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useStats } from '@/hooks/use-diary'
import { lastNDays, longDayLabel, todayISO } from '@/lib/date'
import { kcal } from '@/lib/format'

const RANGES = [
  { key: '7', label: '7 giorni', days: 7 },
  { key: '14', label: '14 giorni', days: 14 },
  { key: '30', label: '30 giorni', days: 30 },
] as const

export default function StatsPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [range, setRange] = useState<'7' | '14' | '30'>('7')
  const [selectedDay, setSelectedDay] = useState(params.get('day') ?? todayISO())

  const days = RANGES.find((r) => r.key === range)!.days
  const { from, to } = useMemo(() => lastNDays(days), [days])
  const { data, isLoading } = useStats(from, to)

  const selected =
    data?.days.find((d) => d.day === selectedDay) ?? data?.days.at(-1)
  const targets = data?.targets

  const bandWidth = targets
    ? ((targets.kcalMax - targets.kcalMin) / (targets.kcalMax * 1.15)) * 100
    : 0
  const bandStart = targets
    ? (targets.kcalMin / (targets.kcalMax * 1.15)) * 100
    : 0
  const consumedWidth =
    selected && targets
      ? Math.min(100, (selected.kcal / (targets.kcalMax * 1.15)) * 100)
      : 0

  return (
    <AppShell>
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
        <h1 className="text-[17px] font-bold">Statistiche</h1>
        <div className="size-10" />
      </header>

      <Tabs
        value={range}
        onValueChange={(v) => setRange(v as typeof range)}
        className="mb-3"
      >
        <TabsList className="bg-card shadow-soft h-9 w-full rounded-full p-1">
          {RANGES.map((r) => (
            <TabsTrigger
              key={r.key}
              value={r.key}
              className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-full text-xs data-[state=active]:shadow-none"
            >
              {r.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {isLoading || !data ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-[200px] rounded-[28px]" />
          <Skeleton className="h-[160px] rounded-[28px]" />
          <Skeleton className="h-[200px] rounded-[28px]" />
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <Panel className="pt-3">
            <WeeklyBars
              days={data.days}
              target={targets?.kcal ?? 2000}
              selectedDay={selected?.day ?? selectedDay}
              onSelectDay={setSelectedDay}
            />
          </Panel>

          <Panel>
            <PanelHeader icon={<Flame />} title="Calorie" />
            <p className="text-muted-foreground mt-2 text-xs">
              {selected ? longDayLabel(selected.day) : ''}
            </p>
            <p className="tabular mt-1 text-[28px] leading-none font-extrabold">
              {kcal(selected?.kcal ?? 0)} kcal
            </p>
            <p className="text-muted-foreground mt-1 text-xs">
              Obiettivo: {kcal(targets?.kcal ?? 0)} kcal
            </p>

            {/* Progress bar with the acceptable band drawn behind it. */}
            <div className="bg-secondary relative mt-4 h-3 overflow-hidden rounded-full">
              <div
                className="bg-ring-track absolute inset-y-0"
                style={{ left: `${bandStart}%`, width: `${bandWidth}%` }}
              />
              <div
                className="bg-primary absolute inset-y-0 left-0 rounded-full transition-[width] duration-700"
                style={{ width: `${consumedWidth}%` }}
              />
            </div>
            <div className="text-muted-foreground mt-2 flex items-center justify-between text-[11px]">
              <span>0</span>
              <span className="flex items-center gap-1.5">
                <span className="bg-ring-track inline-block size-2.5 rounded-[3px]" />
                Intervallo obiettivo {targets?.kcalMin}-{targets?.kcalMax}
              </span>
              <span>{Math.round((targets?.kcalMax ?? 0) * 1.15)}</span>
            </div>
          </Panel>

          <Panel>
            <PanelHeader icon={<PieChart />} title="Ripartizione nutrienti" />
            <div className="mt-4 grid grid-cols-[1fr_1fr_auto] items-start gap-3">
              <figure className="flex flex-col items-center gap-2">
                <MacroDonut
                  carbsG={targets?.carbsG ?? 0}
                  fatG={targets?.fatG ?? 0}
                  proteinG={targets?.proteinG ?? 0}
                  size={92}
                />
                <figcaption className="text-muted-foreground flex items-center gap-1 text-[11px]">
                  Consigliato <Info className="size-3" />
                </figcaption>
              </figure>

              <figure className="flex flex-col items-center gap-2">
                <MacroDonut
                  carbsG={selected?.carbsG ?? 0}
                  fatG={selected?.fatG ?? 0}
                  proteinG={selected?.proteinG ?? 0}
                  size={92}
                />
                <figcaption className="text-muted-foreground text-[11px]">
                  Effettivo
                </figcaption>
              </figure>

              <div className="pt-1">
                <MacroLegend
                  carbsG={selected?.carbsG ?? 0}
                  fatG={selected?.fatG ?? 0}
                  proteinG={selected?.proteinG ?? 0}
                />
              </div>
            </div>
          </Panel>

          <Panel>
            <PanelHeader title="Media del periodo" />
            <dl className="mt-3 grid grid-cols-2 gap-3">
              <SummaryStat
                label="Calorie / giorno"
                value={`${kcal(data.summary.avgKcal)} kcal`}
              />
              <SummaryStat
                label="Giorni registrati"
                value={`${data.summary.loggedDays} / ${data.days.length}`}
              />
              <SummaryStat
                label="Nel target"
                value={`${data.summary.daysInRange} giorni`}
              />
              <SummaryStat
                label="Proteine / giorno"
                value={`${data.summary.avgProteinG} g`}
              />
            </dl>
          </Panel>
        </div>
      )}
    </AppShell>
  )
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-secondary/60 rounded-2xl p-3">
      <dt className="text-muted-foreground text-[11px]">{label}</dt>
      <dd className="tabular mt-1 text-base font-bold">{value}</dd>
    </div>
  )
}
