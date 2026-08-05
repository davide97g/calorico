import { useState } from 'react'
import { Link } from 'react-router-dom'
import { PieChart, Scale, TrendingDown, TrendingUp } from 'lucide-react'
import { toast } from 'sonner'
import { AppShell } from '@/components/layout/app-shell'
import { ActionTiles } from '@/components/dashboard/action-tiles'
import { DaySwitcher } from '@/components/dashboard/day-switcher'
import { DiaryPanel } from '@/components/dashboard/diary-panel'
import { IntakeHero } from '@/components/dashboard/intake-hero'
import { QuickAddStrip } from '@/components/dashboard/quick-add-strip'
import { MacroTriple } from '@/components/charts/macro-bars'
import { Panel, PanelHeader } from '@/components/ui/panel'
import { Skeleton } from '@/components/ui/skeleton'
import {
  useAddEntry,
  useCopyDay,
  useDeleteEntry,
  useDiary,
  useWeight,
} from '@/hooks/use-diary'
import { useAuth } from '@/hooks/use-auth'
import { addDaysISO, todayISO } from '@/lib/date'
import { currentMeal, signed } from '@/lib/format'
import type { DiaryEntry, Goal, WeightResponse } from '@/lib/types'

export default function TodayPage() {
  const { profile } = useAuth()
  const [day, setDay] = useState(todayISO())

  const { data, isLoading } = useDiary(day)
  const { data: weight } = useWeight()
  const deleteEntry = useDeleteEntry()
  const addEntry = useAddEntry()
  const copyDay = useCopyDay()

  const targets = data?.targets
  const totals = data?.totals

  const handleDelete = (entry: DiaryEntry) => {
    deleteEntry.mutate(
      { id: entry.id, day },
      {
        onSuccess: () =>
          toast.success(`${entry.nameSnapshot} rimosso`, {
            // Re-logging needs the food it came from; a snapshot-only entry
            // (its food was deleted) cannot be restored.
            action: entry.foodId
              ? {
                  label: 'Annulla',
                  onClick: () =>
                    addEntry.mutate({
                      foodId: entry.foodId!,
                      day: entry.day,
                      meal: entry.meal,
                      quantityG: entry.quantityG,
                    }),
                }
              : undefined,
          }),
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
      {/* No title, no greeting: the top of the first screen belongs to the
          data, and the user knows which app they opened. */}
      <DaySwitcher day={day} onChange={setDay} />

      <div className="mt-3 flex flex-col gap-3">
        {isLoading || !targets || !totals ? (
          <>
            <Skeleton className="h-[220px] rounded-[32px]" />
            <Skeleton className="h-[72px] rounded-3xl" />
            <Skeleton className="h-[124px] rounded-[28px]" />
          </>
        ) : (
          <>
            <IntakeHero
              consumed={totals.kcal}
              target={targets.kcal}
              max={targets.kcalMax}
              label={day === todayISO() ? 'Budget di oggi' : 'Budget del giorno'}
            />

            <ActionTiles
              day={day}
              onCopyYesterday={handleCopyYesterday}
              copying={copyDay.isPending}
            />

            <QuickAddStrip day={day} meal={currentMeal()} />

            <Panel>
              <PanelHeader
                icon={<PieChart />}
                title="Ancora da assumere"
                to={`/stats?day=${day}`}
              />
              <div className="mt-4">
                <MacroTriple
                  carbs={{ value: totals.carbsG, target: targets.carbsG }}
                  fat={{ value: totals.fatG, target: targets.fatG }}
                  protein={{ value: totals.proteinG, target: targets.proteinG }}
                />
              </div>
            </Panel>

            <DiaryPanel
              day={day}
              byMeal={data.byMeal}
              total={totals.kcal}
              onDelete={handleDelete}
            />

            <WeightPanel weight={weight} goal={profile?.goal} />
          </>
        )}
      </div>
    </AppShell>
  )
}

function WeightPanel({
  weight,
  goal,
}: {
  weight?: WeightResponse
  goal?: Goal
}) {
  const hasTrend = Boolean(weight && weight.items.length > 1)
  const change = weight?.changeKg ?? 0
  const losing = change < 0

  // Whether the trend is good depends on the goal — a gaining user was being
  // shown their own progress in red.
  const tone =
    goal === 'maintain' || change === 0
      ? 'text-muted-foreground'
      : (goal === 'gain') === !losing
        ? 'text-primary-strong'
        : 'text-destructive'

  return (
    <Panel>
      <PanelHeader icon={<Scale />} title="Peso" to="/weight" />
      <div className="mt-3 flex items-end justify-between">
        <div>
          <p className="font-display tabular text-[26px] leading-none font-extrabold">
            {weight?.latest ? `${weight.latest.weightKg}` : '—'}
            {weight?.latest ? (
              <span className="text-muted-foreground ml-1 text-sm font-bold">
                kg
              </span>
            ) : null}
          </p>
          {weight?.bmi ? (
            <p className="text-muted-foreground mt-1.5 text-xs font-medium">
              BMI {weight.bmi}
            </p>
          ) : null}
        </div>

        {hasTrend ? (
          <p className={`flex items-center gap-1 text-sm font-bold ${tone}`}>
            {losing ? (
              <TrendingDown className="size-4" />
            ) : (
              <TrendingUp className="size-4" />
            )}
            <span className="tabular">{signed(change)} kg</span>
          </p>
        ) : (
          <Link
            to="/weight"
            className="text-primary-strong text-sm font-bold underline-offset-4 hover:underline"
          >
            Registra
          </Link>
        )}
      </div>
    </Panel>
  )
}
