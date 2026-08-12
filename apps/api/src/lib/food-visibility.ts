import { eq, ne, or, type SQL } from 'drizzle-orm'
import { foods } from '../db/schema.js'

/**
 * Catalogue rows are shared; a custom food is the author's private recipe.
 * Search, barcode lookup and the detail page all have to spell this the same
 * way or one of them will leak a homemade name into someone else's diary.
 */
export function foodVisibleTo(userId: string): SQL {
  return or(ne(foods.source, 'custom'), eq(foods.createdBy, userId))!
}

export function isFoodVisibleTo(
  food: { source: string; createdBy: string | null },
  userId: string,
): boolean {
  return food.source !== 'custom' || food.createdBy === userId
}
