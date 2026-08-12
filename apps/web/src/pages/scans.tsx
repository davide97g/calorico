import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Barcode, Camera, Loader2, ScanLine, Search } from 'lucide-react'
import { AppShell } from '@/components/layout/app-shell'
import { UserAvatar } from '@/components/user-avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Panel } from '@/components/ui/panel'
import { Skeleton } from '@/components/ui/skeleton'
import { useScans } from '@/hooks/use-scans'
import { dayTimeLabel } from '@/lib/date'
import type { ScanHistoryItem } from '@/lib/types'

export default function ScansPage() {
  const navigate = useNavigate()
  const [term, setTerm] = useState('')
  const [debounced, setDebounced] = useState('')

  useEffect(() => {
    const id = setTimeout(() => setDebounced(term.trim()), 200)
    return () => clearTimeout(id)
  }, [term])

  const scans = useScans(debounced)
  const items = scans.data?.pages.flatMap((page) => page.items) ?? []
  const filtering = Boolean(debounced) && scans.isFetching

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
        <div className="min-w-0">
          <h1 className="text-lg font-bold">Scansioni</h1>
          {/* The order is not obvious from the rows, so it is spelled out. */}
          <p className="text-muted-foreground text-micro">
            Dalle più frequenti e recenti
          </p>
        </div>
      </header>

      <div className="relative mt-3">
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2" />
        {filtering ? (
          <Loader2 className="text-muted-foreground absolute top-1/2 right-4 size-4 -translate-y-1/2 animate-spin" />
        ) : null}
        <Input
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder="Cerca nelle scansioni…"
          aria-label="Cerca nelle scansioni"
          className="bg-card shadow-soft h-12 rounded-full border-transparent pr-11 pl-11 text-sm"
        />
      </div>

      {scans.isLoading ? (
        <div className="mt-3 flex flex-col gap-2">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-[68px] rounded-lg" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <Panel className="mt-3 flex flex-col items-center px-6 py-12 text-center">
          <span className="bg-primary/55 flex size-16 items-center justify-center rounded-lg">
            <ScanLine className="text-primary-foreground size-7" />
          </span>
          <h2 className="mt-4 text-base font-bold">
            {debounced ? 'Nessuna corrispondenza' : 'Ancora nessuna scansione'}
          </h2>
          <p className="text-muted-foreground mt-1 max-w-56 text-sm">
            {debounced
              ? `Niente di scansionato che somigli a “${debounced}”.`
              : 'Codici a barre e foto dei pasti finiscono qui, con chi li ha scansionati e quando.'}
          </p>
        </Panel>
      ) : (
        <>
          <Panel className="mt-3 overflow-hidden p-1.5">
            <ul>
              {items.map((scan) => (
                <li key={scan.key}>
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
    'flex min-h-[72px] w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left'

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
