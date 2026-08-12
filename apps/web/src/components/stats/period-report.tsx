import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  CalendarRange,
  Flame,
  PieChart,
  Scale,
  Trophy,
  Utensils,
} from 'lucide-react'
import { MacroBars } from '@/components/charts/macro-bars'
import { MacroDonut } from '@/components/charts/macro-donut'
import { MealSplit } from '@/components/charts/meal-split'
import { MiniBars } from '@/components/charts/mini-bars'
import { PeriodBars } from '@/components/charts/period-bars'
import { WeekdayPattern } from '@/components/charts/weekday-pattern'
import {
  BandSplit,
  DeltaChip,
  EmptyPeriod,
  StatCell,
  TopFoods,
} from '@/components/stats/pieces'
import { Panel, PanelHeader } from '@/components/ui/panel'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { useBreakdown, usePeriodStats } from '@/hooks/use-diary'
import {
  lastNMonths,
  lastNWeeks,
  monthLabel,
  shortDayLabel,
  shortMonthLabel,
  todayISO,
  weekdayShortLabel,
  weekRangeLabel,
} from '@/lib/date'
import { grams, kcal, pct } from '@/lib/format'
import type { PeriodBucket, PeriodUnit } from '@/lib/types'

/**
 * Eight weeks is two months of habit — long enough for a weekday pattern to
 * appear. Six months is the horizon over which a weight goal actually moves.
 */
const SPAN = { week: 8, month: 6 } as const

interface PeriodReportProps {
  unit: PeriodUnit
  selectedKey: string | null
  onSelectKey: (key: string) => void
  /** Tapping a day inside a week hands the day tab its selection. */
  onSelectDay: (day: string) => void
}

/**
 * A week or a month, and the same one before it.
 *
 * Weeks are the detailed view: the seven days stay individually visible and
 * tappable, because a week is still something you can act on. Months are the
 * smoothed view — averages, coverage and the recap — because by then the useful
 * question is no longer "which day" but "was this month better than the last".
 *
 * Every average here is per *logged* day. A month with four untracked days is
 * not a month of eating less, and dividing by 30 would quietly say it was.
 */
export function PeriodReport({
  unit,
  selectedKey,
  onSelectKey,
  onSelectDay,
}: PeriodReportProps) {
  const { from, to } = useMemo(
    () =>
      unit === 'week' ? lastNWeeks(SPAN.week) : lastNMonths(SPAN.month),
    [unit],
  )

  const { data, isLoading } = usePeriodStats(unit, from, to)
  const buckets = data?.buckets ?? []
  const targets = data?.targets ?? null

  const index = buckets.findIndex((b) => b.key === selectedKey)
  const selected = index >= 0 ? buckets[index] : buckets.at(-1)
  const previous =
    selected && buckets.length > 1
      ? buckets[(index >= 0 ? index : buckets.length - 1) - 1]
      : undefined

  const { data: recap } = useBreakdown(
    selected?.from ?? from,
    selected?.to ?? to,
    Boolean(selected),
  )
  // Weekday shape and the logging streak only mean something over many buckets,
  // so both come from the whole range rather than the selected one.
  const { data: overall } = useBreakdown(from, to)

  if (isLoading && buckets.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-[210px] rounded-lg" />
        <Skeleton className="h-[240px] rounded-lg" />
        <Skeleton className="h-[180px] rounded-lg" />
      </div>
    )
  }

  const label = selected ? bucketLabel(selected, unit) : ''
  const running = selected?.key === buckets.at(-1)?.key
  const logged = selected?.loggedDays ?? 0
  const band = targets ? { min: targets.kcalMin, max: targets.kcalMax } : null

  return (
    <div className="flex flex-col gap-3">
      <Panel className="pt-3">
        <PanelHeader
          icon={<CalendarRange />}
          title={unit === 'week' ? 'Settimana per settimana' : 'Mese per mese'}
        />
        <PeriodBars
          className="mt-3"
          buckets={buckets}
          target={targets?.kcal ?? 2000}
          selectedKey={selected?.key ?? ''}
          onSelect={onSelectKey}
          labelOf={(bucket) =>
            unit === 'week'
              ? shortDayLabel(bucket.from)
              : shortMonthLabel(bucket.key)
          }
        />
        <p className="text-muted-foreground mt-2 text-micro">
          Media kcal per giorno registrato. Tocca una barra per il dettaglio; il
          tratteggio è il periodo ancora in corso.
        </p>
      </Panel>

      <Panel>
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-primary-strong text-micro font-bold tracking-[0.16em] uppercase">
              {unit === 'week' ? 'Settimana' : 'Mese'}
            </p>
            <h2 className="truncate text-base leading-tight font-semibold first-letter:uppercase">
              {label}
            </h2>
          </div>
          {running ? (
            <Badge variant="secondary" className="shrink-0 text-micro">
              in corso
            </Badge>
          ) : null}
        </div>

        {logged === 0 ? (
          <div className="mt-3">
            <EmptyPeriod
              text={
                unit === 'week'
                  ? 'Nessun giorno registrato in questa settimana.'
                  : 'Nessun giorno registrato in questo mese.'
              }
            />
          </div>
        ) : (
          <>
            <p className="font-display tabular mt-3 text-display leading-none font-extrabold">
              {kcal(selected?.avgKcal ?? 0)}
              <span className="text-muted-foreground ml-1.5 text-base font-bold">
                kcal / giorno
              </span>
            </p>

            <div className="mt-3 flex flex-wrap gap-1.5">
              <DeltaChip
                label={unit === 'week' ? 'vs settimana prec.' : 'vs mese prec.'}
                delta={
                  previous && previous.loggedDays > 0 && selected
                    ? selected.avgKcal - previous.avgKcal
                    : null
                }
              />
              <DeltaChip
                label="vs obiettivo"
                delta={
                  targets && selected ? selected.avgKcal - targets.kcal : null
                }
              />
            </div>

            <dl className="mt-4 grid grid-cols-2 gap-2">
              <StatCell
                label="Giorni registrati"
                value={`${logged} / ${selected?.days ?? 0}`}
                hint={recap ? `copertura ${pct(recap.coverage)}` : undefined}
              />
              <StatCell
                label="Nel target"
                value={`${selected?.daysInRange ?? 0} giorni`}
                hint={
                  logged > 0
                    ? pct(((selected?.daysInRange ?? 0) / logged) * 100)
                    : undefined
                }
                tone={
                  logged > 0 && (selected?.daysInRange ?? 0) / logged >= 0.6
                    ? 'good'
                    : undefined
                }
              />
              <StatCell
                label="Giorno più leggero"
                value={
                  selected?.lightestDay
                    ? `${kcal(selected.lightestDay.kcal)} kcal`
                    : '—'
                }
                hint={
                  selected?.lightestDay
                    ? dayHint(selected.lightestDay.day, unit)
                    : undefined
                }
              />
              <StatCell
                label="Giorno più pesante"
                value={
                  selected?.heaviestDay
                    ? `${kcal(selected.heaviestDay.kcal)} kcal`
                    : '—'
                }
                hint={
                  selected?.heaviestDay
                    ? dayHint(selected.heaviestDay.day, unit)
                    : undefined
                }
              />
            </dl>

            <div className="mt-4">
              <BandSplit
                inRange={selected?.daysInRange ?? 0}
                under={selected?.daysUnder ?? 0}
                over={selected?.daysOver ?? 0}
              />
            </div>
          </>
        )}
      </Panel>

      {selected && selected.dailyStats.length > 0 ? (
        <Panel>
          <PanelHeader
            icon={<Flame />}
            title={unit === 'week' ? 'I giorni' : 'Andamento del mese'}
          />
          <MiniBars
            className="mt-4"
            days={selected.dailyStats}
            target={targets?.kcal ?? 0}
            band={band}
            height={unit === 'week' ? 72 : 60}
            labels={unit === 'week' ? 'weekday' : 'none'}
            onSelectDay={unit === 'week' ? onSelectDay : undefined}
          />
          <p className="text-muted-foreground mt-3 text-micro">
            {unit === 'week'
              ? 'Lime nel target, grigio sotto, arancio sopra. Tocca un giorno per aprirlo.'
              : 'Un blocco per giorno: lime nel target, grigio sotto, arancio sopra.'}
          </p>
        </Panel>
      ) : null}

      {logged > 0 ? (
        <>
          <Panel>
            <PanelHeader icon={<PieChart />} title="Nutrienti · media" />
            <div className="mt-4 flex items-center gap-4">
              <MacroDonut
                carbsG={selected?.avgCarbsG ?? 0}
                fatG={selected?.avgFatG ?? 0}
                proteinG={selected?.avgProteinG ?? 0}
                size={84}
              />
              <div className="min-w-0 flex-1">
                <MacroBars
                  carbs={{
                    value: selected?.avgCarbsG ?? 0,
                    target: targets?.carbsG ?? 0,
                  }}
                  fat={{
                    value: selected?.avgFatG ?? 0,
                    target: targets?.fatG ?? 0,
                  }}
                  protein={{
                    value: selected?.avgProteinG ?? 0,
                    target: targets?.proteinG ?? 0,
                  }}
                />
              </div>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-2">
              <StatCell
                label="Fibre / giorno"
                value={`${grams(selected?.avgFiberG ?? 0)} g`}
              />
              <StatCell
                label="Totale periodo"
                value={`${kcal(selected?.totalKcal ?? 0)} kcal`}
                hint={`${selected?.entries ?? 0} voci`}
              />
            </dl>
          </Panel>

          <Panel>
            <PanelHeader icon={<Utensils />} title="Distribuzione pasti" />
            {recap ? (
              <MealSplit rows={recap.mealSplit} perDay className="mt-4" />
            ) : (
              <Skeleton className="mt-4 h-32 rounded-md" />
            )}
          </Panel>

          <Panel>
            <PanelHeader icon={<Scale />} title="Peso" to="/weight" />
            {selected?.weight ? (
              <dl className="mt-3 grid grid-cols-3 gap-2">
                <StatCell
                  label="Variazione"
                  value={`${selected.weight.changeKg > 0 ? '+' : ''}${grams(selected.weight.changeKg)} kg`}
                />
                <StatCell label="Media" value={`${grams(selected.weight.avgKg)} kg`} />
                <StatCell
                  label="Pesate"
                  value={selected.weight.count}
                  hint={`${grams(selected.weight.startKg)} → ${grams(selected.weight.endKg)}`}
                />
              </dl>
            ) : (
              <p className="text-muted-foreground mt-3 text-xs">
                Nessuna pesata in questo periodo.{' '}
                <Link
                  to="/weight"
                  className="text-primary-strong font-semibold underline-offset-4 hover:underline"
                >
                  Registrane una
                </Link>{' '}
                per vedere le calorie contro il peso.
              </p>
            )}
          </Panel>
        </>
      ) : null}

      <Panel>
        <PanelHeader
          icon={<CalendarRange />}
          title={`Abitudini · ${SPAN[unit]} ${unit === 'week' ? 'settimane' : 'mesi'}`}
        />
        {overall ? (
          <>
            <WeekdayPattern
              className="mt-4"
              rows={overall.weekdayPattern}
              target={targets?.kcal ?? 0}
            />
            <p className="text-muted-foreground mt-3 text-micro">
              Media per giorno della settimana. La barra lime è il giorno che
              costa di più.
            </p>
            <dl className="mt-4 grid grid-cols-3 gap-2">
              <StatCell
                label="Serie attuale"
                value={`${overall.streak.current} gg`}
                tone={overall.streak.current >= 3 ? 'good' : undefined}
              />
              <StatCell label="Record" value={`${overall.streak.longest} gg`} />
              <StatCell
                label="Copertura"
                value={pct(overall.coverage)}
                hint={`${overall.loggedDays} / ${overall.days} giorni`}
              />
            </dl>
          </>
        ) : (
          <Skeleton className="mt-4 h-40 rounded-md" />
        )}
      </Panel>

      <Panel>
        <PanelHeader icon={<Trophy />} title="Alimenti che pesano di più" />
        {recap ? (
          <TopFoods items={recap.topFoods} total={recap.totalKcal} />
        ) : (
          <Skeleton className="mt-3 h-40 rounded-md" />
        )}
      </Panel>
    </div>
  )
}

function bucketLabel(bucket: PeriodBucket, unit: PeriodUnit) {
  if (unit === 'month') return monthLabel(bucket.key)
  const today = todayISO()
  const range = weekRangeLabel(bucket.from, bucket.to)
  return bucket.to >= today && bucket.from <= today
    ? `Questa settimana · ${range}`
    : range
}

/** Inside a month a date reads best; inside a week, the weekday does. */
function dayHint(day: string, unit: PeriodUnit) {
  return unit === 'month' ? weekRangeLabel(day, day) : weekdayShortLabel(day)
}
