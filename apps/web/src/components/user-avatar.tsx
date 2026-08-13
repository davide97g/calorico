import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import type { PersonRef } from '@/lib/types'
import { cn } from '@/lib/utils'

/** First letters of the first two words: "Anna Rossi" reads as AR. */
function initialsOf(name: string | undefined | null) {
  return (
    name
      ?.trim()
      .split(/\s+/)
      .map((part) => part[0])
      .slice(0, 2)
      .join('')
      .toUpperCase() || '?'
  )
}

/**
 * One avatar for every place a person appears — the nav, the profile header,
 * a shared grocery row, the scan feed. Kept here so the initials fallback and
 * the ring treatment stay identical across all of them.
 */
export function UserAvatar({
  user,
  size = 'default',
  className,
  fallbackClassName,
  /** Overrides the plain name, for the places where the face needs a caption. */
  title,
}: {
  user: Pick<PersonRef, 'name' | 'avatarUrl'> | null | undefined
  size?: 'default' | 'sm' | 'lg'
  className?: string
  fallbackClassName?: string
  title?: string
}) {
  return (
    <Avatar
      size={size}
      className={className}
      title={title ?? user?.name ?? undefined}
    >
      {user?.avatarUrl ? (
        <AvatarImage src={user.avatarUrl} alt={user.name} />
      ) : null}
      <AvatarFallback
        className={cn('bg-secondary font-bold', fallbackClassName)}
      >
        {initialsOf(user?.name)}
      </AvatarFallback>
    </Avatar>
  )
}
