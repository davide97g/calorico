import { useEffect, useRef, useState } from 'react'
import { Loader2, ScanBarcode } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'

interface BarcodeDetectorLike {
  detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]>
}

interface BarcodeScannerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onDetected: (code: string) => void
  isLoading?: boolean
}

/**
 * Uses the native BarcodeDetector where available (Chrome, Android, recent
 * Safari on iOS 17+ behind a flag). Everywhere else the manual EAN field is the
 * scanner — no 300 kB WASM decoder for a personal app.
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
  const [supported, setSupported] = useState(false)

  useEffect(() => {
    setSupported('BarcodeDetector' in window)
  }, [])

  useEffect(() => {
    if (!open || !('BarcodeDetector' in window)) return

    let stream: MediaStream | undefined
    let raf = 0
    let cancelled = false

    const start = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        })
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        const video = videoRef.current
        if (!video) return
        video.srcObject = stream
        await video.play()

        const Detector = (
          window as unknown as {
            BarcodeDetector: new (o: { formats: string[] }) => BarcodeDetectorLike
          }
        ).BarcodeDetector
        const detector = new Detector({
          formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'],
        })

        const tick = async () => {
          if (cancelled || !videoRef.current) return
          try {
            const codes = await detector.detect(videoRef.current)
            const value = codes[0]?.rawValue
            if (value) {
              onDetected(value)
              return
            }
          } catch {
            // A single failed frame is normal; keep polling.
          }
          raf = requestAnimationFrame(() => void tick())
        }
        void tick()
      } catch {
        setError(
          'Fotocamera non disponibile. Inserisci il codice a barre manualmente.',
        )
      }
    }

    void start()

    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [open, onDetected])

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      {/* Vaul portals to the body, so the sheet has to be constrained to the
          phone column itself — otherwise it spans the whole desktop window. */}
      <DrawerContent className="mx-auto max-h-[88dvh] max-w-[440px] rounded-t-[28px]">
        <DrawerHeader className="shrink-0">
          <DrawerTitle>Scansiona il codice a barre</DrawerTitle>
          <DrawerDescription>
            Inquadra il codice sulla confezione, oppure digitalo.
          </DrawerDescription>
        </DrawerHeader>

        <div className="min-h-0 overflow-y-auto px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          {supported && !error ? (
            <div className="bg-foreground/90 relative mb-4 h-[min(46dvh,320px)] w-full overflow-hidden rounded-3xl">
              <video
                ref={videoRef}
                muted
                playsInline
                className="size-full object-cover"
              />
              <div className="border-primary pointer-events-none absolute inset-x-8 inset-y-1/3 rounded-2xl border-2" />
              {isLoading ? (
                <div className="bg-foreground/40 absolute inset-0 flex items-center justify-center">
                  <Loader2 className="text-background size-6 animate-spin" />
                </div>
              ) : null}
            </div>
          ) : (
            <p className="text-muted-foreground mb-4 text-sm">
              {error ??
                'Il tuo browser non supporta la scansione. Inserisci il codice a barre qui sotto.'}
            </p>
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
