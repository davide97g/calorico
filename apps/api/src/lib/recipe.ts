import { roundKcal, roundMacro } from './nutrition.js'

/**
 * Turning a list of ingredients into one food.
 *
 * A recipe is stored as a `foods` row, which means the whole app can log it,
 * search it and count it without knowing what it is. The price of that is this
 * function: the per-100 g figures the row carries have to be derived from the
 * ingredients every time one of them changes.
 *
 * Kept free of the database and of Fastify so the arithmetic can be tested on
 * its own — it is the only part of the feature that can be quietly wrong.
 */

export interface Per100 {
  kcal100: number
  protein100: number
  carbs100: number
  fat100: number
  fiber100?: number | null
  sugars100?: number | null
  satFat100?: number | null
  salt100?: number | null
}

export interface RecipeLine {
  quantityG: number
  food: Per100
}

export interface ComposedRecipe {
  /** What the whole dish contains. */
  totals: {
    kcal: number
    proteinG: number
    carbsG: number
    fatG: number
    fiberG: number | null
    sugarsG: number | null
    satFatG: number | null
    saltG: number | null
  }
  /** What 100 g of the finished dish contains — the food row's own numbers. */
  per100: Required<Per100>
}

/**
 * The highest per-100 g energy a real food can reach, near enough: pure fat is
 * 900 kcal. A dish cannot be denser than what went into it, so a number above
 * this means the yield weight is wrong — somebody typed 30 g for a pot of
 * risotto — and clamping keeps one typo from writing a row that would turn
 * every future portion of it into a four-figure lunch.
 */
const MAX_KCAL_100 = 900

/**
 * The optional nutrients add up only across the ingredients that declare one.
 *
 * A food with no fibre figure is not a food with 0 g of fibre, and treating it
 * as one would quietly understate every dish containing a single unlabelled
 * ingredient. Summing what is known and saying nothing when nothing is known is
 * the same rule `sumNutrients` follows for a day's totals.
 */
function optionalSum(
  lines: readonly RecipeLine[],
  pick: (food: Per100) => number | null | undefined,
): number | null {
  let total = 0
  let known = false
  for (const line of lines) {
    const value = pick(line.food)
    if (value == null) continue
    known = true
    total += (value * line.quantityG) / 100
  }
  return known ? total : null
}

export function composeRecipe(
  lines: readonly RecipeLine[],
  yieldG: number,
): ComposedRecipe {
  const sum = (pick: (food: Per100) => number) =>
    lines.reduce((acc, line) => acc + (pick(line.food) * line.quantityG) / 100, 0)

  const kcal = sum((f) => f.kcal100)
  const proteinG = sum((f) => f.protein100)
  const carbsG = sum((f) => f.carbs100)
  const fatG = sum((f) => f.fat100)
  const fiberG = optionalSum(lines, (f) => f.fiber100)
  const sugarsG = optionalSum(lines, (f) => f.sugars100)
  const satFatG = optionalSum(lines, (f) => f.satFat100)
  const saltG = optionalSum(lines, (f) => f.salt100)

  // Sum first, scale once, round at the end — the same order the diary totals
  // are built in, and the reason a recipe's portion adds up to its dish.
  const per = (total: number) => (total / yieldG) * 100
  const perOptional = (total: number | null) =>
    total == null ? null : roundMacro(per(total))

  return {
    totals: {
      kcal: roundKcal(kcal),
      proteinG: roundMacro(proteinG),
      carbsG: roundMacro(carbsG),
      fatG: roundMacro(fatG),
      fiberG: fiberG == null ? null : roundMacro(fiberG),
      sugarsG: sugarsG == null ? null : roundMacro(sugarsG),
      satFatG: satFatG == null ? null : roundMacro(satFatG),
      saltG: saltG == null ? null : roundMacro(saltG),
    },
    per100: {
      kcal100: Math.min(MAX_KCAL_100, roundMacro(per(kcal))),
      protein100: roundMacro(per(proteinG)),
      carbs100: roundMacro(per(carbsG)),
      fat100: roundMacro(per(fatG)),
      fiber100: perOptional(fiberG),
      sugars100: perOptional(sugarsG),
      satFat100: perOptional(satFatG),
      salt100: perOptional(saltG),
    },
  }
}

/** What went in, before cooking changed it. The default yield weight. */
export function ingredientsWeight(lines: readonly RecipeLine[]): number {
  return roundMacro(lines.reduce((acc, line) => acc + line.quantityG, 0))
}
