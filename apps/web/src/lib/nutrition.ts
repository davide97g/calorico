import type { Nutrients100 } from './types'

/**
 * Client-side mirror of the server's `scaleNutriments`, rounding the same way,
 * so the numbers on a review screen match what actually gets written.
 *
 * Three other screens still scale inline with slightly different rounding
 * (food-detail, quick-add-strip, entry-detail). Folding them into this is worth
 * doing, but it touches working screens and belongs in its own change.
 */
export function scalePer100(per100: Nutrients100, grams: number) {
  const f = grams / 100
  const round = (n: number) => Math.round(n * 10) / 10
  const optional = (value: number | null | undefined) =>
    value == null ? null : round(value * f)
  return {
    kcal: Math.round(per100.kcal100 * f),
    proteinG: round(per100.protein100 * f),
    carbsG: round(per100.carbs100 * f),
    fatG: round(per100.fat100 * f),
    fiberG: optional(per100.fiber100),
    sugarsG: optional(per100.sugars100),
    satFatG: optional(per100.satFat100),
    saltG: optional(per100.salt100),
  }
}
