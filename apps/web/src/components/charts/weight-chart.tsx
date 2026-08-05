import {
  Area,
  AreaChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { format, parseISO } from 'date-fns'
import { it } from 'date-fns/locale'
import type { WeightLog } from '@/lib/types'

interface WeightChartProps {
  items: WeightLog[]
  targetWeightKg?: number | null
  height?: number
}

export function WeightChart({
  items,
  targetWeightKg,
  height = 190,
}: WeightChartProps) {
  if (items.length < 2) {
    return (
      <p className="text-muted-foreground py-8 text-center text-sm">
        Registra almeno due pesate per vedere l'andamento.
      </p>
    )
  }

  const weights = items.map((i) => i.weightKg)
  const lo = Math.min(...weights, targetWeightKg ?? Infinity)
  const hi = Math.max(...weights, targetWeightKg ?? -Infinity)
  const pad = Math.max(0.6, (hi - lo) * 0.18)

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={items} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="weightFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.45} />
              <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <YAxis
            domain={[lo - pad, hi + pad]}
            width={34}
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
            tickFormatter={(v: number) => String(Math.round(v))}
          />
          <XAxis
            dataKey="day"
            axisLine={false}
            tickLine={false}
            minTickGap={24}
            tickFormatter={(d: string) =>
              format(parseISO(d), 'd MMM', { locale: it })
            }
            tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
          />
          {targetWeightKg ? (
            <ReferenceLine
              y={targetWeightKg}
              stroke="var(--muted-foreground)"
              strokeDasharray="4 4"
              label={{
                value: `obiettivo ${targetWeightKg} kg`,
                position: 'insideBottomRight',
                fontSize: 10,
                fill: 'var(--muted-foreground)',
              }}
            />
          ) : null}
          <Tooltip
            contentStyle={{
              borderRadius: 14,
              border: '1px solid var(--border)',
              background: 'var(--popover)',
              fontSize: 12,
              boxShadow: '0 8px 24px -12px oklch(0 0 0 / 0.25)',
            }}
            labelFormatter={(d) =>
              format(parseISO(String(d)), 'd MMMM yyyy', { locale: it })
            }
            formatter={(v) => [`${v} kg`, 'Peso']}
          />
          <Area
            type="monotone"
            dataKey="weightKg"
            stroke="var(--primary)"
            strokeWidth={2.5}
            fill="url(#weightFill)"
            dot={{ r: 2.5, fill: 'var(--primary)', strokeWidth: 0 }}
            activeDot={{ r: 5 }}
            animationDuration={700}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
