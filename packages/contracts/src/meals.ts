import { z } from 'zod'
import { mealSlot, timestamp } from './primitives.js'

/** One ingredient of a saved plate, as GET /meals returns it. */
export const savedMealItem = z.object({
  id: z.string(),
  foodId: z.string(),
  quantityG: z.number(),
  sort: z.number(),
  name: z.string(),
  brand: z.string().nullable(),
  unit: z.string(),
  category: z.string().nullable(),
  imageUrl: z.string().nullable(),
  kcal100: z.number(),
})
export type SavedMealItem = z.infer<typeof savedMealItem>

/** A named plate this user logs as one tap. */
export const savedMeal = z.object({
  id: z.string(),
  name: z.string(),
  meal: mealSlot,
  lastLoggedAt: timestamp.nullable(),
  createdAt: timestamp,
  updatedAt: timestamp,
  /** The whole plate's calories, summed from the items. */
  kcal: z.number(),
  items: z.array(savedMealItem),
})
export type SavedMeal = z.infer<typeof savedMeal>
