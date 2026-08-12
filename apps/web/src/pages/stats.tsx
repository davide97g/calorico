import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AppShell } from '@/components/layout/app-shell'
import { TopBar } from '@/components/layout/top-bar'
import { DayReport } from '@/components/stats/day-report'
import { PeriodReport } from '@/components/stats/period-report'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { startOfMonthISO, startOfWeekISO, todayISO } from '@/lib/date'

/**
 * Three zoom levels, and they are not three copies of one screen.
 *
 *   giorno    — the detailed one: every meal, every food, deltas against
 *               yesterday and against this weekday's usual cost.
 *   settimana — still detailed: the seven days stay individually visible and
 *               tappable, and each week is read against the one before it.
 *   mese      — smoothed on purpose: averages, coverage, a recap. By then the
 *               question is no longer "which day" but "was this month better".
 *
 * The scope and its selection live in the URL, so the dashboard can link
 * straight at a day ("?day=2026-08-11") or at the week view, and a reload keeps
 * whatever the user was looking at.
 */
const SCOPES = [
  { key: 'day', label: 'Giorno' },
  { key: 'week', label: 'Settimana' },
  { key: 'month', label: 'Mese' },
] as const

type Scope = (typeof SCOPES)[number]['key']

const isScope = (value: string | null): value is Scope =>
  SCOPES.some((s) => s.key === value)

export default function StatsPage() {
  const [params, setParams] = useSearchParams()

  const scope: Scope = isScope(params.get('tab')) ? (params.get('tab') as Scope) : 'day'
  const day = params.get('day') ?? todayISO()
  const bucket = params.get('bucket')

  /** One writer for the whole screen: every selection is a URL, replace-only. */
  const patch = useCallback(
    (next: Record<string, string | null>) => {
      setParams(
        (current) => {
          const merged = new URLSearchParams(current)
          for (const [key, value] of Object.entries(next)) {
            if (value === null) merged.delete(key)
            else merged.set(key, value)
          }
          return merged
        },
        { replace: true },
      )
    },
    [setParams],
  )

  const showDay = useCallback(
    (nextDay: string) => patch({ tab: 'day', day: nextDay }),
    [patch],
  )

  return (
    <AppShell>
      <TopBar title="Analisi" back />

      <Tabs
        value={scope}
        onValueChange={(value) =>
          patch({
            tab: value,
            // Moving up a level re-anchors on the period the selected day is
            // in, so the three tabs never disagree about "when".
            bucket:
              value === 'week'
                ? startOfWeekISO(day)
                : value === 'month'
                  ? startOfMonthISO(day)
                  : null,
          })
        }
        className="mb-3"
      >
        <TabsList className="bg-card shadow-soft h-12 w-full rounded-full p-1">
          {SCOPES.map((s) => (
            <TabsTrigger
              key={s.key}
              value={s.key}
              className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-full text-xs data-[state=active]:shadow-none"
            >
              {s.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {scope === 'day' ? (
        <DayReport day={day} onSelectDay={showDay} />
      ) : (
        <PeriodReport
          unit={scope}
          selectedKey={bucket}
          onSelectKey={(key) => patch({ bucket: key })}
          onSelectDay={showDay}
        />
      )}
    </AppShell>
  )
}
