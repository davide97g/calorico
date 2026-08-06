import { describe, expect, it } from 'vitest'
import {
  ageFromBirthDate,
  bmr,
  dailyTargets,
  deriveKcal,
  leanBodyMassKg,
  proteinRecommendation,
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

  it('anchors protein to lean mass, higher when cutting', () => {
    expect(dailyTargets({ ...base, goal: 'maintain' }).targetProteinG).toBe(135)
    expect(dailyTargets({ ...base, goal: 'lose' }).targetProteinG).toBe(160)
  })

  it('keeps carbs off the floor for a normal target', () => {
    const t = dailyTargets({ ...base, goal: 'maintain' })
    expect(t.targetCarbsG).toBeGreaterThan(50)
  })

  /**
   * The regression this guards: protein is per kilo of lean mass and fat is a
   * share of calories, so a heavy person on a deep cut can have both eat most
   * of the budget. Carbs must not go negative.
   */
  it('never lets protein and fat push carbs below the 50 g floor', () => {
    const extremes = [
      { sex: 'female' as const, weightKg: 120, heightCm: 150, age: 70 },
      { sex: 'male' as const, weightKg: 150, heightCm: 160, age: 25 },
      { sex: 'female' as const, weightKg: 45, heightCm: 150, age: 20 },
    ]
    for (const body of extremes) {
      const t = dailyTargets({
        ...body,
        activityLevel: 'sedentary',
        goal: 'lose',
      })
      expect(t.targetCarbsG).toBeGreaterThanOrEqual(50)
    }
  })

  it('never hands back a macro that is not a whole number', () => {
    const t = dailyTargets({ ...base, goal: 'lose' })
    for (const value of [t.targetProteinG, t.targetCarbsG, t.targetFatG]) {
      expect(Number.isInteger(value)).toBe(true)
    }
  })
})

describe('proteinRecommendation', () => {
  const base = {
    weightKg: 70,
    heightCm: 170,
    age: 30,
    activityLevel: 'moderate' as const,
    goal: 'maintain' as const,
  }

  it('asks less of a woman than of a man at the same size', () => {
    const male = proteinRecommendation({ ...base, sex: 'male' })
    const female = proteinRecommendation({ ...base, sex: 'female' })
    expect(female.proteinG).toBeLessThan(male.proteinG)
  })

  it('stays inside the 1.2–2.4 g/kg bodyweight band', () => {
    for (const sex of ['male', 'female'] as const) {
      for (const goal of ['lose', 'maintain', 'gain'] as const) {
        for (const activityLevel of [
          'sedentary',
          'light',
          'moderate',
          'active',
          'very_active',
        ] as const) {
          const r = proteinRecommendation({ ...base, sex, goal, activityLevel })
          expect(r.perKg).toBeGreaterThanOrEqual(1.2)
          expect(r.perKg).toBeLessThanOrEqual(2.4)
        }
      }
    }
  })

  it('raises the floor to 1.2 g/kg from 65', () => {
    const sedentary = {
      ...base,
      sex: 'female' as const,
      weightKg: 90,
      heightCm: 158,
      activityLevel: 'sedentary' as const,
    }
    const older = proteinRecommendation({ ...sedentary, age: 70 })
    expect(older.proteinG).toBe(Math.round(90 * 1.2))
    expect(
      proteinRecommendation({ ...sedentary, age: 40 }).proteinG,
    ).toBeLessThan(older.proteinG)
  })

  it('asks more when cutting and when training hard', () => {
    const maintain = proteinRecommendation({ ...base, sex: 'male' })
    const cutting = proteinRecommendation({ ...base, sex: 'male', goal: 'lose' })
    const training = proteinRecommendation({
      ...base,
      sex: 'male',
      activityLevel: 'very_active',
    })
    expect(cutting.proteinG).toBeGreaterThan(maintain.proteinG)
    expect(training.proteinG).toBeGreaterThan(maintain.proteinG)
  })
})

describe('leanBodyMassKg', () => {
  it('never leaves the plausible share of bodyweight', () => {
    for (const sex of ['male', 'female'] as const) {
      for (const weightKg of [40, 70, 120, 200]) {
        for (const heightCm of [145, 170, 200]) {
          const lbm = leanBodyMassKg({ sex, weightKg, heightCm })
          expect(lbm).toBeGreaterThanOrEqual(weightKg * 0.4)
          expect(lbm).toBeLessThanOrEqual(weightKg * 0.85)
        }
      }
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
