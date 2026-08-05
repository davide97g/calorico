export const KCAL_PER_G = { protein: 4, carbs: 4, fat: 9 } as const

export const ACTIVITY_FACTOR = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
} as const

export type Sex = 'male' | 'female'
export type ActivityLevel = keyof typeof ACTIVITY_FACTOR
export type Goal = 'lose' | 'maintain' | 'gain'

/** Mifflin-St Jeor — the standard used by MyFitnessPal and friends. */
export function bmr(input: {
  sex: Sex
  weightKg: number
  heightCm: number
  age: number
}): number {
  const base = 10 * input.weightKg + 6.25 * input.heightCm - 5 * input.age
  return input.sex === 'male' ? base + 5 : base - 161
}

export function tdee(input: {
  sex: Sex
  weightKg: number
  heightCm: number
  age: number
  activityLevel: ActivityLevel
}): number {
  return bmr(input) * ACTIVITY_FACTOR[input.activityLevel]
}

const GOAL_DELTA: Record<Goal, number> = {
  lose: -0.2, // ~20% deficit, roughly 0.5 kg/week
  maintain: 0,
  gain: 0.12,
}

/**
 * Daily targets. Protein is anchored to bodyweight (a percentage split gives
 * absurd protein numbers at low calorie targets), fat gets a floor of 25% of
 * calories for hormonal health, carbs take the remainder.
 */
export function dailyTargets(input: {
  sex: Sex
  weightKg: number
  heightCm: number
  age: number
  activityLevel: ActivityLevel
  goal: Goal
}) {
  const maintenance = tdee(input)
  const kcal = Math.round((maintenance * (1 + GOAL_DELTA[input.goal])) / 10) * 10

  const proteinPerKg = input.goal === 'lose' ? 2.0 : 1.7
  const proteinG = Math.round(input.weightKg * proteinPerKg)
  const fatG = Math.round((kcal * 0.27) / KCAL_PER_G.fat)
  const remaining =
    kcal - proteinG * KCAL_PER_G.protein - fatG * KCAL_PER_G.fat
  const carbsG = Math.max(50, Math.round(remaining / KCAL_PER_G.carbs))

  return {
    maintenanceKcal: Math.round(maintenance),
    targetKcal: kcal,
    targetProteinG: proteinG,
    targetCarbsG: carbsG,
    targetFatG: fatG,
    targetKcalMin: kcal - 150,
    targetKcalMax: kcal + 150,
  }
}

export function ageFromBirthDate(birthDate: string | Date, today = new Date()) {
  const b = new Date(birthDate)
  let age = today.getFullYear() - b.getFullYear()
  const m = today.getMonth() - b.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < b.getDate())) age--
  return age
}

/** Scales a per-100 g nutriment set to an arbitrary gram quantity. */
export function scaleNutriments(
  per100: {
    kcal100: number
    protein100: number
    carbs100: number
    fat100: number
    fiber100?: number | null
  },
  grams: number,
) {
  const f = grams / 100
  const round = (n: number) => Math.round(n * 10) / 10
  return {
    kcal: Math.round(per100.kcal100 * f),
    proteinG: round(per100.protein100 * f),
    carbsG: round(per100.carbs100 * f),
    fatG: round(per100.fat100 * f),
    fiberG:
      per100.fiber100 == null ? null : round(per100.fiber100 * f),
  }
}

/**
 * Some OFF records only carry kJ, others only carry the macros. Fill the gaps
 * instead of storing a 0 kcal product that silently ruins a day's totals.
 */
export function deriveKcal(input: {
  kcal?: number | null
  kj?: number | null
  protein?: number | null
  carbs?: number | null
  fat?: number | null
}): number | null {
  if (input.kcal != null && input.kcal > 0) return input.kcal
  if (input.kj != null && input.kj > 0) return input.kj / 4.184
  const { protein, carbs, fat } = input
  if (protein == null && carbs == null && fat == null) return null
  const computed =
    (protein ?? 0) * KCAL_PER_G.protein +
    (carbs ?? 0) * KCAL_PER_G.carbs +
    (fat ?? 0) * KCAL_PER_G.fat
  return computed > 0 ? computed : null
}
