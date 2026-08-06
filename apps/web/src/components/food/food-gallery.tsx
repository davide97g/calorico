import { useState } from 'react'
import { Panel, PanelHeader } from '@/components/ui/panel'
import { useFoodImages } from '@/hooks/use-food-images'
import { foodImageLarge } from '@/lib/food-image'
import { cn } from '@/lib/utils'
import type { FoodImage, FoodImageKind } from '@/lib/types'

const KIND_LABELS: Record<FoodImageKind, string> = {
  front: 'Prodotto',
  ingredients: 'Ingredienti',
  nutrition: 'Valori nutrizionali',
}

/**
 * The only place real photos appear: the detail pages. Lists stay on emoji
 * tiles, so a packshot here is a deliberate look at the thing you logged.
 *
 * Shows the shots that came with the food — front, ingredients, nutrition label
 * — all of them from Open Food Facts.
 *
 * Pass `images` when the parent already loaded them with the food; otherwise the
 * component fetches them itself.
 */
export function FoodGallery({
  foodId,
  name,
  images,
}: {
  foodId: string | null | undefined
  name: string
  images?: FoodImage[]
}) {
  const [broken, setBroken] = useState<string[]>([])

  // Only queries when the parent did not hand us the list already.
  const query = useFoodImages(images ? null : foodId)

  const all = images ?? query.data?.items ?? []
  const shown = all.filter((image) => !broken.includes(image.id))

  if (shown.length === 0) return null

  return (
    <Panel className="mt-3">
      <PanelHeader title="Foto" />

      {/* Packshots come in every aspect ratio, so each photo sets its own shape
          inside a capped height instead of being cropped to a frame. */}
      <div
        className={cn(
          'no-scrollbar mt-3 flex gap-3 overflow-x-auto',
          shown.length > 1 ? 'snap-x snap-mandatory' : 'justify-center',
        )}
      >
        {shown.map((image) => (
          <figure key={image.id} className="relative shrink-0 snap-center">
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
          </figure>
        ))}
      </div>
    </Panel>
  )
}
