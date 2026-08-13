import { z } from 'zod'

/**
 * The request primitives more than one route needs. Kept in one place because
 * every copy of them is a chance for two endpoints to disagree about what a
 * valid day or a valid portion is — and the client sends the same values to all
 * of them.
 */

/** A calendar day, `YYYY-MM-DD`. Never a timestamp: see lib/date.ts on the web. */
export const dayString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

/** The four slots a diary entry, a saved meal and a reminder all share. */
export const mealSlot = z.enum(['breakfast', 'lunch', 'dinner', 'snack'])

/**
 * One portion in grams. The floor keeps a 0 g row — which contributes nothing
 * and cannot be edited into something — out of the diary; the ceiling is a
 * sanity bound on a typo, not a limit on how much anyone may eat.
 */
export const quantityG = z.number().min(0.1).max(5000)

/** `/:id` for every route whose rows are uuid-keyed. */
export const idParam = z.object({ id: z.string().uuid() })
