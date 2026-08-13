import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Camera, ImageUp, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { BrandLoader } from '@/components/ui/brand-loader'
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
import { PremiumSheet } from '@/components/premium/premium-sheet'
import { useAnalyzeMealPhoto, useVisionStatus } from '@/hooks/use-vision'
import { ApiError } from '@/lib/api'
import { compressImage } from '@/lib/image-compress'
import { todayISO } from '@/lib/date'
import { currentMeal } from '@/lib/format'
import type { Meal } from '@/lib/types'

interface PhotoMealSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  day?: string
  meal?: Meal
}

/**
 * A meal photo is worth more pixels than a gallery shot: the model reads
 * nutrition labels off it. 500 KB becomes ~667 KB once base64'd, which fits
 * inside the analyze route's 1 MB limit with room to spare.
 */
const ANALYSIS_COMPRESSION = { maxEdge: 1568, targetBytes: 500 * 1024 }

/** Strips the `data:image/webp;base64,` prefix — the API wants raw base64. */
function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('read_failed'))
    reader.onload = () => {
      const result = String(reader.result)
      const comma = result.indexOf(',')
      resolve(comma === -1 ? result : result.slice(comma + 1))
    }
    reader.readAsDataURL(blob)
  })
}

export function PhotoMealSheet({
  open,
  onOpenChange,
  day,
  meal,
}: PhotoMealSheetProps) {
  const navigate = useNavigate()
  const analyze = useAnalyzeMealPhoto()
  const quota = useVisionStatus().data?.quota
  const inputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [paywall, setPaywall] = useState(false)

  const outOfPhotos = quota?.remaining !== null && (quota?.remaining ?? 1) <= 0

  /**
   * The photo is not held back for after the paywall any more: paying leaves
   * this tab for Stripe, and a File cannot survive that. Whoever comes back
   * premium frames the plate again — one tap, and better than pretending an
   * upload is still waiting somewhere.
   */
  const handleFile = async (file: File) => {
    setError(null)
    // The server checks this too — this only saves a wasted round trip with a
    // megabyte of photo attached.
    if (outOfPhotos) {
      setPaywall(true)
      return
    }
    try {
      const { blob, contentType } = await compressImage(file, ANALYSIS_COMPRESSION)
      const analysis = await analyze.mutateAsync({
        image: await toBase64(blob),
        contentType,
      })

      onOpenChange(false)
      const d = day ?? todayISO()
      const m = meal ?? currentMeal()
      // The analysis travels in router state rather than a query string: it is
      // far too big for a URL, and it must not survive a refresh — a stale
      // estimate the user cannot see the photo for is worse than starting over.
      navigate(`/photo-review?day=${d}&meal=${m}`, { state: { analysis } })
    } catch (err) {
      // The allowance ran out between the status check and the upload.
      if (err instanceof ApiError && err.code === 'photo_quota_exceeded') {
        setPaywall(true)
        return
      }
      setError(
        err instanceof ApiError
          ? err.message
          : 'Non riesco a leggere questa immagine.',
      )
    }
  }

  const pick = () => inputRef.current?.click()

  return (
    <>
      <Drawer
        open={open}
        onOpenChange={(next) => {
          if (!analyze.isPending) onOpenChange(next)
        }}
      >
        <DrawerContent className="mx-auto max-h-[94dvh] max-w-[440px] rounded-t-xl">
          <DrawerHeader className="shrink-0">
            <DrawerTitle>Fotografa il pasto</DrawerTitle>
            <DrawerDescription>
              Inquadra tutto il piatto dall&apos;alto. Le quantità sono una stima:
              potrai correggerle prima di salvare.
            </DrawerDescription>
          </DrawerHeader>

          <div className="px-4 pb-8">
            {analyze.isPending ? (
              <div className="flex min-h-[220px] items-center justify-center">
                <BrandLoader label="Analizzo il piatto" />
              </div>
            ) : (
              <div className="space-y-3">
                <Button
                  type="button"
                  onClick={pick}
                  className="min-h-14 w-full gap-2 rounded-lg text-sm font-bold"
                >
                  <Camera className="size-5" strokeWidth={2.4} />
                  Scatta o scegli una foto
                </Button>

                <p className="text-muted-foreground flex items-start gap-2 px-1 text-micro font-medium">
                  <ImageUp className="mt-0.5 size-3.5 shrink-0" strokeWidth={2.4} />
                  La foto viene analizzata e subito scartata: non viene salvata da
                  nessuna parte.
                </p>

                {/* Only the free tier has anything to count. */}
                {quota && quota.remaining !== null ? (
                  <button
                    type="button"
                    onClick={() => setPaywall(true)}
                    className="text-muted-foreground flex w-full items-start gap-2 px-1 text-left text-micro font-medium"
                  >
                    <Sparkles className="mt-0.5 size-3.5 shrink-0" strokeWidth={2.4} />
                    {quota.remaining > 0
                      ? `Ti resta ${quota.remaining} foto gratuita su ${quota.limit}. Con Premium non ci sono limiti.`
                      : 'Hai usato la foto gratuita. Passa a Premium per continuare.'}
                  </button>
                ) : null}

                {error && (
                  <p className="text-destructive px-1 text-xs font-semibold">
                    {error}
                  </p>
                )}
              </div>
            )}

            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                // Reset so picking the same file twice still fires a change.
                e.target.value = ''
                if (file) void handleFile(file)
              }}
            />
          </div>
        </DrawerContent>
      </Drawer>

      <PremiumSheet
        open={paywall}
        onOpenChange={setPaywall}
        used={quota?.used}
        limit={quota?.limit}
      />
    </>
  )
}
