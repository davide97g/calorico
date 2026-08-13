import { useState } from 'react'
import { Panel, PanelHeader } from '@/components/ui/panel'
import { useFoodImages } from '@/hooks/use-foods'
import { foodImageLarge } from '@/lib/food-image'
import { cn } from '@/lib/utils'
import type { FoodImageKind } from '@/lib/types'

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
 * Always fetches for itself. The pages above it are on the path of every entry,
 * and the photos are the one part of a food worth waiting for separately.
 */
export function FoodGallery({
  foodId,
  name,
}: {
  foodId: string | null | undefined
  name: string
}) {
  const [broken, setBroken] = useState<string[]>([])

  const query = useFoodImages(foodId)

  const all = query.data?.items ?? []
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
              className="max-h-64 w-auto rounded-md object-contain"
            />
            <figcaption className="text-muted-foreground mt-1.5 text-center text-micro">
              {KIND_LABELS[image.kind]}
            </figcaption>
          </figure>
        ))}
      </div>
    </Panel>
  )
}
