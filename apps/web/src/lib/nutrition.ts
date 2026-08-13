import { MEAL_ORDER } from './format'
import type { DiaryEntry, Meal, Nutrients100, Totals } from './types'

/**
 * Client-side mirror of the server's `scaleNutriments`, rounding the same way,
 * so the numbers on a review screen match what actually gets written.
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

/**
 * Mirror of the server's `sumNutrients` + `roundNutrients`: an optimistic
 * update has to produce the totals the next fetch will confirm, or the numbers
 * jump the moment the response lands. Sum first, round once, at the end.
 */
export function sumTotals(entries: readonly DiaryEntry[]): Totals {
  const round = (n: number) => Math.round(n * 10) / 10
  const totals: Totals = {
    kcal: 0,
    proteinG: 0,
    carbsG: 0,
    fatG: 0,
    fiberG: 0,
    sugarsG: 0,
    satFatG: 0,
    saltG: 0,
  }
  for (const e of entries) {
    totals.kcal += e.kcal
    totals.proteinG += e.proteinG
    totals.carbsG += e.carbsG
    totals.fatG += e.fatG
    totals.fiberG += e.fiberG ?? 0
    totals.sugarsG += e.sugarsG ?? 0
    totals.satFatG += e.satFatG ?? 0
    totals.saltG += e.saltG ?? 0
  }
  return {
    kcal: Math.round(totals.kcal),
    proteinG: round(totals.proteinG),
    carbsG: round(totals.carbsG),
    fatG: round(totals.fatG),
    fiberG: round(totals.fiberG),
    sugarsG: round(totals.sugarsG),
    satFatG: round(totals.satFatG),
    saltG: round(totals.saltG),
  }
}

/** The `byMeal` index the diary response carries, rebuilt on the client. */
export function groupByMeal(
  entries: readonly DiaryEntry[],
): Record<Meal, DiaryEntry[]> {
  const byMeal = Object.fromEntries(
    MEAL_ORDER.map((meal) => [meal, [] as DiaryEntry[]]),
  ) as Record<Meal, DiaryEntry[]>
  for (const e of entries) byMeal[e.meal].push(e)
  return byMeal
}
