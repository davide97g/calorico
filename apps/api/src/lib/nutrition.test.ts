import { describe, expect, it } from 'vitest'
import {
  ageFromBirthDate,
  bmr,
  dailyTargets,
  deriveKcal,
  scaleNutriments,
  tdee,
} from './nutrition.js'

describe('bmr', () => {
  // Worked from Mifflin-St Jeor by hand: 10*80 + 6.25*180 - 5*30 + 5.
  it('follows Mifflin-St Jeor for men', () => {
    expect(bmr({ sex: 'male', weightKg: 80, heightCm: 180, age: 30 })).toBe(1780)
  })

  it('is 166 kcal lower for women at the same measurements', () => {
    const male = bmr({ sex: 'male', weightKg: 80, heightCm: 180, age: 30 })
    const female = bmr({ sex: 'female', weightKg: 80, heightCm: 180, age: 30 })
    expect(male - female).toBe(166)
  })
})

describe('tdee', () => {
  it('scales the BMR by the activity factor', () => {
    const input = {
      sex: 'male' as const,
      weightKg: 80,
      heightCm: 180,
      age: 30,
    }
    expect(tdee({ ...input, activityLevel: 'sedentary' })).toBeCloseTo(
      1780 * 1.2,
      6,
    )
    expect(tdee({ ...input, activityLevel: 'very_active' })).toBeCloseTo(
      1780 * 1.9,
      6,
    )
  })
})

describe('dailyTargets', () => {
  const base = {
    sex: 'male' as const,
    weightKg: 80,
    heightCm: 180,
    age: 30,
    activityLevel: 'moderate' as const,
  }

  it('cuts calories to lose and adds them to gain', () => {
    const lose = dailyTargets({ ...base, goal: 'lose' })
    const maintain = dailyTargets({ ...base, goal: 'maintain' })
    const gain = dailyTargets({ ...base, goal: 'gain' })

    expect(lose.targetKcal).toBeLessThan(maintain.targetKcal)
    expect(gain.targetKcal).toBeGreaterThan(maintain.targetKcal)
  })

  it('rounds calories to ten and brackets them by 150', () => {
    const t = dailyTargets({ ...base, goal: 'maintain' })
    expect(t.targetKcal % 10).toBe(0)
    expect(t.targetKcalMax - t.targetKcalMin).toBe(300)
    expect(t.targetKcal - t.targetKcalMin).toBe(150)
  })

  it('anchors protein to bodyweight, higher when cutting', () => {
    expect(dailyTargets({ ...base, goal: 'maintain' }).targetProteinG).toBe(136)
    expect(dailyTargets({ ...base, goal: 'lose' }).targetProteinG).toBe(160)
  })

  it('keeps carbs off the floor for a normal target', () => {
    const t = dailyTargets({ ...base, goal: 'maintain' })
    expect(t.targetCarbsG).toBeGreaterThan(50)
  })

  /**
   * The regression this guards: protein is per kilo and fat is a share of
   * calories, so a heavy person on a deep cut can have both eat the whole
   * budget. Carbs must not go negative.
   */
  it('floors carbs at 50 g when protein and fat use up the budget', () => {
    const t = dailyTargets({
      sex: 'female',
      weightKg: 120,
      heightCm: 150,
      age: 70,
      activityLevel: 'sedentary',
      goal: 'lose',
    })
    expect(t.targetCarbsG).toBe(50)
  })

  it('never hands back a macro that is not a whole number', () => {
    const t = dailyTargets({ ...base, goal: 'lose' })
    for (const value of [t.targetProteinG, t.targetCarbsG, t.targetFatG]) {
      expect(Number.isInteger(value)).toBe(true)
    }
  })
})

describe('ageFromBirthDate', () => {
  it('counts full years only', () => {
    expect(ageFromBirthDate('1990-06-15', new Date('2026-06-15'))).toBe(36)
  })

  it('does not count the birthday until it arrives', () => {
    expect(ageFromBirthDate('1990-06-15', new Date('2026-06-14'))).toBe(35)
  })

  it('handles a December birthday read in January', () => {
    expect(ageFromBirthDate('1990-12-31', new Date('2026-01-01'))).toBe(35)
  })
})

describe('scaleNutriments', () => {
  const per100 = {
    kcal100: 250,
    protein100: 12,
    carbs100: 30,
    fat100: 9,
    fiber100: 2.5,
  }

  it('scales linearly', () => {
    expect(scaleNutriments(per100, 200)).toEqual({
      kcal: 500,
      proteinG: 24,
      carbsG: 60,
      fatG: 18,
      fiberG: 5,
    })
  })

  it('rounds macros to a tenth and calories to a whole number', () => {
    const scaled = scaleNutriments(per100, 33)
    expect(scaled.kcal).toBe(83)
    expect(scaled.proteinG).toBe(4)
    expect(scaled.fatG).toBe(3)
  })

  it('keeps a missing fibre value missing instead of turning it into 0', () => {
    expect(scaleNutriments({ ...per100, fiber100: null }, 100).fiberG).toBeNull()
  })
})

describe('deriveKcal', () => {
  it('prefers a stated kcal value', () => {
    expect(deriveKcal({ kcal: 240, kj: 9999, protein: 1 })).toBe(240)
  })

  it('converts kJ when kcal is missing', () => {
    expect(deriveKcal({ kj: 1000 })).toBeCloseTo(239.006, 2)
  })

  it('falls back to the macros', () => {
    expect(deriveKcal({ protein: 10, carbs: 20, fat: 5 })).toBe(165)
  })

  it('returns null when the record carries nothing usable', () => {
    expect(deriveKcal({})).toBeNull()
    expect(deriveKcal({ kcal: 0, kj: 0 })).toBeNull()
    expect(deriveKcal({ protein: 0, carbs: 0, fat: 0 })).toBeNull()
  })
})
