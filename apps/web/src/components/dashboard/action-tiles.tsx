import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { CopyPlus, PencilLine } from 'lucide-react'

/**
 * Secondary dashboard jobs. Food logging now has a dedicated, labelled card
 * above this row, so these never compete with the main action.
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
    <div className="grid grid-cols-2 gap-2">
      <Tile
        onClick={onCopyYesterday}
        icon={<CopyPlus />}
        label="Copia da ieri"
        disabled={copying}
      />
      <Tile to={`/food/new?day=${day}`} icon={<PencilLine />} label="Crea alimento" />
    </div>
  )
}

const TILE =
  'bg-card shadow-soft flex h-[64px] flex-row items-center justify-center gap-2 rounded-[22px] px-3 text-sm font-semibold transition-transform active:scale-[0.97] disabled:opacity-50 [&_svg]:size-5 [&_svg]:text-primary-strong'

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
