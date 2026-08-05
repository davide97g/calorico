import { Zap } from 'lucide-react'
import { CalorieRing } from '@/components/charts/calorie-ring'
import { kcal } from '@/lib/format'

interface DailyIntakeCardProps {
  consumed: number
  target: number
}

/**
 * The lime hero card: percentage of the day's target on the left, ring on the
 * right, remaining calories underneath.
 */
export function DailyIntakeCard({ consumed, target }: DailyIntakeCardProps) {
  const ratio = target > 0 ? consumed / target : 0
  const percent = Math.round(ratio * 100)
  const remaining = target - consumed

  return (
    <section className="bg-primary text-primary-foreground shadow-soft relative overflow-hidden rounded-[28px] p-4">
      <div className="flex items-center gap-2">
        <span className="bg-primary-foreground/12 flex size-8 items-center justify-center rounded-full">
          <Zap className="size-4" strokeWidth={2.4} />
        </span>
        <h2 className="text-[15px] font-semibold">Consumo giornaliero</h2>
      </div>

      <div className="mt-2 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="tabular text-[44px] leading-none font-extrabold tracking-tight">
            {percent}%
          </p>
          <p className="text-primary-foreground/75 mt-2 text-xs font-medium">
            {remaining >= 0
              ? `${kcal(remaining)} kcal rimanenti`
              : `${kcal(-remaining)} kcal oltre il target`}
          </p>
        </div>

        <CalorieRing value={consumed} target={target} />
      </div>
    </section>
  )
}
