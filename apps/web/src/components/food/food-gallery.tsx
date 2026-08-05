import { useRef, useState } from 'react'
import { Camera, Loader2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Panel, PanelHeader } from '@/components/ui/panel'
import { Button } from '@/components/ui/button'
import {
  useDeleteFoodImage,
  useFoodImages,
  useUploadFoodImage,
} from '@/hooks/use-food-images'
import { ApiError } from '@/lib/api'
import { foodImageLarge } from '@/lib/food-image'
import { cn } from '@/lib/utils'
import type { FoodImage, FoodImageKind } from '@/lib/types'

const KIND_LABELS: Record<FoodImageKind, string> = {
  front: 'Prodotto',
  ingredients: 'Ingredienti',
  nutrition: 'Valori nutrizionali',
  user: 'La tua foto',
}

const UPLOAD_ERRORS: Record<string, string> = {
  uploads_disabled: 'Il caricamento foto non è configurato su questo server.',
  image_too_large: 'Foto troppo grande, riprova con uno scatto più leggero.',
  too_many_images: 'Hai già raggiunto il massimo di foto per questo alimento.',
}

/**
 * The only place real photos appear: the detail pages. Lists stay on emoji
 * tiles, so a packshot here is a deliberate look at the thing you logged.
 *
 * Shows the product shots that came with the food (front, ingredients, nutrition
 * label) plus your own photos — the shelf, the jar in your fridge, whatever
 * makes it recognisable next time. Only your own can be deleted.
 *
 * Pass `images` when the parent already loaded them with the food; otherwise the
 * component fetches them itself.
 */
export function FoodGallery({
  foodId,
  name,
  images,
  uploadEnabled,
}: {
  foodId: string | null | undefined
  name: string
  images?: FoodImage[]
  uploadEnabled?: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [broken, setBroken] = useState<string[]>([])

  // Only queries when the parent did not hand us the list already.
  const query = useFoodImages(images ? null : foodId)
  const upload = useUploadFoodImage(foodId ?? '')
  const remove = useDeleteFoodImage(foodId ?? '')

  const all = images ?? query.data?.items ?? []
  const canUpload =
    Boolean(foodId) && (uploadEnabled ?? query.data?.uploadEnabled ?? false)
  const shown = all.filter((image) => !broken.includes(image.id))

  if (shown.length === 0 && !canUpload && !upload.isPending) return null

  const pick = () => inputRef.current?.click()

  const onFile = (file: File | undefined) => {
    if (!file) return
    upload.mutate(file, {
      onSuccess: () => toast.success('Foto aggiunta'),
      onError: (err) => {
        const code = err instanceof ApiError ? err.code : 'upload_failed'
        toast.error(UPLOAD_ERRORS[code] ?? 'Caricamento non riuscito. Riprova.')
      },
    })
  }

  return (
    <Panel className="mt-3">
      <PanelHeader
        title="Foto"
        action={
          // With nothing to show, the placeholder tile below is the button.
          canUpload && shown.length > 0 ? (
            <Button
              variant="secondary"
              size="sm"
              className="rounded-full"
              onClick={pick}
              disabled={upload.isPending}
            >
              {upload.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Camera className="size-4" />
              )}
              Aggiungi
            </Button>
          ) : undefined
        }
      />

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          onFile(e.target.files?.[0])
          // Reset, or picking the same file twice does nothing.
          e.target.value = ''
        }}
      />

      {shown.length === 0 ? (
        <button
          type="button"
          onClick={pick}
          disabled={upload.isPending}
          className="border-border text-muted-foreground hover:bg-secondary/60 mt-3 flex h-32 w-full flex-col items-center justify-center gap-1.5 rounded-2xl border border-dashed text-xs transition-colors"
        >
          {upload.isPending ? (
            <Loader2 className="size-5 animate-spin" />
          ) : (
            <Camera className="size-5" />
          )}
          {upload.isPending ? 'Carico…' : 'Scatta o scegli una foto'}
        </button>
      ) : (
        // Packshots come in every aspect ratio, so each photo sets its own
        // shape inside a capped height instead of being cropped to a frame.
        <div
          className={cn(
            'no-scrollbar mt-3 flex gap-3 overflow-x-auto',
            shown.length > 1 ? 'snap-x snap-mandatory' : 'justify-center',
          )}
        >
          {shown.map((image) => (
            <figure
              key={image.id}
              className="relative shrink-0 snap-center"
            >
              <img
                src={foodImageLarge(image.url)}
                alt={`${KIND_LABELS[image.kind]} — ${name}`}
                loading="lazy"
                onError={() => setBroken((prev) => [...prev, image.id])}
                className="max-h-64 w-auto rounded-2xl object-contain"
              />
              <figcaption className="text-muted-foreground mt-1.5 text-center text-[11px]">
                {KIND_LABELS[image.kind]}
              </figcaption>
              {image.mine ? (
                <button
                  type="button"
                  onClick={() =>
                    remove.mutate(image.id, {
                      onSuccess: () => toast.success('Foto rimossa'),
                      onError: () => toast.error('Non è stato possibile rimuoverla.'),
                    })
                  }
                  disabled={remove.isPending}
                  aria-label="Rimuovi foto"
                  className="bg-card/85 text-muted-foreground hover:text-destructive absolute top-2 right-2 rounded-full p-2 shadow-soft backdrop-blur transition-colors"
                >
                  <Trash2 className="size-4" />
                </button>
              ) : null}
            </figure>
          ))}

          {upload.isPending ? (
            <div className="bg-secondary text-muted-foreground flex h-64 w-40 shrink-0 items-center justify-center rounded-2xl">
              <Loader2 className="size-5 animate-spin" />
            </div>
          ) : null}
        </div>
      )}
    </Panel>
  )
}
