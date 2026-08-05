import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { CopyPlus, PencilLine, Search } from 'lucide-react'

/**
 * The three secondary ways in. Scanning is not here on purpose — it lives on
 * the lime button in the bottom bar, reachable from every screen, so each
 * action appears exactly once.
 */
export function ActionTiles({
  day,
  onCopyYesterday,
  copying,
}: {
  day: string
  onCopyYesterday: () => void
  copying?: boolean
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      <Tile to={`/add?day=${day}`} icon={<Search />} label="Cerca" />
      <Tile
        onClick={onCopyYesterday}
        icon={<CopyPlus />}
        label="Copia ieri"
        disabled={copying}
      />
      <Tile to={`/food/new?day=${day}`} icon={<PencilLine />} label="Crea" />
    </div>
  )
}

const TILE =
  'bg-card shadow-soft flex h-[72px] flex-col items-center justify-center gap-1.5 rounded-3xl transition-transform active:scale-[0.97] disabled:opacity-50 [&_svg]:size-5 [&_svg]:text-primary-strong'

function Tile({
  to,
  onClick,
  icon,
  label,
  disabled,
}: {
  to?: string
  onClick?: () => void
  icon: ReactNode
  label: string
  disabled?: boolean
}) {
  const body = (
    <>
      {icon}
      <span className="text-[11px] font-semibold">{label}</span>
    </>
  )

  if (to) {
    return (
      <Link to={to} className={TILE}>
        {body}
      </Link>
    )
  }

  return (
    <button type="button" onClick={onClick} disabled={disabled} className={TILE}>
      {body}
    </button>
  )
}
