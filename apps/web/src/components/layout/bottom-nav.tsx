import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { ChartColumn, House, Scale, ShoppingBasket, Zap } from 'lucide-react'
import { QuickLogSheet } from '@/components/food/quick-log-sheet'
import { cn } from '@/lib/utils'

/**
 * Four destinations and one action. The account used to sit here as a fifth tab
 * and it was the wrong kind of thing in the wrong place: a bar of five is a bar
 * nobody aims at, and settings are not a daily destination. It moved to the
 * avatar in the top bar, which freed the slot the diary was missing — where the
 * days you have already logged add up. See components/layout/top-bar.tsx.
 */
const leftItems = [
  { to: '/', icon: House, label: 'Oggi' },
  { to: '/stats', icon: ChartColumn, label: 'Analisi' },
] as const

const rightItems = [
  { to: '/grocery', icon: ShoppingBasket, label: 'Spesa' },
  { to: '/weight', icon: Scale, label: 'Peso' },
] as const

export function BottomNav() {
  const [logging, setLogging] = useState(false)

  return (
    <>
      <nav className="bg-card/90 border-border/70 supports-[backdrop-filter]:bg-card/70 absolute inset-x-0 bottom-0 z-20 h-[calc(var(--nav-h)+env(safe-area-inset-bottom))] border-t px-3 pt-1.5 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl">
        <ul className="flex items-start justify-between">
          {leftItems.map((item) => (
            <NavItem key={item.to} {...item} />
          ))}

          {/* Logging a food already eaten before is the whole daily job, so it
              gets the signature lime and the only oversized target in the bar.
              Scanning used to sit here, and scanning is for food that is new. */}
          <li className="-mt-7">
            <button
              type="button"
              onClick={() => setLogging(true)}
              className="bg-primary text-primary-foreground shadow-float flex size-16 flex-col items-center justify-center gap-0.5 rounded-full transition-transform active:scale-95"
              aria-label="Registra un alimento"
            >
              <Zap className="size-6" strokeWidth={2.4} />
              <span className="text-micro leading-none font-bold">LOG</span>
            </button>
          </li>

          {rightItems.map((item) => (
            <NavItem key={item.to} {...item} />
          ))}
        </ul>
      </nav>

      <QuickLogSheet open={logging} onOpenChange={setLogging} />
    </>
  )
}

function NavItem({
  to,
  icon: Icon,
  label,
}: {
  to: string
  icon: typeof House
  label: string
}) {
  return (
    <li>
      <NavLink
        to={to}
        end={to === '/'}
        // Labels, not icons alone: an icon-only bar makes the user guess.
        className={({ isActive }) =>
          cn(
            'flex h-12 w-16 flex-col items-center justify-start gap-1 rounded-md pt-1.5 transition-colors',
            isActive ? 'text-primary-strong' : 'text-muted-foreground',
          )
        }
      >
        <Icon className="size-5" strokeWidth={2.2} />
        <span className="text-micro leading-none font-semibold">{label}</span>
      </NavLink>
    </li>
  )
}
