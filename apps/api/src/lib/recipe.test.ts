import { describe, expect, it } from 'vitest'
import { composeRecipe, ingredientsWeight, type RecipeLine } from './recipe.js'

const albume = {
  kcal100: 52,
  protein100: 11,
  carbs100: 0.7,
  fat100: 0.2,
  salt100: 0.5,
}
const yogurt = {
  kcal100: 97,
  protein100: 9,
  carbs100: 3.6,
  fat100: 5,
  sugars100: 3.6,
  satFat100: 3.5,
  salt100: 0.1,
}
const avena = {
  kcal100: 370,
  protein100: 13,
  carbs100: 60,
  fat100: 7,
  fiber100: 10,
}

/** The dish from the brief: 110 g of egg white, 150 g of yogurt, 60 g of oats. */
const lines: RecipeLine[] = [
  { quantityG: 110, food: albume },
  { quantityG: 150, food: yogurt },
  { quantityG: 60, food: avena },
]

describe('composeRecipe', () => {
  it('adds the ingredients up into one dish', () => {
    const { totals } = composeRecipe(lines, ingredientsWeight(lines))
    // 57.2 + 145.5 + 222
    expect(totals.kcal).toBe(425)
    expect(totals.proteinG).toBe(33.4)
    expect(totals.carbsG).toBe(42.2)
  })

  it('divides the dish by what it weighs, not by what went in', () => {
    const raw = composeRecipe(lines, 320)
    // Simmered down to 250 g: the same food, denser per 100 g.
    const cooked = composeRecipe(lines, 250)
    expect(cooked.per100.kcal100).toBeGreaterThan(raw.per100.kcal100)
    expect(cooked.totals.kcal).toBe(raw.totals.kcal)
    expect(raw.per100.kcal100).toBe(132.7)
  })

  it('a portion of the dish scales back to the dish', () => {
    const { per100, totals } = composeRecipe(lines, 320)
    const wholeAgain = (per100.kcal100 * 320) / 100
    expect(wholeAgain).toBeCloseTo(totals.kcal, 0)
  })

  it('leaves a nutrient nobody declares null rather than calling it zero', () => {
    const { totals, per100 } = composeRecipe(
      [{ quantityG: 110, food: albume }],
      110,
    )
    expect(totals.fiberG).toBeNull()
    expect(per100.fiber100).toBeNull()
    // Declared by one ingredient, so the dish has at least that much.
    expect(totals.saltG).toBe(0.6)
  })

  it('sums the nutrients that are declared when some are not', () => {
    // Only the oats carry a fibre figure; the total is theirs alone.
    const { totals } = composeRecipe(lines, 320)
    expect(totals.fiberG).toBe(6)
  })

  it('clamps a density no food can reach, which is a mistyped yield', () => {
    const { per100 } = composeRecipe(lines, 5)
    expect(per100.kcal100).toBe(900)
  })
})

describe('ingredientsWeight', () => {
  it('is what went in', () => {
    expect(ingredientsWeight(lines)).toBe(320)
  })
})
