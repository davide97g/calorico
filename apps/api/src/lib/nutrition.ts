export const KCAL_PER_G = { protein: 4, carbs: 4, fat: 9 } as const

/**
 * How every response rounds: kcal to the unit, macros to a tenth of a gram.
 * Scales beyond that are noise — no label is accurate to a centigram — and a
 * tenth is what the client renders, so rounding here keeps the number the
 * server adds up and the number the screen shows the same number.
 */
export const roundKcal = (n: number) => Math.round(n)
export const roundMacro = (n: number) => Math.round(n * 10) / 10

/** The kcal-plus-macros bundle every totals payload carries. */
export interface Nutrients {
  kcal: number
  proteinG: number
  carbsG: number
  fatG: number
  fiberG: number
  sugarsG: number
  satFatG: number
  saltG: number
}

/**
 * Adds up diary rows. The optional macros are nullable per row — a food with no
 * fibre figure is not a food with 0 g of fibre — but a total of nothing is 0,
 * because the alternative is a day whose fibre disappears the moment one entry
 * lacks it.
 */
export function sumNutrients(
  rows: Iterable<{
    kcal: number
    proteinG: number
    carbsG: number
    fatG: number
    fiberG?: number | null
    sugarsG?: number | null
    satFatG?: number | null
    saltG?: number | null
  }>,
): Nutrients {
  const totals: Nutrients = {
    kcal: 0,
    proteinG: 0,
    carbsG: 0,
    fatG: 0,
    fiberG: 0,
    sugarsG: 0,
    satFatG: 0,
    saltG: 0,
  }
  for (const row of rows) {
    totals.kcal += row.kcal
    totals.proteinG += row.proteinG
    totals.carbsG += row.carbsG
    totals.fatG += row.fatG
    totals.fiberG += row.fiberG ?? 0
    totals.sugarsG += row.sugarsG ?? 0
    totals.satFatG += row.satFatG ?? 0
    totals.saltG += row.saltG ?? 0
  }
  return totals
}

/** Rounds a summed bundle for the wire. Sum first, round once, at the end. */
export function roundNutrients(totals: Nutrients): Nutrients {
  return {
    kcal: roundKcal(totals.kcal),
    proteinG: roundMacro(totals.proteinG),
    carbsG: roundMacro(totals.carbsG),
    fatG: roundMacro(totals.fatG),
    fiberG: roundMacro(totals.fiberG),
    sugarsG: roundMacro(totals.sugarsG),
    satFatG: roundMacro(totals.satFatG),
    saltG: roundMacro(totals.saltG),
  }
}

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
 * Boer lean body mass. Sex enters the protein target here rather than through a
 * made-up multiplier: the guidelines are stated per kg of bodyweight and assume
 * an average composition, which is exactly what differs between a man and a
 * woman of the same weight and height.
 *
 * The clamp keeps the formula honest outside the range it was fitted on — it
 * drifts high for short light bodies and low for very heavy ones.
 */
export function leanBodyMassKg(input: {
  sex: Sex
  weightKg: number
  heightCm: number
}): number {
  const raw =
    input.sex === 'male'
      ? 0.407 * input.weightKg + 0.267 * input.heightCm - 19.2
      : 0.252 * input.weightKg + 0.473 * input.heightCm - 48.3
  return Math.min(Math.max(raw, input.weightKg * 0.4), input.weightKg * 0.85)
}

/** Grams of protein per kg of lean mass. ~2.2 maintaining, more on a cut. */
const PROTEIN_PER_KG_LBM: Record<Goal, number> = {
  lose: 2.6,
  maintain: 2.2,
  gain: 2.4,
}

/** Training volume moves the target inside the 1.2–2.0 g/kg bodyweight band. */
const ACTIVITY_PROTEIN_DELTA: Record<ActivityLevel, number> = {
  sedentary: -0.3,
  light: -0.15,
  moderate: 0,
  active: 0.15,
  very_active: 0.3,
}

/**
 * Standard protein recommendation for one person.
 *
 * Anchored to lean mass (so sex, height and weight all count), then bracketed
 * by the per-bodyweight guidance: a 1.0 g/kg floor — well over the 0.8 g/kg
 * RDA, raised to 1.2 g/kg from 65 as PROT-AGE/ESPEN advise against sarcopenia —
 * and a 2.4 g/kg ceiling, the top of the ISSN range for athletes cutting.
 */
export function proteinRecommendation(input: {
  sex: Sex
  weightKg: number
  heightCm: number
  age: number
  activityLevel: ActivityLevel
  goal: Goal
}) {
  const lbmKg = leanBodyMassKg(input)
  const perKgLbm =
    PROTEIN_PER_KG_LBM[input.goal] + ACTIVITY_PROTEIN_DELTA[input.activityLevel]

  const floorPerKg = input.age >= 65 ? 1.2 : 1.0
  const grams = Math.min(
    Math.max(lbmKg * perKgLbm, input.weightKg * floorPerKg),
    input.weightKg * 2.4,
  )
  const proteinG = Math.round(grams)

  return {
    proteinG,
    lbmKg: Math.round(lbmKg * 10) / 10,
    /** For the UI: what the target works out to per kg of bodyweight. */
    perKg: Math.round((proteinG / input.weightKg) * 100) / 100,
  }
}

/**
 * Daily targets. Protein comes from proteinRecommendation (a percentage split
 * gives absurd protein numbers at low calorie targets), fat gets a floor of 25%
 * of calories for hormonal health, carbs take the remainder.
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

  const { proteinG } = proteinRecommendation(input)
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
    sugars100?: number | null
    satFat100?: number | null
    salt100?: number | null
  },
  grams: number,
) {
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
