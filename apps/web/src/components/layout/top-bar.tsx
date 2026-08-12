import type { ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { UserAvatar } from '@/components/user-avatar'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks/use-auth'
import { cn } from '@/lib/utils'

interface TopBarProps {
  title?: ReactNode
  /** Small line above the title: context the title itself should not carry. */
  eyebrow?: ReactNode
  /** Renders the back chevron. A string is a destination; `true` is history. */
  back?: boolean | string
  /** Screen-specific controls, left of the avatar. */
  action?: ReactNode
  /** Off on the personal area itself, where it would link to the page you are on. */
  avatar?: boolean
  /**
   * Takes over the title slot: a screen whose top row is a control, not a
   * heading, puts that control here instead of pushing it onto a second row.
   */
  children?: ReactNode
  className?: string
}

/**
 * The bar every screen starts with. It exists for one reason: the account is
 * reachable from anywhere.
 *
 * The profile used to be a tab in the bottom bar, competing for a slot with the
 * things a diary is actually made of — the day, the stats, the shopping list,
 * the scale. Up here it costs no slot, stays visible on every screen, and reads
 * as what it is: not a place you work, a place you go and come back from. Which
 * is why the personal area is the one screen that renders this bar with a back
 * chevron and no avatar.
 */
export function TopBar({
  title,
  eyebrow,
  back,
  action,
  avatar = true,
  children,
  className,
}: TopBarProps) {
  const { user } = useAuth()
  const navigate = useNavigate()

  return (
    // 44px minimum whether or not anything is in it, so the content below
    // starts at the same height on every screen. A control in the title slot
    // can be taller than the avatar, so that row aligns to the top edge
    // instead of centring the avatar against it.
    <header
      className={cn(
        'mb-3 flex min-h-11 gap-2',
        children ? 'items-start' : 'items-center',
        className,
      )}
    >
      {back ? (
        <Button
          variant="secondary"
          size="icon"
          className="bg-card shadow-soft size-11 shrink-0 rounded-full"
          onClick={() =>
            typeof back === 'string' ? navigate(back) : navigate(-1)
          }
          aria-label="Torna indietro"
        >
          <ArrowLeft className="size-4" />
        </Button>
      ) : null}

      <div className="min-w-0 flex-1">
        {children ?? (
          <>
            {eyebrow ? (
              <p className="text-primary-strong truncate text-micro font-bold tracking-[0.16em] uppercase">
                {eyebrow}
              </p>
            ) : null}
            {title ? (
              <h1 className="truncate text-lg leading-tight font-bold">
                {title}
              </h1>
            ) : null}
          </>
        )}
      </div>

      {action}

      {avatar ? (
        <Link
          to="/profile"
          className="ring-card shadow-soft shrink-0 rounded-full ring-2 transition-opacity active:opacity-60"
          aria-label="Area personale"
        >
          <UserAvatar user={user} className="size-11" />
        </Link>
      ) : null}
    </header>
  )
}
