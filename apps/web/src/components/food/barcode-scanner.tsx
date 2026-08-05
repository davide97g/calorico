import { useEffect, useRef, useState } from 'react'
import type { IScannerControls } from '@zxing/browser'
import { Loader2, RefreshCw, ScanBarcode } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'

interface BarcodeScannerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onDetected: (code: string) => void
  isLoading?: boolean
}

/**
 * ZXing supplies barcode decoding where native BarcodeDetector is unavailable,
 * including desktop Safari and iOS PWAs.
 */
export function BarcodeScanner({
  open,
  onOpenChange,
  onDetected,
  isLoading,
}: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [manual, setManual] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const detectedRef = useRef(onDetected)

  useEffect(() => {
    detectedRef.current = onDetected
  }, [onDetected])

  useEffect(() => {
    if (!open) return

    setError(null)
    let controls: IScannerControls | undefined
    let cancelled = false
    let detected = false
    let startFrame = 0

    const start = async () => {
      try {
        const video = videoRef.current
        if (!video) throw new Error('Video non disponibile')
        // Keep the decoder out of first paint: food scanning is optional, and
        // ZXing is only needed after the sheet is deliberately opened.
        const [
          { BrowserMultiFormatReader },
          { BarcodeFormat, DecodeHintType },
        ] = await Promise.all([
          import('@zxing/browser'),
          import('@zxing/library'),
        ])
        if (cancelled) return
        // Ask for the full camera resolution. Default browser constraints can
        // settle at 640 px, where narrow supermarket EAN bars are lost before
        // the decoder ever sees them. TRY_HARDER costs a little CPU, but gives
        // the one-dimensional reader more passes for small codes.
        const hints = new Map<any, any>([
          [DecodeHintType.TRY_HARDER, true],
          [DecodeHintType.POSSIBLE_FORMATS, [
            BarcodeFormat.EAN_13,
            BarcodeFormat.EAN_8,
            BarcodeFormat.UPC_A,
            BarcodeFormat.UPC_E,
          ]],
        ])
        const reader = new BrowserMultiFormatReader(hints)
        controls = await reader.decodeFromConstraints(
          {
            video: {
              facingMode: { ideal: 'environment' },
              width: { ideal: 1920 },
              height: { ideal: 1080 },
            },
            audio: false,
          },
          video,
          (result) => {
            const value = result?.getText()
            if (!value || detected || cancelled) return
            detected = true
            controls?.stop()
            detectedRef.current(value)
          },
        )
        if (cancelled) controls.stop()
      } catch (caught) {
        if (cancelled) return
        const name = caught instanceof DOMException ? caught.name : ''
        setError(
          name === 'NotAllowedError' || name === 'SecurityError'
            ? 'Fotocamera bloccata. Abilitala nelle impostazioni del browser o dell’app, poi riprova.'
            : 'Fotocamera non disponibile. Controlla permessi o chiudi le altre app che la usano.',
        )
      }
    }

    // On retry the error panel is currently mounted instead of the video. Let
    // React commit the cleared error and remount the video before ZXing reads
    // its ref; otherwise every retry fails with "Video non disponibile".
    startFrame = requestAnimationFrame(() => void start())

    return () => {
      cancelled = true
      cancelAnimationFrame(startFrame)
      controls?.stop()
    }
  }, [open, attempt])

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      {/* Vaul portals to the body, so the sheet has to be constrained to the
          phone column itself — otherwise it spans the whole desktop window. */}
      <DrawerContent className="mx-auto max-h-[94dvh] max-w-[440px] rounded-t-[28px]">
        <DrawerHeader className="shrink-0">
          <DrawerTitle>Scansiona il codice a barre</DrawerTitle>
          <DrawerDescription>
            Inquadra il codice sulla confezione, oppure digitalo.
          </DrawerDescription>
        </DrawerHeader>

        <div className="min-h-0 overflow-y-auto px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          {!error ? (
            <div className="bg-foreground/90 relative mb-4 h-[min(56dvh,440px)] w-full overflow-hidden rounded-3xl">
              <video
                ref={videoRef}
                muted
                playsInline
                className="size-full object-cover"
              />
              <div className="border-primary pointer-events-none absolute inset-x-5 inset-y-[22%] rounded-2xl border-2 shadow-[0_0_0_999px_oklch(0.08_0.015_145_/_0.28)]" />
              <p className="bg-foreground/65 text-background pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-1 text-[11px] font-semibold whitespace-nowrap">
                Centra il codice nel riquadro
              </p>
              {isLoading ? (
                <div className="bg-foreground/40 absolute inset-0 flex items-center justify-center">
                  <Loader2 className="text-background size-6 animate-spin" />
                </div>
              ) : null}
            </div>
          ) : (
            <div className="mb-4 rounded-2xl bg-secondary p-3">
              <p className="text-muted-foreground text-sm">{error}</p>
              <Button
                type="button"
                variant="secondary"
                className="mt-3 rounded-xl"
                onClick={() => setAttempt((value) => value + 1)}
              >
                <RefreshCw className="size-4" />
                Riprova fotocamera
              </Button>
            </div>
          )}

          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              const code = manual.replace(/\D/g, '')
              if (code.length >= 6) onDetected(code)
            }}
          >
            <Input
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              inputMode="numeric"
              placeholder="8000500310427"
              className="h-11 rounded-2xl"
              aria-label="Codice a barre"
            />
            <Button
              type="submit"
              className="h-11 rounded-2xl"
              disabled={isLoading || manual.replace(/\D/g, '').length < 6}
            >
              {isLoading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <ScanBarcode className="size-4" />
              )}
              Cerca
            </Button>
          </form>
        </div>
      </DrawerContent>
    </Drawer>
  )
}
