import {
  Bar,
  BarChart,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from 'recharts'
import type { PeriodBucket } from '@/lib/types'
import { cn } from '@/lib/utils'

interface PeriodBarsProps {
  buckets: PeriodBucket[]
  target: number
  selectedKey: string
  onSelect: (key: string) => void
  /** Axis tick per bucket — a week reads as a date, a month as its name. */
  labelOf: (bucket: PeriodBucket) => string
  height?: number
  className?: string
}

/**
 * Average calories per logged day, one bar per week or per month.
 *
 * The average is the only figure that can be compared across buckets: a running
 * week has fewer days in it than the one before, and a total would make every
 * Wednesday look like progress. The bar for the bucket in progress is drawn
 * hollow, so nobody reads a half-finished week as a light one.
 */
export function PeriodBars({
  buckets,
  target,
  selectedKey,
  onSelect,
  labelOf,
  height = 172,
  className,
}: PeriodBarsProps) {
  const data = buckets.map((bucket) => ({
    key: bucket.key,
    label: labelOf(bucket),
    avgKcal: bucket.avgKcal,
    /** The last bucket is the only one that can still be running. */
    partial: bucket === buckets.at(-1),
    empty: bucket.loggedDays === 0,
  }))
  const max = Math.max(target, ...data.map((d) => d.avgKcal)) * 1.12
  const ticks = [0, Math.round(target / 2 / 50) * 50, target].filter(
    (t, i, all) => all.indexOf(t) === i,
  )

  return (
    <div style={{ height }} className={cn('w-full', className)}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{ top: 8, right: 4, bottom: 0, left: 0 }}
          barCategoryGap="26%"
        >
          {ticks.map((t) => (
            <ReferenceLine
              key={t}
              y={t}
              stroke="var(--border)"
              strokeDasharray="3 5"
            />
          ))}
          <YAxis
            orientation="right"
            domain={[0, max]}
            ticks={ticks}
            width={38}
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
          />
          <XAxis
            dataKey="label"
            axisLine={false}
            tickLine={false}
            interval={0}
            tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
          />
          <Bar
            dataKey="avgKcal"
            radius={[6, 6, 6, 6]}
            minPointSize={2}
            isAnimationActive
            animationDuration={600}
            onClick={(_data, index) => {
              const key = data[index]?.key
              if (key) onSelect(key)
            }}
            className="cursor-pointer"
          >
            {data.map((d) => (
              <Cell
                key={d.key}
                fill={
                  d.empty
                    ? 'var(--secondary)'
                    : d.key === selectedKey
                      ? 'var(--primary)'
                      : 'var(--ring-track)'
                }
                stroke={d.partial ? 'var(--primary-strong)' : undefined}
                strokeDasharray={d.partial ? '3 3' : undefined}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
