import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { House, Scale, ShoppingBasket, Zap } from 'lucide-react'
import { UserAvatar } from '@/components/user-avatar'
import { QuickLogSheet } from '@/components/food/quick-log-sheet'
import { useAuth } from '@/hooks/use-auth'
import { cn } from '@/lib/utils'

const leftItems = [
  { to: '/', icon: House, label: 'Oggi' },
  { to: '/grocery', icon: ShoppingBasket, label: 'Spesa' },
] as const

const rightItems = [{ to: '/weight', icon: Scale, label: 'Peso' }] as const

export function BottomNav() {
  const { user } = useAuth()
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
              <span className="text-[10px] leading-none font-bold">LOG</span>
            </button>
          </li>

          {rightItems.map((item) => (
            <NavItem key={item.to} {...item} />
          ))}

          <li>
            <NavLink
              to="/profile"
              className="flex w-16 flex-col items-center gap-1 rounded-2xl pt-1.5"
              aria-label="Profilo"
            >
              {({ isActive }) => (
                <>
                  <UserAvatar
                    user={user}
                    className={cn(
                      'size-6 transition-all',
                      isActive && 'ring-primary-strong ring-2 ring-offset-2 ring-offset-card',
                    )}
                    fallbackClassName="text-[9px]"
                  />
                  <span
                    className={cn(
                      'text-[10px] leading-none font-semibold',
                      isActive ? 'text-primary-strong' : 'text-muted-foreground',
                    )}
                  >
                    Profilo
                  </span>
                </>
              )}
            </NavLink>
          </li>
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
            'flex h-12 w-16 flex-col items-center justify-start gap-1 rounded-2xl pt-1.5 transition-colors',
            isActive ? 'text-primary-strong' : 'text-muted-foreground',
          )
        }
      >
        <Icon className="size-5" strokeWidth={2.2} />
        <span className="text-[10px] leading-none font-semibold">{label}</span>
      </NavLink>
    </li>
  )
}
