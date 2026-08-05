import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

interface CalorieRingProps {
  value: number
  target: number
  size?: number
  thickness?: number
  className?: string
  /** Colours for the light-on-lime variant used inside the intake card. */
  tone?: 'onPrimary' | 'default'
}

/**
 * Thick progress ring with an inset white disc, as in the design. Drawn by hand
 * rather than with a chart library: it is one arc, and the animation needs to
 * run on stroke-dashoffset.
 */
export function CalorieRing({
  value,
  target,
  size = 108,
  thickness = 13,
  className,
  tone = 'onPrimary',
}: CalorieRingProps) {
  const ratio = target > 0 ? value / target : 0
  const clamped = Math.max(0, Math.min(1, ratio))
  const over = ratio > 1

  const [progress, setProgress] = useState(0)
  useEffect(() => {
    // Mount at zero, then animate to the real value on the next frame.
    const id = requestAnimationFrame(() => setProgress(clamped))
    return () => cancelAnimationFrame(id)
  }, [clamped])

  const radius = (size - thickness) / 2
  const circumference = 2 * Math.PI * radius
  const center = size / 2

  const trackClass =
    tone === 'onPrimary' ? 'stroke-white/45' : 'stroke-ring-track'
  const arcClass = over
    ? 'stroke-destructive'
    : tone === 'onPrimary'
      ? 'stroke-[oklch(0.62_0.17_140)]'
      : 'stroke-primary'

  return (
    <div
      className={cn('relative shrink-0', className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${Math.round(value)} di ${target} kcal`}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          strokeWidth={thickness}
          className={trackClass}
          strokeLinecap="round"
        />
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          strokeWidth={thickness}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - progress)}
          className={cn(arcClass, 'transition-[stroke-dashoffset] duration-1000 ease-out')}
        />
      </svg>

      <div
        className="bg-card shadow-soft absolute flex flex-col items-center justify-center rounded-full"
        style={{
          inset: thickness + 4,
        }}
      >
        <span className="tabular text-[17px] leading-none font-bold">
          {Math.round(value)}
        </span>
        <span className="tabular text-muted-foreground mt-0.5 text-[11px] leading-none">
          {target}
        </span>
      </div>
    </div>
  )
}
