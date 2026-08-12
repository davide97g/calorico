import type { ReactNode } from 'react'
import { ArrowDown, ArrowUp, Minus } from 'lucide-react'
import type { TopFood } from '@/lib/types'
import { kcal, signed } from '@/lib/format'
import { cn } from '@/lib/utils'

/**
 * The vocabulary the stats screens are written in. Three ideas, reused
 * everywhere, so a figure means the same thing on the day tab and on the month
 * tab: a delta against a reference, a band the days fell into, and the foods
 * that carried the period.
 */

export type Tone = 'good' | 'warn' | 'muted'

const TONE_TEXT: Record<Tone, string> = {
  good: 'text-primary-strong',
  warn: 'text-destructive',
  muted: 'text-muted-foreground',
}

/**
 * "+180 vs ieri". A raw total answers nothing on its own — every figure on these
 * screens is worth reading against something, and the chip is what carries the
 * something. `null` renders nothing at all rather than a zero: there is a
 * difference between "the same as last week" and "there was no last week".
 */
export function DeltaChip({
  label,
  delta,
  unit = 'kcal',
  digits = 0,
}: {
  label: string
  delta: number | null
  unit?: string
  digits?: 0 | 1
}) {
  if (delta === null) return null
  const flat = Math.abs(delta) < (digits === 0 ? 1 : 0.05)
  const Icon = flat ? Minus : delta > 0 ? ArrowUp : ArrowDown

  return (
    <span className="bg-secondary/70 flex items-center gap-1 rounded-full py-1 pr-2.5 pl-2 text-micro font-semibold">
      <Icon className="size-3 shrink-0" />
      <span className="tabular">
        {flat ? '=' : signed(delta, digits)} {unit}
      </span>
      <span className="text-muted-foreground font-medium">{label}</span>
    </span>
  )
}

/** One figure with its caption, the grid cell both period reports are built of. */
export function StatCell({
  label,
  value,
  hint,
  tone,
}: {
  label: ReactNode
  value: ReactNode
  hint?: ReactNode
  tone?: Tone
}) {
  return (
    <div className="bg-secondary/60 rounded-md p-3">
      <p className="text-muted-foreground text-micro">{label}</p>
      <p
        className={cn(
          'tabular mt-1 text-base leading-tight font-bold',
          tone && TONE_TEXT[tone],
        )}
      >
        {value}
      </p>
      {hint ? (
        <p className="text-muted-foreground mt-0.5 text-micro">{hint}</p>
      ) : null}
    </div>
  )
}

/**
 * How the logged days split against the target band. Days below the band are not
 * failures and days above are not either — that depends on the goal — so the
 * three segments are stated, not judged.
 */
export function BandSplit({
  inRange,
  under,
  over,
  className,
}: {
  inRange: number
  under: number
  over: number
  className?: string
}) {
  const total = inRange + under + over
  if (total === 0) return null

  const segments = [
    // Not `bg-ring-track` like the bars: on the pale track of this bar it would
    // be a segment you cannot see, and "9 days under" has to be visible.
    { key: 'under', value: under, fill: 'bg-muted-foreground/35', label: 'sotto' },
    { key: 'in', value: inRange, fill: 'bg-primary', label: 'nel target' },
    { key: 'over', value: over, fill: 'bg-over-warn', label: 'sopra' },
  ]

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="bg-secondary flex h-3 overflow-hidden rounded-full">
        {segments.map((s) => (
          <span
            key={s.key}
            className={s.fill}
            style={{ width: `${(s.value / total) * 100}%` }}
            aria-hidden
          />
        ))}
      </div>
      <ul className="text-muted-foreground flex items-center justify-between text-micro">
        {segments.map((s) => (
          <li key={s.key} className="flex items-center gap-1.5">
            <span className={cn('size-2.5 rounded-[3px]', s.fill)} aria-hidden />
            <span className="tabular text-foreground font-semibold">
              {s.value}
            </span>
            {s.label}
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * The foods that carried the period, biggest energy contribution first — which
 * is not the same list as "most often logged", and is the one worth acting on.
 */
export function TopFoods({
  items,
  total,
  emptyText = 'Niente da mostrare per questo periodo.',
}: {
  items: (TopFood & { share?: number })[]
  total: number
  emptyText?: string
}) {
  if (items.length === 0) {
    return <p className="text-muted-foreground mt-3 text-xs">{emptyText}</p>
  }

  return (
    <ol className="mt-3 flex flex-col gap-3">
      {items.map((item) => {
        const share = item.share ?? (total > 0 ? (item.kcal / total) * 100 : 0)
        return (
          <li key={`${item.name}-${item.brand ?? ''}`}>
            <div className="flex items-baseline gap-2">
              <p className="min-w-0 flex-1 truncate text-sm font-semibold">
                {item.name}
                {item.brand ? (
                  <span className="text-muted-foreground font-normal">
                    {' '}
                    · {item.brand}
                  </span>
                ) : null}
              </p>
              <p className="tabular shrink-0 text-sm font-bold">
                {kcal(item.kcal)}
                <span className="text-muted-foreground text-micro font-medium">
                  {' '}
                  kcal
                </span>
              </p>
            </div>
            <div className="mt-1.5 flex items-center gap-2">
              <div className="bg-secondary h-1.5 flex-1 overflow-hidden rounded-full">
                <div
                  className="bg-primary h-full rounded-full"
                  style={{ width: `${Math.min(100, share)}%` }}
                />
              </div>
              <p className="text-muted-foreground tabular w-24 shrink-0 text-right text-micro">
                {Math.round(share)}% · {item.times}×
              </p>
            </div>
          </li>
        )
      })}
    </ol>
  )
}

export function EmptyPeriod({ text }: { text: string }) {
  return (
    <div className="border-border text-muted-foreground rounded-md border border-dashed p-4 text-center text-xs">
      {text}
    </div>
  )
}
