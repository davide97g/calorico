import { z } from 'zod'
import { newFoodInput } from './food.js'
import { dayString, mealSlot, quantityG } from './primitives.js'

export const diaryEntry = z.object({
  id: z.string(),
  /** Null once the food behind the entry is deleted; the snapshots remain. */
  foodId: z.string().nullable(),
  day: dayString,
  meal: mealSlot,
  quantityG: z.number(),
  nameSnapshot: z.string(),
  brandSnapshot: z.string().nullable(),
  kcal: z.number(),
  proteinG: z.number(),
  carbsG: z.number(),
  fatG: z.number(),
  fiberG: z.number().nullable(),
  sugarsG: z.number().nullable(),
  satFatG: z.number().nullable(),
  saltG: z.number().nullable(),
  /** Joined from the food, so absent on the row a mutation returns. */
  imageUrl: z.string().nullable().optional(),
  unit: z.string().optional(),
  servingSizeG: z.number().nullable().optional(),
})
export type DiaryEntry = z.infer<typeof diaryEntry>

/** kcal whole, macros to a tenth. Optional macros total 0, never null. */
export const totals = z.object({
  kcal: z.number(),
  proteinG: z.number(),
  carbsG: z.number(),
  fatG: z.number(),
  fiberG: z.number(),
  sugarsG: z.number(),
  satFatG: z.number(),
  saltG: z.number(),
})
export type Totals = z.infer<typeof totals>

export const dayTargets = z.object({
  kcal: z.number(),
  proteinG: z.number(),
  carbsG: z.number(),
  fatG: z.number(),
  kcalMin: z.number(),
  kcalMax: z.number(),
})
export type DayTargets = z.infer<typeof dayTargets>

/** GET /diary — everything the Today screen needs in one round trip. */
export const diaryDay = z.object({
  day: dayString,
  entries: z.array(diaryEntry),
  byMeal: z.record(mealSlot, z.array(diaryEntry)),
  totals,
  /** Null until onboarding has produced targets. */
  targets: dayTargets.nullable(),
})
export type DiaryDay = z.infer<typeof diaryDay>

/**
 * One line of POST /diary/batch: either a food that exists or one the photo flow
 * invented, which becomes a real `foods` row before it can be logged.
 */
export const batchEntryInput = z.union([
  z.object({ foodId: z.string().uuid(), quantityG }),
  z.object({ newFood: newFoodInput, quantityG }),
])
export type BatchEntryInput = z.infer<typeof batchEntryInput>
