import { History } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { FoodPortions } from '@/lib/types'

export interface PortionOption {
  grams: number
  /** Why this portion is on offer: "di solito", "porzione". */
  note?: string
  /** This user has weighed out this amount before — the chip says so with the history icon. */
  fromHistory?: boolean
}

/**
 * How many chips one row can hold on a 375 px screen before it wraps into a
 * wall of numbers.
 */
const MAX_CHIPS = 5

/**
 * The portions on offer for a food, this user's own habits first.
 *
 * Standing defaults — 100 g, the pack's serving, a couple of round numbers —
 * only answer the first time a food is eaten. After that the honest answer is
 * "what you had last time", which is what `portions` carries.
 */
export function portionOptions(
  food: {
    servingSizeG?: number | null
    servingLabel?: string | null
    isLiquid?: boolean
  },
  portions?: FoodPortions,
): PortionOption[] {
  const remembered = portions?.topQuantities ?? []

  const standard = new Set<number>([100])
  if (food.servingSizeG) standard.add(food.servingSizeG)
  if (food.isLiquid) {
    standard.add(200)
    standard.add(250)
  } else {
    standard.add(50)
    standard.add(150)
  }

  const options: PortionOption[] = remembered.map((grams, index) => ({
    grams,
    // Only the top one is labelled: three chips all claiming to be the usual
    // portion would say nothing. The icon still marks all of them as this
    // user's own amounts rather than the app's round numbers.
    note: index === 0 && (portions?.times ?? 0) > 1 ? 'di solito' : undefined,
    fromHistory: true,
  }))

  for (const grams of [...standard].sort((a, b) => a - b)) {
    if (options.length >= MAX_CHIPS) break
    if (remembered.includes(grams)) continue
    options.push({
      grams,
      note:
        food.servingSizeG === grams && food.servingLabel
          ? 'porzione'
          : undefined,
    })
  }

  return options.slice(0, MAX_CHIPS)
}

export function PortionChips({
  options,
  value,
  unit,
  onSelect,
  className,
}: {
  options: PortionOption[]
  value: number
  unit: string
  onSelect: (grams: number) => void
  className?: string
}) {
  if (options.length === 0) return null

  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      {options.map((option) => (
        <button
          key={option.grams}
          type="button"
          onClick={() => onSelect(option.grams)}
          aria-pressed={value === option.grams}
          aria-label={
            option.fromHistory
              ? `${option.grams} ${unit}, dalla cronologia`
              : undefined
          }
          title={option.fromHistory ? 'Porzione dalla cronologia' : undefined}
          className={cn(
            'tabular inline-flex h-11 items-center gap-1.5 rounded-full px-4 text-xs font-semibold transition-colors',
            value === option.grams
              ? 'bg-primary text-primary-foreground'
              : 'bg-secondary text-secondary-foreground',
          )}
        >
          {option.fromHistory ? (
            <History
              className={cn(
                'size-3.5 shrink-0',
                value !== option.grams && 'text-primary-strong',
              )}
              strokeWidth={2.4}
              aria-hidden
            />
          ) : null}
          <span>
            {option.grams} {unit}
            {option.note ? ` · ${option.note}` : ''}
          </span>
        </button>
      ))}
    </div>
  )
}
