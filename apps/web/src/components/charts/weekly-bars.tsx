import {
  Bar,
  BarChart,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from 'recharts'
import type { DailyStat } from '@/lib/types'
import { shortDayLabel } from '@/lib/date'

interface WeeklyBarsProps {
  days: DailyStat[]
  target: number
  selectedDay: string
  onSelectDay: (day: string) => void
  height?: number
}

/**
 * The calories-per-day bars from the stats screen: muted columns, the selected
 * day in lime, dashed guides at 0 / half / target on the right axis.
 */
export function WeeklyBars({
  days,
  target,
  selectedDay,
  onSelectDay,
  height = 168,
}: WeeklyBarsProps) {
  const max = Math.max(target, ...days.map((d) => d.kcal)) * 1.12
  const ticks = [0, Math.round(target / 2 / 50) * 50, target]

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={days}
          margin={{ top: 8, right: 4, bottom: 0, left: 0 }}
          barCategoryGap="22%"
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
            dataKey="day"
            axisLine={false}
            tickLine={false}
            interval={0}
            tickFormatter={shortDayLabel}
            tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
          />
          <Bar
            dataKey="kcal"
            radius={[6, 6, 6, 6]}
            minPointSize={2}
            isAnimationActive
            animationDuration={600}
            onClick={(_data, index) => {
              const day = days[index]?.day
              if (day) onSelectDay(day)
            }}
            className="cursor-pointer"
          >
            {days.map((d) => (
              <Cell
                key={d.day}
                fill={
                  d.day === selectedDay
                    ? 'var(--primary)'
                    : d.kcal === 0
                      ? 'var(--secondary)'
                      : 'var(--ring-track)'
                }
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
