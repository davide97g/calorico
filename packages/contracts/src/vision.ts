import { z } from 'zod'
import { photoQuota } from './account.js'
import { food } from './food.js'
import { confidence } from './primitives.js'

export const visionStatus = z.object({
  /** False when the server has no vision provider configured. */
  enabled: z.boolean(),
  quota: photoQuota,
})
export type VisionStatus = z.infer<typeof visionStatus>

/** Per 100 g/ml, the model's own estimate. */
export const nutrients100 = z.object({
  kcal100: z.number(),
  protein100: z.number(),
  carbs100: z.number(),
  fat100: z.number(),
  fiber100: z.number().nullable(),
  sugars100: z.number().nullable().optional(),
  satFat100: z.number().nullable().optional(),
  salt100: z.number().nullable().optional(),
})
export type Nutrients100 = z.infer<typeof nutrients100>

/** One food the photo analysis found, with catalogue candidates attached. */
export const analyzedItem = z.object({
  label: z.string(),
  searchQuery: z.string(),
  quantityG: z.number(),
  confidence,
  /** What the quantity estimate is anchored on. Shown under the row. */
  basis: z.string(),
  isLiquid: z.boolean(),
  packaged: z.boolean(),
  nutrients100: nutrients100.nullable(),
  /** Best catalogue guesses, best first. May be empty. */
  candidates: z.array(food),
  /** True when candidates[0] is good enough to preselect. */
  matched: z.boolean(),
})
export type AnalyzedItem = z.infer<typeof analyzedItem>

export const mealAnalysis = z.object({
  items: z.array(analyzedItem),
  /** Text read off a package, when the photo was of a label. */
  labelText: z.string().nullable(),
})
export type MealAnalysis = z.infer<typeof mealAnalysis>
