import { grams, progress } from '@/lib/format'
import { cn } from '@/lib/utils'

export type MacroKey = 'carbs' | 'fat' | 'protein'

export const MACRO_META: Record<
  MacroKey,
  { label: string; bar: string; dot: string; text: string }
> = {
  carbs: {
    label: 'Carboidrati',
    bar: 'bg-carbs',
    dot: 'bg-carbs',
    text: 'text-carbs',
  },
  fat: { label: 'Grassi', bar: 'bg-fat', dot: 'bg-fat', text: 'text-fat' },
  protein: {
    label: 'Proteine',
    bar: 'bg-protein',
    dot: 'bg-protein',
    text: 'text-protein',
  },
}

interface MacroBarProps {
  macro: MacroKey
  value: number
  target: number
}

export function MacroBar({ macro, value, target }: MacroBarProps) {
  const meta = MACRO_META[macro]
  const filled = progress(value, target)
  const over = value > target

  return (
    <div className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1">
      <span className="text-muted-foreground col-start-1 text-xs">
        {meta.label}
      </span>
      <span className="tabular col-start-2 justify-self-end text-xs font-semibold">
        {grams(value)}
        <span className="text-muted-foreground font-normal">
          {' / '}
          {grams(target)} g
        </span>
      </span>

      <span className="tabular col-start-1 text-sm font-bold">
        {Math.round(filled)}%
      </span>
      <div className="bg-secondary col-start-2 h-2 overflow-hidden rounded-full">
        <div
          className={cn(
            'h-full rounded-full transition-[width] duration-700 ease-out',
            over ? 'bg-destructive/70' : meta.bar,
          )}
          style={{ width: `${Math.min(100, filled)}%` }}
        />
      </div>
    </div>
  )
}

interface MacroBarsProps {
  carbs: { value: number; target: number }
  fat: { value: number; target: number }
  protein: { value: number; target: number }
  className?: string
}

export function MacroBars({ carbs, fat, protein, className }: MacroBarsProps) {
  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <MacroBar macro="carbs" {...carbs} />
      <MacroBar macro="fat" {...fat} />
      <MacroBar macro="protein" {...protein} />
    </div>
  )
}
