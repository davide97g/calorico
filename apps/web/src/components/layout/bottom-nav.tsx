import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { LayoutGrid, LineChart, Plus, Scale } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { useAuth } from '@/hooks/use-auth'
import { cn } from '@/lib/utils'

const items = [
  { to: '/', icon: LayoutGrid, label: 'Oggi' },
  { to: '/stats', icon: LineChart, label: 'Statistiche' },
] as const

const rightItems = [{ to: '/weight', icon: Scale, label: 'Peso' }] as const

export function BottomNav() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuth()

  const initials =
    user?.name
      ?.split(' ')
      .map((p) => p[0])
      .slice(0, 2)
      .join('')
      .toUpperCase() ?? '?'

  return (
    <nav className="bg-card/90 border-border/70 supports-[backdrop-filter]:bg-card/70 absolute inset-x-0 bottom-0 z-20 border-t px-4 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur-xl">
      <ul className="flex items-center justify-between">
        {items.map((item) => (
          <NavItem key={item.to} {...item} />
        ))}

        <li className="-mt-8">
          <button
            type="button"
            onClick={() =>
              navigate('/add', { state: { from: location.pathname } })
            }
            className="bg-foreground text-background shadow-float flex size-14 items-center justify-center rounded-full transition-transform active:scale-95"
            aria-label="Aggiungi alimento"
          >
            <Plus className="size-6" strokeWidth={2.5} />
          </button>
        </li>

        {rightItems.map((item) => (
          <NavItem key={item.to} {...item} />
        ))}

        <li>
          <NavLink
            to="/profile"
            className="block rounded-full ring-offset-2 transition-all"
            aria-label="Profilo"
          >
            {({ isActive }) => (
              <Avatar
                className={cn(
                  'size-9 transition-all',
                  isActive && 'ring-primary ring-2 ring-offset-2 ring-offset-card',
                )}
              >
                {user?.avatarUrl ? <AvatarImage src={user.avatarUrl} /> : null}
                <AvatarFallback className="bg-secondary text-xs font-semibold">
                  {initials}
                </AvatarFallback>
              </Avatar>
            )}
          </NavLink>
        </li>
      </ul>
    </nav>
  )
}

function NavItem({
  to,
  icon: Icon,
  label,
}: {
  to: string
  icon: typeof LayoutGrid
  label: string
}) {
  return (
    <li>
      <NavLink
        to={to}
        end={to === '/'}
        className={({ isActive }) =>
          cn(
            'flex size-11 items-center justify-center rounded-2xl transition-colors',
            isActive
              ? 'text-primary bg-primary/12'
              : 'text-muted-foreground hover:text-foreground',
          )
        }
        aria-label={label}
      >
        <Icon className="size-5" strokeWidth={2.2} />
      </NavLink>
    </li>
  )
}
