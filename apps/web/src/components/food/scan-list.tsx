import { Barcode, Camera } from 'lucide-react'
import { BarcodeButton } from '@/components/food/barcode-strip'
import { UserAvatar } from '@/components/user-avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Panel } from '@/components/ui/panel'
import { Skeleton } from '@/components/ui/skeleton'
import { useScans } from '@/hooks/use-scans'
import { dayTimeLabel } from '@/lib/date'
import { cn } from '@/lib/utils'
import type { ScanHistoryItem } from '@/lib/types'

/**
 * The shared scan history, wherever someone might want it.
 *
 * The feed belongs to the family, not to the phone that scanned — see
 * lib/history.ts on the server — so the same list is worth showing on the screen
 * where a food gets added, not only on its own page: the thing somebody else
 * brought home an hour ago is exactly what the next person is about to log, and
 * the avatar is what says it was them.
 */
export function ScanList({
  term = '',
  onOpen,
  empty,
  className,
}: {
  /** Filters the history by name, as the scans page's search field does. */
  term?: string
  /** Called for a scan that resolved to a food; rows without one are inert. */
  onOpen: (scan: ScanHistoryItem) => void
  /** What an empty history says for itself. */
  empty: string
  className?: string
}) {
  const scans = useScans(term)
  const items = scans.data?.pages.flatMap((page) => page.items) ?? []

  if (scans.isLoading) {
    return (
      <Panel className={cn('mt-2 flex flex-col gap-2 p-2', className)}>
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-16 rounded-md" />
        ))}
      </Panel>
    )
  }

  if (items.length === 0) {
    return (
      <Panel className={cn('mt-2 p-6', className)}>
        <p className="text-muted-foreground text-center text-sm">{empty}</p>
      </Panel>
    )
  }

  return (
    <>
      <Panel className={cn('mt-2 p-2', className)}>
        <ul>
          {items.map((scan) => (
            <li key={scan.key}>
              <ScanRow
                scan={scan}
                onOpen={scan.foodId ? () => onOpen(scan) : undefined}
              />
            </li>
          ))}
        </ul>
      </Panel>

      {scans.hasNextPage ? (
        <Button
          variant="secondary"
          className="mt-3 w-full rounded-full"
          disabled={scans.isFetchingNextPage}
          onClick={() => void scans.fetchNextPage()}
        >
          {scans.isFetchingNextPage ? 'Carico…' : 'Mostra altre'}
        </Button>
      ) : null}
    </>
  )
}

/**
 * One scanned item: what it was, who scanned it last, and — for anything that
 * came off a pack — its code, one tap away.
 */
export function ScanRow({
  scan,
  onOpen,
}: {
  scan: ScanHistoryItem
  onOpen?: () => void
}) {
  const Icon = scan.kind === 'photo' ? Camera : Barcode

  const body = (
    <>
      <span className="bg-secondary flex size-10 shrink-0 items-center justify-center rounded-md">
        <Icon className="text-muted-foreground size-5" />
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">
          {scan.nameSnapshot}
        </span>
        {scan.brandSnapshot ? (
          <span className="text-muted-foreground block truncate text-micro">
            {scan.brandSnapshot}
          </span>
        ) : null}
        <span className="text-muted-foreground mt-1 flex items-center gap-1.5 text-micro">
          <UserAvatar
            user={scan.scannedBy}
            className="size-4"
            fallbackClassName="text-[7px]"
          />
          {/* The avatar is whoever scanned it last, so the label says so. */}
          <span className="truncate">
            {scan.times > 1
              ? `${scan.times} volte · ultima ${dayTimeLabel(scan.lastAt)}, ${scan.scannedBy.name}`
              : `${scan.scannedBy.name} · ${dayTimeLabel(scan.lastAt)}`}
          </span>
        </span>
      </span>

      {scan.kind === 'photo' && scan.items?.length ? (
        <Badge variant="secondary" className="shrink-0">
          {scan.items.length} cibi
        </Badge>
      ) : null}
    </>
  )

  const className =
    'flex min-h-[72px] min-w-0 flex-1 items-center gap-3 rounded-lg px-2.5 py-2 text-left'

  return (
    <div className="flex items-center gap-1">
      {onOpen ? (
        <button
          type="button"
          onClick={onOpen}
          className={`${className} hover:bg-secondary/70 transition-colors`}
        >
          {body}
        </button>
      ) : (
        <div className={className}>{body}</div>
      )}

      {/* The code the row was born from, handed back: the shared history is
          where somebody looks for the pack that is no longer in the cupboard. */}
      <BarcodeButton barcode={scan.barcode} name={scan.nameSnapshot} />
    </div>
  )
}
