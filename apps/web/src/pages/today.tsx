import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { PieChart, Scale, TrendingDown, TrendingUp } from 'lucide-react'
import { toast } from 'sonner'
import { AppShell } from '@/components/layout/app-shell'
import { DailyIntakeCard } from '@/components/dashboard/daily-intake-card'
import { DaySwitcher } from '@/components/dashboard/day-switcher'
import { MealSection } from '@/components/dashboard/meal-section'
import { MacroBars } from '@/components/charts/macro-bars'
import { Panel, PanelHeader } from '@/components/ui/panel'
import { Skeleton } from '@/components/ui/skeleton'
import {
  useCopyDay,
  useDeleteEntry,
  useDiary,
  useWeight,
} from '@/hooks/use-diary'
import { useAuth } from '@/hooks/use-auth'
import { addDaysISO, todayISO } from '@/lib/date'
import { MEAL_ORDER, kcal, signed } from '@/lib/format'
import type { DiaryEntry } from '@/lib/types'

export default function TodayPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [day, setDay] = useState(todayISO())

  const { data, isLoading } = useDiary(day)
  const { data: weight } = useWeight()
  const deleteEntry = useDeleteEntry()
  const copyDay = useCopyDay()

  const targets = data?.targets
  const totals = data?.totals

  const handleDelete = (entry: DiaryEntry) => {
    deleteEntry.mutate(
      { id: entry.id, day },
      {
        onSuccess: () => toast.success(`${entry.nameSnapshot} rimosso`),
        onError: () => toast.error('Non è stato possibile rimuovere la voce'),
      },
    )
  }

  const handleCopyYesterday = () => {
    copyDay.mutate(
      { from: addDaysISO(day, -1), to: day },
      {
        onSuccess: (res) =>
          res.copied > 0
            ? toast.success(`${res.copied} voci copiate`)
            : toast.info('Il giorno precedente è vuoto'),
        onError: () => toast.error('Copia non riuscita'),
      },
    )
  }

  return (
    <AppShell>
      <header className="mb-4 text-center">
        <h1 className="text-[26px] leading-none font-extrabold tracking-tight">
          Calorico
        </h1>
        <p className="text-muted-foreground mt-1.5 text-xs">
          Ciao {user?.name ?? ''}, ecco la tua giornata
        </p>
      </header>

      <DaySwitcher
        day={day}
        onChange={setDay}
        onCopyYesterday={handleCopyYesterday}
        onOpenWeight={() => navigate('/weight')}
      />

      <div className="mt-3 flex flex-col gap-3">
        {isLoading || !targets || !totals ? (
          <>
            <Skeleton className="h-[148px] rounded-[28px]" />
            <Skeleton className="h-[168px] rounded-[28px]" />
          </>
        ) : (
          <>
            <DailyIntakeCard consumed={totals.kcal} target={targets.kcal} />

            <Panel>
              <PanelHeader
                icon={<PieChart />}
                title="Nutrienti"
                to={`/stats?day=${day}`}
              />
              <div className="mt-3">
                <MacroBars
                  carbs={{ value: totals.carbsG, target: targets.carbsG }}
                  fat={{ value: totals.fatG, target: targets.fatG }}
                  protein={{ value: totals.proteinG, target: targets.proteinG }}
                />
              </div>
              {totals.fiberG > 0 ? (
                <p className="text-muted-foreground mt-3 text-xs">
                  Fibre: <span className="tabular font-semibold">{totals.fiberG} g</span>
                </p>
              ) : null}
            </Panel>

            <Panel>
              <PanelHeader icon={<Scale />} title="Peso" to="/weight" />
              <div className="mt-3 flex items-end justify-between">
                <div>
                  <p className="tabular text-2xl leading-none font-bold">
                    {weight?.latest ? `${weight.latest.weightKg} kg` : '—'}
                  </p>
                  {weight?.bmi ? (
                    <p className="text-muted-foreground mt-1 text-xs">
                      BMI {weight.bmi}
                    </p>
                  ) : null}
                </div>
                {weight && weight.items.length > 1 ? (
                  <p
                    className={`flex items-center gap-1 text-sm font-semibold ${
                      weight.changeKg <= 0 ? 'text-primary' : 'text-destructive'
                    }`}
                  >
                    {weight.changeKg <= 0 ? (
                      <TrendingDown className="size-4" />
                    ) : (
                      <TrendingUp className="size-4" />
                    )}
                    <span className="tabular">{signed(weight.changeKg)} kg</span>
                  </p>
                ) : (
                  <Link to="/weight" className="text-primary text-sm font-semibold">
                    Registra
                  </Link>
                )}
              </div>
            </Panel>

            <div className="mt-1 flex items-baseline justify-between px-1">
              <h2 className="text-[15px] font-semibold">Diario</h2>
              <span className="tabular text-muted-foreground text-xs">
                {kcal(totals.kcal)} / {kcal(targets.kcal)} kcal
              </span>
            </div>

            {MEAL_ORDER.map((meal) => (
              <MealSection
                key={meal}
                meal={meal}
                day={day}
                entries={data.byMeal[meal] ?? []}
                onDelete={handleDelete}
              />
            ))}
          </>
        )}
      </div>
    </AppShell>
  )
}
