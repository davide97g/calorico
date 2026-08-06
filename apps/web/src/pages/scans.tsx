import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Barcode, Camera, ScanLine } from 'lucide-react'
import { AppShell } from '@/components/layout/app-shell'
import { UserAvatar } from '@/components/user-avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Panel } from '@/components/ui/panel'
import { Skeleton } from '@/components/ui/skeleton'
import { useScans } from '@/hooks/use-scans'
import { dayOf, dayTimeLabel, labelForDay } from '@/lib/date'
import type { ScanEvent } from '@/lib/types'

export default function ScansPage() {
  const navigate = useNavigate()
  const scans = useScans()

  const items = scans.data?.pages.flatMap((page) => page.items) ?? []

  // Grouped by calendar day so a busy shopping trip reads as one block.
  const days: { day: string; scans: ScanEvent[] }[] = []
  for (const scan of items) {
    const day = dayOf(scan.createdAt)
    const last = days.at(-1)
    if (last?.day === day) last.scans.push(scan)
    else days.push({ day, scans: [scan] })
  }

  return (
    <AppShell>
      <header className="flex items-center gap-3 px-1">
        <Button
          variant="secondary"
          size="icon"
          className="rounded-full"
          onClick={() => navigate(-1)}
          aria-label="Indietro"
        >
          <ArrowLeft />
        </Button>
        <h1 className="text-[17px] font-bold">Scansioni</h1>
      </header>

      {scans.isLoading ? (
        <div className="mt-3 flex flex-col gap-2">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-[68px] rounded-[24px]" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <Panel className="mt-3 flex flex-col items-center px-6 py-12 text-center">
          <span className="bg-primary/55 flex size-16 items-center justify-center rounded-[22px]">
            <ScanLine className="text-primary-foreground size-7" />
          </span>
          <h2 className="mt-4 text-base font-bold">Ancora nessuna scansione</h2>
          <p className="text-muted-foreground mt-1 max-w-56 text-sm">
            Codici a barre e foto dei pasti finiscono qui, con chi li ha
            scansionati e quando.
          </p>
        </Panel>
      ) : (
        <>
          {days.map(({ day, scans: dayScans }) => (
            <section key={day} className="mt-4">
              <h2 className="text-muted-foreground px-2 text-[11px] font-bold tracking-[0.16em] uppercase">
                {labelForDay(day)}
              </h2>
              <Panel className="mt-2 overflow-hidden p-1.5">
                <ul>
                  {dayScans.map((scan) => (
                    <li key={scan.id}>
                      <ScanRow
                        scan={scan}
                        onOpen={
                          scan.foodId
                            ? () => navigate(`/food/${scan.foodId}`)
                            : undefined
                        }
                      />
                    </li>
                  ))}
                </ul>
              </Panel>
            </section>
          ))}

          {scans.hasNextPage ? (
            <Button
              variant="secondary"
              className="mt-4 w-full rounded-full"
              disabled={scans.isFetchingNextPage}
              onClick={() => void scans.fetchNextPage()}
            >
              {scans.isFetchingNextPage ? 'Carico…' : 'Mostra altre'}
            </Button>
          ) : null}
        </>
      )}
    </AppShell>
  )
}

function ScanRow({
  scan,
  onOpen,
}: {
  scan: ScanEvent
  onOpen?: () => void
}) {
  const Icon = scan.kind === 'photo' ? Camera : Barcode

  const body = (
    <>
      <span className="bg-secondary flex size-10 shrink-0 items-center justify-center rounded-[16px]">
        <Icon className="text-muted-foreground size-5" />
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">
          {scan.nameSnapshot}
        </span>
        {scan.brandSnapshot ? (
          <span className="text-muted-foreground block truncate text-[11px]">
            {scan.brandSnapshot}
          </span>
        ) : null}
        <span className="text-muted-foreground mt-1 flex items-center gap-1.5 text-[11px]">
          <UserAvatar
            user={scan.scannedBy}
            className="size-4"
            fallbackClassName="text-[7px]"
          />
          <span className="truncate">
            {scan.scannedBy.name} · {dayTimeLabel(scan.createdAt)}
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
    'flex min-h-[72px] w-full items-center gap-3 rounded-[22px] px-2.5 py-2 text-left'

  if (!onOpen) return <div className={className}>{body}</div>

  return (
    <button
      type="button"
      onClick={onOpen}
      className={`${className} hover:bg-secondary/70 transition-colors`}
    >
      {body}
    </button>
  )
}
