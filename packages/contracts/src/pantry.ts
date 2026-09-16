import { z } from 'zod'
import { personRef, timestamp } from './primitives.js'

/**
 * What the household has in stock. The pantry is what makes the shopping list
 * write itself: the diary takes grams off a tracked product, and the product
 * puts itself on the list once the last package is nearly gone.
 *
 * Only foods can be stocked — a detergent has no grams and no diary entry to
 * spend them. Those stay free-text rows on the list and nothing tracks them.
 */

export const pantryItem = z.object({
  id: z.string(),
  /** Who stocked it. Attribution, not ownership. */
  userId: z.string(),
  /** Null on a private pantry; set once it belongs to a family. */
  familyId: z.string().nullable(),
  foodId: z.string(),
  name: z.string(),
  brand: z.string().nullable(),
  /** The catalogue photo, when the food has one. */
  imageUrl: z.string().nullable(),
  /** Unopened packages behind the one in use. */
  sealedPackages: z.number(),
  /** Grams left in the open package. */
  remainingG: z.number(),
  packageSizeG: z.number(),
  /** `sealedPackages * packageSizeG + remainingG`, so no screen recomputes it. */
  totalG: z.number(),
  /** Total as a share of one package: 2.4 means two and a bit left. */
  packagesLeft: z.number(),
  /** True once the total is at or under the low threshold. */
  low: z.boolean(),
  /** When the low row was last written to the shopping list. */
  lowNotifiedAt: timestamp.nullable(),
  stockedBy: personRef.optional(),
  createdAt: timestamp,
  updatedAt: timestamp,
})
export type PantryItem = z.infer<typeof pantryItem>

export const pantryResponse = z.object({
  items: z.array(pantryItem),
  /** The threshold `low` was computed against, as a fraction of one package. */
  lowFraction: z.number(),
})
export type PantryResponse = z.infer<typeof pantryResponse>

/**
 * Putting a product in the cupboard. `packageSizeG` is only needed when the
 * catalogue has none for the food — which is most of what Tosano answers with,
 * so the client asks for it rather than refusing to stock the product.
 */
export const pantryStockInput = z.object({
  foodId: z.string().uuid(),
  packages: z.number().int().min(1).max(99).default(1),
  packageSizeG: z.number().min(1).max(20_000).optional(),
})
export type PantryStockInput = z.infer<typeof pantryStockInput>

/**
 * Correcting the cupboard by hand: the jar that was thrown away half full, the
 * pack someone opened without logging a bite. Setting both counts to zero is
 * how "it's finished" is said.
 */
export const pantryPatchInput = z
  .object({
    sealedPackages: z.number().int().min(0).max(99).optional(),
    remainingG: z.number().min(0).max(20_000).optional(),
    packageSizeG: z.number().min(1).max(20_000).optional(),
  })
  .refine((body) => Object.values(body).some((v) => v !== undefined), {
    message: 'No changes supplied',
  })
export type PantryPatchInput = z.infer<typeof pantryPatchInput>
