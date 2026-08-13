import { z } from 'zod'

/**
 * The vocabulary every other contract is built from: the enums that appear in
 * both a request and a response, and the three scalars that are easy to get
 * subtly wrong.
 */

/** A calendar day, `YYYY-MM-DD`. Never a timestamp. */
export const dayString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

/** An ISO-8601 instant, which is what a `timestamptz` becomes over JSON. */
export const timestamp = z.string()

export const mealSlot = z.enum(['breakfast', 'lunch', 'dinner', 'snack'])
export type Meal = z.infer<typeof mealSlot>

export const sex = z.enum(['male', 'female'])
export type Sex = z.infer<typeof sex>

export const activityLevel = z.enum([
  'sedentary',
  'light',
  'moderate',
  'active',
  'very_active',
])
export type ActivityLevel = z.infer<typeof activityLevel>

export const goal = z.enum(['lose', 'maintain', 'gain'])
export type Goal = z.infer<typeof goal>

export const foodSource = z.enum(['off', 'generic', 'custom'])
export type FoodSource = z.infer<typeof foodSource>

/** Every shot comes from Open Food Facts; users cannot add their own. */
export const foodImageKind = z.enum(['front', 'ingredients', 'nutrition'])
export type FoodImageKind = z.infer<typeof foodImageKind>

export const scanKind = z.enum(['barcode', 'photo'])
export type ScanKind = z.infer<typeof scanKind>

export const reminderKind = z.enum(['meal', 'review', 'weight', 'custom'])
export type ReminderKind = z.infer<typeof reminderKind>

export const periodUnit = z.enum(['week', 'month'])
export type PeriodUnit = z.infer<typeof periodUnit>

export const confidence = z.enum(['low', 'medium', 'high'])
export type Confidence = z.infer<typeof confidence>

/**
 * One portion in grams. The floor keeps a 0 g row — which contributes nothing
 * and cannot be edited into something — out of the diary; the ceiling is a
 * sanity bound on a typo, not a limit on how much anyone may eat.
 */
export const quantityG = z.number().min(0.1).max(5000)

/** `/:id` for every route whose rows are uuid-keyed. */
export const idParam = z.object({ id: z.string().uuid() })

/** The subset of a user shown next to anything they added or scanned. */
export const personRef = z.object({
  id: z.string(),
  name: z.string(),
  avatarUrl: z.string().nullable().optional(),
})
export type PersonRef = z.infer<typeof personRef>
