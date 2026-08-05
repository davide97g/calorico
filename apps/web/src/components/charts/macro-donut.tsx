import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts'
import { MACRO_META } from './macro-bars'

interface MacroDonutProps {
  carbsG: number
  fatG: number
  proteinG: number
  size?: number
  /** Shows the split as labels inside the slices, like the mock. */
  withLabels?: boolean
}

const KCAL = { carbs: 4, fat: 9, protein: 4 }

interface SliceLabelProps {
  cx?: number
  cy?: number
  midAngle?: number
  innerRadius?: number
  outerRadius?: number
  percent?: number
}

/**
 * Recharts places pie labels outside the slice by default, which clips inside a
 * 92 px chart. Draw them at 55% of the radius instead, like the design.
 */
function SliceLabel({
  cx = 0,
  cy = 0,
  midAngle = 0,
  innerRadius = 0,
  outerRadius = 0,
  percent = 0,
}: SliceLabelProps) {
  if (percent < 0.08) return null
  const rad = -midAngle * (Math.PI / 180)
  const r = innerRadius + (outerRadius - innerRadius) * 0.58
  return (
    <text
      x={cx + r * Math.cos(rad)}
      y={cy + r * Math.sin(rad)}
      textAnchor="middle"
      dominantBaseline="central"
      fontSize={11}
      fontWeight={700}
      fill="oklch(0.28 0.03 145)"
    >
      {Math.round(percent * 100)}%
    </text>
  )
}

/**
 * Energy split by macro. Percentages are of calories, not grams — a gram of fat
 * carries more than twice the energy of a gram of carbs, so a gram-based pie
 * would misrepresent the diet.
 */
export function MacroDonut({
  carbsG,
  fatG,
  proteinG,
  size = 104,
  withLabels = true,
}: MacroDonutProps) {
  const data = [
    { key: 'carbs' as const, kcal: carbsG * KCAL.carbs },
    { key: 'fat' as const, kcal: fatG * KCAL.fat },
    { key: 'protein' as const, kcal: proteinG * KCAL.protein },
  ]
  const total = data.reduce((s, d) => s + d.kcal, 0)

  if (total <= 0) {
    return (
      <div
        style={{ width: size, height: size }}
        className="border-border text-muted-foreground flex items-center justify-center rounded-full border-2 border-dashed text-[11px]"
      >
        —
      </div>
    )
  }

  const COLORS: Record<'carbs' | 'fat' | 'protein', string> = {
    carbs: 'var(--carbs)',
    fat: 'var(--fat)',
    protein: 'var(--protein)',
  }

  return (
    <div style={{ width: size, height: size }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="kcal"
            nameKey="key"
            innerRadius={0}
            outerRadius="100%"
            startAngle={90}
            endAngle={-270}
            stroke="var(--card)"
            strokeWidth={2}
            isAnimationActive
            animationDuration={600}
            label={withLabels ? <SliceLabel /> : false}
            labelLine={false}
          >
            {data.map((d) => (
              <Cell key={d.key} fill={COLORS[d.key]} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}

export function MacroLegend({
  carbsG,
  fatG,
  proteinG,
}: {
  carbsG: number
  fatG: number
  proteinG: number
}) {
  const rows = [
    { key: 'carbs' as const, value: carbsG },
    { key: 'fat' as const, value: fatG },
    { key: 'protein' as const, value: proteinG },
  ]
  return (
    <ul className="flex flex-col gap-2">
      {rows.map((r) => (
        <li key={r.key} className="flex items-center gap-2 text-xs">
          <span
            className={`size-2 rounded-full ${MACRO_META[r.key].dot}`}
            aria-hidden
          />
          <span className="text-muted-foreground">{MACRO_META[r.key].label}</span>
          <span className="tabular ml-auto font-semibold">
            {Math.round(r.value * 10) / 10} g
          </span>
        </li>
      ))}
    </ul>
  )
}
