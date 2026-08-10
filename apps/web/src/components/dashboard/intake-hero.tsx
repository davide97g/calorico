import { Flame } from 'lucide-react'
import { useCountUp } from '@/hooks/use-motion'
import { kcal } from '@/lib/format'
import type { Goal } from '@/lib/types'
import { cn } from '@/lib/utils'

interface IntakeHeroProps {
  consumed: number
  target: number
  /** Top of the acceptable band: past this, the tint goes full strength. */
  max?: number
  /** Says "oggi" only when the diary is actually showing today. */
  label?: string
  /** A future day holds a plan, not a record: the wording follows. */
  planned?: boolean
  /** Eating past the target is a miss when cutting and a win when bulking. */
  goal?: Goal
}

/**
 * The one thing the screen is for: how much is left to eat today.
 *
 * Deliberately a single figure. The percentage, the totals and the gauge are
 * all support — the previous version showed the same fact four times and made
 * the actionable number the smallest text on the card.
 */
export function IntakeHero({
  consumed,
  target,
  max,
  label = 'Budget di oggi',
  planned = false,
  goal,
}: IntakeHeroProps) {
  const remaining = target - consumed
  const over = remaining < 0
  const percent = target > 0 ? Math.round((consumed / target) * 100) : 0

  const shown = useCountUp(Math.abs(remaining))

  // Keep the overage on the gauge instead of pinning the fill at 100%.
  const scale = Math.max(max ?? target, consumed, 1) * 1.06
  const fill = Math.min(100, (consumed / scale) * 100)
  const tick = (target / scale) * 100
  // Past the top of the acceptable band is the loud state; merely past the
  // target still sits inside the band and only gets a hint of the tint.
  const pastBand = consumed > (max ?? target)

  // A surplus is what a bulking user is aiming for, so it reads green; on a cut
  // (and when maintaining) the same surplus is the thing to notice, so it reads
  // red. Either way the tint is washed over the lime rather than replacing it —
  // the card stays recognisably the app's own.
  const tone = goal === 'gain' ? 'good' : 'warn'

  return (
    <section
      className={cn(
        'bg-primary text-primary-foreground shadow-float relative overflow-hidden rounded-[32px] p-5',
        over && 'ring-1 ring-inset',
        over && (tone === 'good' ? 'ring-over-good' : 'ring-over-warn'),
      )}
    >
      <span
        aria-hidden
        className={cn(
          'pointer-events-none absolute inset-0 bg-gradient-to-br from-transparent via-transparent transition-opacity duration-700',
          tone === 'good' ? 'to-over-good' : 'to-over-warn',
          over ? (pastBand ? 'opacity-100' : 'opacity-50') : 'opacity-0',
        )}
      />

      <div className="relative">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-[13px] font-semibold">
            <Flame className="size-4" strokeWidth={2.4} />
            {label}
          </h2>
          <span className="bg-primary-foreground/12 tabular rounded-full px-2.5 py-1 text-[11px] font-bold">
            {percent}%
          </span>
        </div>

        <p className="mt-4 flex items-end gap-2">
          <span className="font-display tabular text-[64px] leading-[0.82] font-extrabold tracking-[-0.03em]">
            {over ? '+' : ''}
            {kcal(shown)}
          </span>
          <span className="pb-1.5 text-sm font-bold">kcal</span>
        </p>
        <p className="text-primary-foreground/80 mt-2 text-[13px] font-semibold">
          {over
            ? tone === 'good'
              ? 'oltre il target, surplus in corso'
              : 'oltre il target'
            : planned
              ? 'ancora da pianificare'
              : 'ancora disponibili'}
        </p>

        <div className="mt-5">
          <div className="bg-primary-foreground/15 relative h-3 rounded-full">
            <span
              className="bg-primary-foreground absolute inset-y-0 left-0 rounded-full transition-[width] duration-700 ease-out"
              style={{ width: `${fill}%` }}
            />
            {/* One tick at the target, drawn last. Lime core with a dark ring so
                it stays visible whether the fill has reached it or not. */}
            <span
              className="bg-primary ring-primary-foreground/50 pointer-events-none absolute -inset-y-1 w-[3px] -translate-x-1/2 rounded-full ring-1"
              style={{ left: `${tick}%` }}
              aria-hidden
            />
          </div>
          <div className="text-primary-foreground/75 tabular mt-2 flex justify-between text-[11px] font-semibold">
            <span>
              {kcal(consumed)} {planned ? 'pianificate' : 'consumate'}
            </span>
            <span>obiettivo {kcal(target)}</span>
          </div>
        </div>
      </div>
    </section>
  )
}
