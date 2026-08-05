import type { ComponentProps, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * The rounded white card every screen is built from. Kept separate from the
 * shadcn Card so the radius, padding and elevation stay consistent everywhere.
 */
export function Panel({ className, ...props }: ComponentProps<'section'>) {
  return (
    <section
      className={cn(
        'bg-card text-card-foreground shadow-soft rounded-[28px] p-4',
        className,
      )}
      {...props}
    />
  )
}

interface PanelHeaderProps {
  icon?: ReactNode
  title: ReactNode
  action?: ReactNode
  /** Renders the whole header as a link with a chevron, like the mock. */
  to?: string
  className?: string
}

export function PanelHeader({
  icon,
  title,
  action,
  to,
  className,
}: PanelHeaderProps) {
  const content = (
    <>
      <span className="flex min-w-0 items-center gap-2.5">
        {icon ? (
          <span className="bg-secondary text-foreground/70 flex size-8 shrink-0 items-center justify-center rounded-full [&_svg]:size-4">
            {icon}
          </span>
        ) : null}
        <span className="truncate text-[15px] leading-none font-semibold">
          {title}
        </span>
      </span>
      {action ?? (to ? <ChevronRight className="text-muted-foreground size-5" /> : null)}
    </>
  )

  if (to) {
    return (
      <Link
        to={to}
        className={cn(
          'flex items-center justify-between gap-2 rounded-2xl transition-opacity active:opacity-60',
          className,
        )}
      >
        {content}
      </Link>
    )
  }

  return (
    <div className={cn('flex items-center justify-between gap-2', className)}>
      {content}
    </div>
  )
}

export function Stat({
  label,
  value,
  hint,
  className,
}: {
  label: ReactNode
  value: ReactNode
  hint?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col gap-0.5', className)}>
      <span className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
        {label}
      </span>
      <span className="tabular text-lg leading-tight font-bold">{value}</span>
      {hint ? (
        <span className="text-muted-foreground text-xs">{hint}</span>
      ) : null}
    </div>
  )
}
