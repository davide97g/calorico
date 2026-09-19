import { eq, inArray, not, or, type SQL } from 'drizzle-orm'
import { foods } from '../db/schema.js'

/**
 * Catalogue rows are shared; a food somebody wrote themselves is theirs alone.
 * Search, barcode lookup and the detail page all have to spell this the same
 * way or one of them will leak a homemade name into someone else's diary.
 *
 * Two sources are private: `custom`, typed in by hand, and `recipe`, composed
 * out of other foods. They are the same case — a name somebody chose for their
 * own kitchen — and the RLS policy on `foods` draws the line in the same place,
 * on `created_by`.
 */
const PRIVATE_SOURCES = ['custom', 'recipe'] as const

export function foodVisibleTo(userId: string): SQL {
  return or(
    not(inArray(foods.source, [...PRIVATE_SOURCES])),
    eq(foods.createdBy, userId),
  )!
}

export function isFoodVisibleTo(
  food: { source: string; createdBy: string | null },
  userId: string,
): boolean {
  return (
    !(PRIVATE_SOURCES as readonly string[]).includes(food.source) ||
    food.createdBy === userId
  )
}
