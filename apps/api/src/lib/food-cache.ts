import { sql as raw } from 'drizzle-orm'
import { db } from '../db/index.js'
import { foods, type Food, type NewFood } from '../db/schema.js'

/**
 * Upserts imported/searched products. Barcode is the natural key; rows without
 * one (rare, from free-text search) are inserted as-is.
 */
export async function cacheFoods(rows: NewFood[]): Promise<Food[]> {
  if (rows.length === 0) return []
  const withBarcode = rows.filter((r) => r.barcode)
  const withoutBarcode = rows.filter((r) => !r.barcode)
  const saved: Food[] = []

  if (withBarcode.length > 0) {
    saved.push(
      ...(await db
        .insert(foods)
        .values(withBarcode)
        .onConflictDoUpdate({
          target: foods.barcode,
          // Matches the partial unique index in the schema.
          targetWhere: raw`${foods.barcode} is not null`,
          set: {
            name: raw`excluded.name`,
            brand: raw`excluded.brand`,
            imageUrl: raw`excluded.image_url`,
            kcal100: raw`excluded.kcal_100`,
            protein100: raw`excluded.protein_100`,
            carbs100: raw`excluded.carbs_100`,
            fat100: raw`excluded.fat_100`,
            sugars100: raw`excluded.sugars_100`,
            satFat100: raw`excluded.sat_fat_100`,
            fiber100: raw`excluded.fiber_100`,
            salt100: raw`excluded.salt_100`,
            servingSizeG: raw`excluded.serving_size_g`,
            servingLabel: raw`excluded.serving_label`,
            packageSizeG: raw`excluded.package_size_g`,
            packageSizeLabel: raw`excluded.package_size_label`,
            updatedAt: new Date(),
          },
        })
        .returning()),
    )
  }
  if (withoutBarcode.length > 0) {
    saved.push(...(await db.insert(foods).values(withoutBarcode).returning()))
  }
  return saved
}
