import { useMemo } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  Flame,
  PieChart,
  Trophy,
  Utensils,
} from 'lucide-react'
import { WeeklyBars } from '@/components/charts/weekly-bars'
import { MacroBars } from '@/components/charts/macro-bars'
import { MacroDonut } from '@/components/charts/macro-donut'
import { MealSplit } from '@/components/charts/meal-split'
import {
  DeltaChip,
  EmptyPeriod,
  StatCell,
  TopFoods,
} from '@/components/stats/pieces'
import { Panel, PanelHeader } from '@/components/ui/panel'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useDayStats, useStats } from '@/hooks/use-stats'
import {
  addDaysISO,
  daysUntil,
  isFutureDay,
  labelForDay,
  lastNDays,
  longDayLabel,
  todayISO,
} from '@/lib/date'
import { grams, kcal } from '@/lib/format'

/** Enough days to see a habit, few enough that a phone can still hit one bar. */
const RAIL_DAYS = 14

interface DayReportProps {
  day: string
  onSelectDay: (day: string) => void
}

/**
 * One day, in detail — the most granular view the app has.
 *
 * Everything here exists to keep a single number from being read alone. "2.150
 * kcal" is a good day or a blown one depending on the target, on yesterday, on
 * the week, and on what this weekday usually looks like, so the day's total is
 * never shown without at least one of those beside it.
 */
export function DayReport({ day, onSelectDay }: DayReportProps) {
  const today = todayISO()
  // The rail follows the selection once it walks off the end of the last
  // fortnight, so the arrows never lead somewhere the bars cannot show.
  const railEnd = day > today || daysUntil(day) <= -RAIL_DAYS ? day : today
  const { from, to } = useMemo(
    () => lastNDays(RAIL_DAYS, railEnd),
    [railEnd],
  )

  const { data: range, isLoading: rangeLoading } = useStats(from, to)
  const { data, isLoading } = useDayStats(day)

  const targets = data?.targets ?? range?.targets ?? null
  const totals = data?.totals
  const context = data?.context

  const left = targets && totals ? targets.kcal - totals.kcal : 0
  const overMax = targets && totals ? totals.kcal > targets.kcalMax : false
  const ceiling = targets ? targets.kcalMax * 1.15 : 0
  const pctOf = (value: number) =>
    ceiling > 0 ? Math.min(100, (value / ceiling) * 100) : 0

  return (
    <div className="flex flex-col gap-3">
      <Panel className="pt-3">
        <div className="mb-1 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-base leading-tight font-semibold">
              {labelForDay(day)}
            </p>
            <p className="text-muted-foreground truncate text-micro">
              {longDayLabel(day)}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {day !== today ? (
              <Button
                variant="secondary"
                size="sm"
                className="bg-secondary h-9 rounded-md px-3 text-xs"
                onClick={() => onSelectDay(today)}
              >
                Oggi
              </Button>
            ) : null}
            <button
              type="button"
              onClick={() => onSelectDay(addDaysISO(day, -1))}
              className="hover:bg-secondary active:bg-secondary flex size-10 items-center justify-center rounded-full transition-colors"
              aria-label="Giorno precedente"
            >
              <ChevronLeft className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => onSelectDay(addDaysISO(day, 1))}
              disabled={isFutureDay(day)}
              className="hover:bg-secondary active:bg-secondary flex size-10 items-center justify-center rounded-full transition-colors disabled:opacity-30"
              aria-label="Giorno successivo"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        </div>

        {rangeLoading && !range ? (
          <Skeleton className="h-[168px] rounded-md" />
        ) : (
          <WeeklyBars
            days={range?.days ?? []}
            target={targets?.kcal ?? 2000}
            selectedDay={day}
            onSelectDay={onSelectDay}
          />
        )}
      </Panel>

      {isLoading && !data ? (
        <>
          <Skeleton className="h-[190px] rounded-lg" />
          <Skeleton className="h-[210px] rounded-lg" />
        </>
      ) : (
        <>
          <Panel>
            <PanelHeader icon={<Flame />} title="Calorie" />
            <p className="font-display tabular mt-3 text-display leading-none font-extrabold">
              {kcal(totals?.kcal ?? 0)}
              <span className="text-muted-foreground ml-1.5 text-base font-bold">
                kcal
              </span>
            </p>
            <p className="text-muted-foreground mt-1.5 text-xs">
              Obiettivo {kcal(targets?.kcal ?? 0)} kcal ·{' '}
              {totals && totals.entries > 0
                ? overMax
                  ? `${kcal(Math.abs(left))} kcal oltre l'obiettivo`
                  : `restano ${kcal(Math.max(0, left))} kcal`
                : 'nessuna voce registrata'}
            </p>

            {/* The acceptable band drawn behind the fill: the target is a range,
                and a bar with one mark makes every day look like a near miss. */}
            <div className="bg-secondary relative mt-4 h-3 overflow-hidden rounded-full">
              {targets ? (
                <div
                  className="bg-ring-track absolute inset-y-0"
                  style={{
                    left: `${pctOf(targets.kcalMin)}%`,
                    width: `${pctOf(targets.kcalMax) - pctOf(targets.kcalMin)}%`,
                  }}
                />
              ) : null}
              <div
                className={`absolute inset-y-0 left-0 rounded-full transition-[width] duration-700 ${overMax ? 'bg-over-warn' : 'bg-primary'}`}
                style={{ width: `${pctOf(totals?.kcal ?? 0)}%` }}
              />
            </div>
            <div className="text-muted-foreground mt-2 flex items-center justify-between text-micro">
              <span>0</span>
              <span className="flex items-center gap-1.5">
                <span className="bg-ring-track inline-block size-2.5 rounded-[3px]" />
                Intervallo {targets?.kcalMin}-{targets?.kcalMax}
              </span>
              <span>{Math.round(ceiling)}</span>
            </div>

            {/* Three references, none of them a target: yesterday, the week
                behind, and what this weekday usually costs. */}
            <div className="mt-4 flex flex-wrap gap-1.5">
              <DeltaChip
                label="vs ieri"
                delta={
                  context?.prevDayKcal == null || !totals
                    ? null
                    : totals.kcal - context.prevDayKcal
                }
              />
              <DeltaChip
                label={`vs media ${context?.recentDays ?? 0} gg`}
                delta={
                  context?.recentAvgKcal == null || !totals
                    ? null
                    : totals.kcal - context.recentAvgKcal
                }
              />
              <DeltaChip
                label="vs stesso giorno"
                delta={
                  context?.weekdayAvgKcal == null || !totals
                    ? null
                    : totals.kcal - context.weekdayAvgKcal
                }
              />
            </div>
          </Panel>

          <Panel>
            <PanelHeader icon={<Utensils />} title="Pasti" />
            {totals && totals.entries > 0 ? (
              <MealSplit rows={data?.byMeal ?? []} className="mt-4" />
            ) : (
              <div className="mt-3">
                <EmptyPeriod text="Nessun pasto registrato in questo giorno." />
              </div>
            )}
          </Panel>

          <Panel>
            <PanelHeader icon={<PieChart />} title="Nutrienti" />
            <div className="mt-4 flex items-center gap-4">
              <MacroDonut
                carbsG={totals?.carbsG ?? 0}
                fatG={totals?.fatG ?? 0}
                proteinG={totals?.proteinG ?? 0}
                size={84}
              />
              <div className="min-w-0 flex-1">
                <MacroBars
                  carbs={{
                    value: totals?.carbsG ?? 0,
                    target: targets?.carbsG ?? 0,
                  }}
                  fat={{ value: totals?.fatG ?? 0, target: targets?.fatG ?? 0 }}
                  protein={{
                    value: totals?.proteinG ?? 0,
                    target: targets?.proteinG ?? 0,
                  }}
                />
              </div>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <StatCell label="Fibre" value={`${grams(totals?.fiberG ?? 0)} g`} />
              <StatCell
                label="Zuccheri"
                value={`${grams(totals?.sugarsG ?? 0)} g`}
              />
              <StatCell
                label="Saturi"
                value={`${grams(totals?.satFatG ?? 0)} g`}
              />
              <StatCell label="Sale" value={`${grams(totals?.saltG ?? 0)} g`} />
            </dl>
            <p className="text-muted-foreground mt-2 text-micro">
              Ripartizione C/G/P: {splitLabel(totals)}
            </p>
          </Panel>

          <Panel>
            <PanelHeader icon={<Trophy />} title="Cosa ha pesato di più" />
            <TopFoods
              items={data?.topFoods ?? []}
              total={totals?.kcal ?? 0}
              emptyText="Nessuna voce in questo giorno."
            />
          </Panel>
        </>
      )}
    </div>
  )
}

/** "45/30/25" — the energy split, the one macro figure worth a glance. */
function splitLabel(
  totals: { carbsG: number; fatG: number; proteinG: number } | undefined,
) {
  if (!totals) return '—'
  const carbs = totals.carbsG * 4
  const fat = totals.fatG * 9
  const protein = totals.proteinG * 4
  const total = carbs + fat + protein
  if (total <= 0) return '—'
  const share = (value: number) => Math.round((value / total) * 100)
  return `${share(carbs)}/${share(fat)}/${share(protein)}`
}
