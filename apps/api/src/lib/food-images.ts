import { asc, eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { foodImages, foods, type Food, type FoodImage } from '../db/schema.js'
import { fetchOffImages, type OffImageKind } from './off.js'

/** Product shots in label order: packshot, ingredients, nutrition table. */
const SORT: Record<OffImageKind, number> = {
  front: 0,
  ingredients: 1,
  nutrition: 2,
}

export interface FoodImageDto {
  id: string
  url: string
  kind: FoodImage['kind']
  width: number | null
  height: number | null
}

function toDto(row: FoodImage): FoodImageDto {
  return {
    id: row.id,
    url: row.url,
    kind: row.kind,
    width: row.width,
    height: row.height,
  }
}

/** Every shot for a food. All of them come from Open Food Facts. */
export async function listFoodImages(foodId: string): Promise<FoodImageDto[]> {
  const rows = await db
    .select()
    .from(foodImages)
    .where(eq(foodImages.foodId, foodId))
    .orderBy(asc(foodImages.sort), asc(foodImages.createdAt))

  return rows.map(toDto)
}

/**
 * Fills in the product shots the first time a food is opened.
 *
 * The bulk importer stores one thumbnail per product and nothing else, so the
 * ingredients and nutrition photos are fetched lazily, once, and the attempt is
 * stamped either way — a product without photos must not re-ask on every view.
 * Failures are swallowed: a detail page still works without its gallery.
 */
export async function syncOffImages(food: Food): Promise<void> {
  if (food.imagesSyncedAt) return

  const found = food.barcode && food.source === 'off'
    ? await fetchOffImages(food.barcode).catch(() => [])
    : []

  const rows = found.map((image) => ({
    foodId: food.id,
    kind: image.kind,
    url: image.url,
    sort: SORT[image.kind],
  }))

  // Whatever the importer already had is better than an empty gallery.
  if (rows.length === 0 && food.imageUrl) {
    rows.push({
      foodId: food.id,
      kind: 'front' as const,
      url: food.imageUrl,
      sort: SORT.front,
    })
  }

  if (rows.length > 0) {
    await db.insert(foodImages).values(rows).onConflictDoNothing()
  }
  await db
    .update(foods)
    .set({ imagesSyncedAt: new Date() })
    .where(eq(foods.id, food.id))
}
