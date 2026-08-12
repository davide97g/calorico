import { useMemo } from 'react'
import { ChartColumn } from 'lucide-react'
import { MiniBars } from '@/components/charts/mini-bars'
import { Panel, PanelHeader } from '@/components/ui/panel'
import { Skeleton } from '@/components/ui/skeleton'
import { useStats } from '@/hooks/use-diary'
import { lastNDays } from '@/lib/date'
import { kcal } from '@/lib/format'

/**
 * The dashboard's way into the stats — and the answer to the question the
 * dashboard cannot answer on its own. Today's ring says how today is going; this
 * says whether today is normal.
 *
 * Seven days is the shortest window in which a week has a shape, and the whole
 * panel is a link: the figure is a teaser, the analysis is a screen.
 */
export function TrendPanel() {
  const { from, to } = useMemo(() => lastNDays(7), [])
  const { data, isLoading } = useStats(from, to)

  const targets = data?.targets
  const band = targets ? { min: targets.kcalMin, max: targets.kcalMax } : null
  const logged = data?.summary.loggedDays ?? 0

  if (isLoading && !data) return <Skeleton className="h-[132px] rounded-lg" />

  return (
    <Panel>
      <PanelHeader
        icon={<ChartColumn />}
        title="Ultimi 7 giorni"
        to="/stats?tab=week"
      />

      <div className="mt-3 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display tabular text-display-sm leading-none font-extrabold">
            {kcal(data?.summary.avgKcal ?? 0)}
            <span className="text-muted-foreground ml-1 text-xs font-bold">
              kcal / giorno
            </span>
          </p>
          <p className="text-muted-foreground mt-1.5 text-xs font-medium">
            {logged === 0
              ? 'Nessun giorno registrato'
              : `${data?.summary.daysInRange ?? 0} di ${logged} giorni nel target`}
          </p>
        </div>

        <MiniBars
          className="w-36 shrink-0"
          days={data?.days ?? []}
          target={targets?.kcal ?? 0}
          band={band}
          height={48}
        />
      </div>
    </Panel>
  )
}
