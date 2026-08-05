import { and, asc, eq, isNull, or } from 'drizzle-orm'
import { db } from '../db/index.js'
import { foodImages, foods, type Food, type FoodImage } from '../db/schema.js'
import { fetchOffImages, type OffImageKind } from './off.js'

/** Product shots first, in label order, then the user's own photos. */
const SORT: Record<OffImageKind | 'user', number> = {
  front: 0,
  ingredients: 1,
  nutrition: 2,
  user: 10,
}

export interface FoodImageDto {
  id: string
  url: string
  kind: FoodImage['kind']
  width: number | null
  height: number | null
  /** True when the signed-in user uploaded it, and may therefore delete it. */
  mine: boolean
}

export function toDto(row: FoodImage, userId: string): FoodImageDto {
  return {
    id: row.id,
    url: row.url,
    kind: row.kind,
    width: row.width,
    height: row.height,
    mine: row.userId === userId,
  }
}

/** Shared product shots plus the caller's own uploads. Never someone else's. */
export async function listFoodImages(
  foodId: string,
  userId: string,
): Promise<FoodImageDto[]> {
  const rows = await db
    .select()
    .from(foodImages)
    .where(
      and(
        eq(foodImages.foodId, foodId),
        or(isNull(foodImages.userId), eq(foodImages.userId, userId)),
      ),
    )
    .orderBy(asc(foodImages.sort), asc(foodImages.createdAt))

  return rows.map((row) => toDto(row, userId))
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
    userId: null,
    kind: image.kind,
    url: image.url,
    sort: SORT[image.kind],
  }))

  // Whatever the importer already had is better than an empty gallery.
  if (rows.length === 0 && food.imageUrl) {
    rows.push({
      foodId: food.id,
      userId: null,
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

export const userImageSort = SORT.user
