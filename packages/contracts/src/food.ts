import { z } from 'zod'
import { foodImageKind, foodSource, timestamp } from './primitives.js'

export const foodImage = z.object({
  id: z.string(),
  url: z.string(),
  kind: foodImageKind,
  width: z.number().nullable(),
  height: z.number().nullable(),
})
export type FoodImage = z.infer<typeof foodImage>

export const food = z.object({
  id: z.string(),
  source: foodSource,
  barcode: z.string().nullable(),
  name: z.string(),
  brand: z.string().nullable(),
  category: z.string().nullable(),
  imageUrl: z.string().nullable(),
  kcal100: z.number(),
  protein100: z.number(),
  carbs100: z.number(),
  sugars100: z.number().nullable(),
  fat100: z.number(),
  satFat100: z.number().nullable(),
  fiber100: z.number().nullable(),
  salt100: z.number().nullable(),
  servingSizeG: z.number().nullable(),
  servingLabel: z.string().nullable(),
  packageSizeG: z.number().nullable(),
  packageSizeLabel: z.string().nullable(),
  unit: z.string(),
  isLiquid: z.boolean(),
  verified: z.boolean(),
  /** Only the routes that know this user's favourites send it. */
  isFavorite: z.boolean().optional(),
})
export type Food = z.infer<typeof food>

/** One food's portion history, as GET /foods/:id/portions returns it. */
export const foodPortions = z.object({
  /** null when this user has never logged this food. */
  lastQuantityG: z.number().nullable(),
  /** Most-used first, at most three. */
  topQuantities: z.array(z.number()),
  times: z.number(),
})
export type FoodPortions = z.infer<typeof foodPortions>

/**
 * A food plus this user's history with it, as GET /foods/recent returns it.
 *
 * The portions are the reason this shape exists: logging the same food again is
 * the daily job, and it is only one tap if the quantity comes with the food.
 */
export const recentFood = food.extend({
  /**
   * The portion used the last time this food was logged, or null for a food
   * that has only been met — scanned, opened from search, created by hand —
   * which `include=all` also returns.
   */
  lastQuantityG: z.number().nullable(),
  /** Its best-remembered portions, most-used first. At most three. */
  topQuantities: z.array(z.number()),
  /** How many times it has been logged. Zero for a food never eaten. */
  times: z.number(),
  lastAt: timestamp,
})
export type RecentFood = z.infer<typeof recentFood>

/**
 * A food the catalogue did not have, typed in by hand or estimated from a photo.
 *
 * This is a **request** schema: the API parses POST /foods and every
 * `newFood` inside POST /diary/batch with it. The defaults are what make a form
 * that leaves the optional macros empty still produce a complete row.
 */
export const newFoodInput = z.object({
  name: z.string().min(2).max(160),
  brand: z.string().max(120).optional(),
  kcal100: z.number().min(0).max(950),
  protein100: z.number().min(0).max(100).default(0),
  carbs100: z.number().min(0).max(100).default(0),
  fat100: z.number().min(0).max(100).default(0),
  fiber100: z.number().min(0).max(100).optional(),
  sugars100: z.number().min(0).max(100).optional(),
  satFat100: z.number().min(0).max(100).optional(),
  salt100: z.number().min(0).max(100).optional(),
  servingSizeG: z.number().min(1).max(2000).optional(),
  servingLabel: z.string().max(80).optional(),
  isLiquid: z.boolean().default(false),
  barcode: z
    .string()
    .regex(/^\d{8,14}$/)
    .optional(),
})
export type NewFoodInput = z.infer<typeof newFoodInput>
