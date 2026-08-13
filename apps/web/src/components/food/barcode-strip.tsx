import { useEffect, useState } from 'react'
import { Copy, Maximize2, X } from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { encodeBarcode, type Barcode } from '@/lib/barcode'
import { cn } from '@/lib/utils'

/**
 * The code of a packaged food, drawn back as the symbol it was scanned from.
 *
 * On the food's page it stays a quiet one-line strip — the number is a detail of
 * the product, not the reason anyone opened the screen. Tapping it is what makes
 * it useful: the symbol fills a white screen, big enough and bright enough for
 * someone else's phone to scan straight off the glass, which is how you hand a
 * food to a friend without typing thirteen digits at each other.
 *
 * Only well-formed GTINs get here; see lib/barcode.ts.
 */
export function BarcodeStrip({
  barcode,
  name,
  className,
}: {
  barcode: string | null
  name: string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const code = encodeBarcode(barcode)
  if (!code) return null

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'bg-secondary/70 flex h-11 w-full items-center gap-3 rounded-md px-3 transition-transform active:scale-[0.98]',
          className,
        )}
        aria-label={`Mostra il codice a barre ${code.digits} a schermo pieno`}
      >
        <BarcodeGlyph code={code} className="text-foreground/80 h-5 min-w-0 flex-1" />
        <span className="tabular text-muted-foreground shrink-0 text-micro font-semibold">
          {code.digits}
        </span>
        <Maximize2 className="text-muted-foreground size-3.5 shrink-0" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          showCloseButton={false}
          // A code is read by a camera, so this screen is a lamp: white to the
          // edges in either theme, black bars, nothing else competing for the
          // exposure. The radius ladder and the app's palette both stop here.
          className="top-0 left-0 flex h-dvh w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none border-0 bg-white p-0 text-black sm:max-w-none"
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          <ScreenAwake />
          <div className="flex flex-1 flex-col px-5 pt-[max(1.25rem,env(safe-area-inset-top))] pb-[max(1.25rem,env(safe-area-inset-bottom))]">
            <header className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-micro font-bold tracking-wide text-black/45 uppercase">
                  Codice a barre
                </p>
                <DialogTitle className="mt-1 truncate text-base font-bold text-black">
                  {name}
                </DialogTitle>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="grid size-11 shrink-0 place-items-center rounded-full bg-black/6 text-black active:scale-95"
                aria-label="Chiudi il codice a barre"
              >
                <X className="size-5" />
              </button>
            </header>

            {/* The symbol keeps a phone's width even on a laptop: past that it
                stops looking like a label and starts looking like a fence. */}
            <div className="mx-auto flex w-full max-w-sm flex-1 flex-col items-center justify-center gap-5">
              <BarcodeGlyph
                code={code}
                descenders
                className="h-[38vh] max-h-72 w-full text-black"
              />
              {/* Split the way the symbol is: the parity digit outside the
                  bars, then the two halves the middle guard separates. */}
              <p className="tabular flex w-full items-baseline justify-center gap-4 text-lg font-semibold text-black">
                {code.groups.map((group, index) => (
                  <span key={index} className="tracking-[0.3em]">
                    {group}
                  </span>
                ))}
              </p>
            </div>

            <footer className="flex flex-col items-center gap-3">
              <DialogDescription className="max-w-xs text-center text-xs text-black/50">
                Inquadralo con un altro telefono per trovare lo stesso alimento.
              </DialogDescription>
              <button
                type="button"
                onClick={() => copyDigits(code.digits)}
                className="flex h-11 items-center gap-2 rounded-full bg-black/6 px-5 text-sm font-semibold text-black active:scale-[0.98]"
              >
                <Copy className="size-4" />
                Copia il numero
              </button>
            </footer>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

/**
 * The bars themselves. Widths are in modules, and the viewBox is stretched
 * horizontally on purpose: a barcode may be any width as long as every bar
 * scales with it, and `crispEdges` keeps the thin ones from blurring into
 * their neighbours at fractional device pixels.
 */
function BarcodeGlyph({
  code,
  descenders = false,
  className,
}: {
  code: Barcode
  descenders?: boolean
  className?: string
}) {
  const height = 100
  // Guards run the full height; on the large symbol the rest stop short of it,
  // the notch the printed number sits in.
  const short = descenders ? 92 : height
  return (
    <svg
      viewBox={`0 0 ${code.width} ${height}`}
      preserveAspectRatio="none"
      shapeRendering="crispEdges"
      className={className}
      role="img"
      aria-label={`Codice a barre ${code.digits}`}
    >
      {code.bars.map((bar) => (
        <rect
          key={bar.x}
          x={bar.x}
          y={0}
          width={bar.width}
          height={bar.guard ? height : short}
          fill="currentColor"
        />
      ))}
    </svg>
  )
}

/**
 * Holds the screen on while the code is up. Someone else is aiming a camera at
 * it, and the display dimming halfway through that is the one failure this
 * screen can actually prevent. Absent on most browsers — then it does nothing.
 */
function ScreenAwake() {
  useEffect(() => {
    const wakeLock = (
      navigator as Navigator & {
        wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> }
      }
    ).wakeLock
    if (!wakeLock) return
    let sentinel: { release: () => Promise<void> } | null = null
    let released = false
    wakeLock
      .request('screen')
      .then((lock) => {
        sentinel = lock
        // Unmounted before the request resolved: let it go straight away.
        if (released) void lock.release().catch(() => {})
      })
      .catch(() => {})
    return () => {
      released = true
      void sentinel?.release().catch(() => {})
    }
  }, [])
  return null
}

async function copyDigits(digits: string) {
  try {
    await navigator.clipboard.writeText(digits)
    toast.success('Numero copiato')
  } catch {
    toast.error('Copia non riuscita')
  }
}
