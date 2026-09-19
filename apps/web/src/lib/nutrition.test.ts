import { describe, expect, it } from 'vitest'
import { composeLines } from './nutrition'

const albume = { kcal100: 52, protein100: 11, carbs100: 0.7, fat100: 0.2 }
const avena = { kcal100: 370, protein100: 13, carbs100: 60, fat100: 7 }

describe('composeLines', () => {
  it('weighs every line and adds them up', () => {
    const totals = composeLines([
      { per100: albume, quantityG: 110 },
      { per100: avena, quantityG: 60 },
    ])
    expect(totals.kcal).toBe(279)
    expect(totals.proteinG).toBe(19.9)
  })

  it('sums before rounding, like the server does', () => {
    // Three lines of 0.05 g each: rounded one by one they would vanish.
    const crumb = { kcal100: 100, protein100: 10, carbs100: 0, fat100: 0 }
    const totals = composeLines(
      Array.from({ length: 3 }, () => ({ per100: crumb, quantityG: 0.5 })),
    )
    expect(totals.proteinG).toBe(0.2)
  })
})
