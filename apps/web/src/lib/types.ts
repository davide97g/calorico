export type Meal = 'breakfast' | 'lunch' | 'dinner' | 'snack'
export type Sex = 'male' | 'female'
export type ActivityLevel =
  | 'sedentary'
  | 'light'
  | 'moderate'
  | 'active'
  | 'very_active'
export type Goal = 'lose' | 'maintain' | 'gain'
export type FoodSource = 'off' | 'generic' | 'custom'

export interface User {
  id: string
  email: string
  name: string
  avatarUrl?: string | null
}

export interface Profile {
  userId: string
  sex: Sex
  birthDate: string | null
  heightCm: number | null
  startWeightKg: number | null
  targetWeightKg: number | null
  activityLevel: ActivityLevel
  goal: Goal
  targetKcal: number
  targetProteinG: number
  targetCarbsG: number
  targetFatG: number
  targetKcalMin: number
  targetKcalMax: number
  locale: string
}

export type FoodImageKind = 'front' | 'ingredients' | 'nutrition' | 'user'

export interface FoodImage {
  id: string
  url: string
  kind: FoodImageKind
  width: number | null
  height: number | null
  /** Uploaded by the signed-in user, so it can also be deleted by them. */
  mine: boolean
}

export interface Food {
  id: string
  source: FoodSource
  barcode: string | null
  name: string
  brand: string | null
  category: string | null
  imageUrl: string | null
  kcal100: number
  protein100: number
  carbs100: number
  sugars100: number | null
  fat100: number
  satFat100: number | null
  fiber100: number | null
  salt100: number | null
  servingSizeG: number | null
  servingLabel: string | null
  unit: string
  isLiquid: boolean
  verified: boolean
  isFavorite?: boolean
  /** Only returned by the single-food endpoint; lists never carry photos. */
  images?: FoodImage[]
  imageUploadEnabled?: boolean
}

export interface DiaryEntry {
  id: string
  foodId: string | null
  day: string
  meal: Meal
  quantityG: number
  nameSnapshot: string
  brandSnapshot: string | null
  kcal: number
  proteinG: number
  carbsG: number
  fatG: number
  fiberG: number | null
  imageUrl?: string | null
  unit?: string
  servingSizeG?: number | null
}

export interface Totals {
  kcal: number
  proteinG: number
  carbsG: number
  fatG: number
  fiberG: number
}

export interface DayTargets {
  kcal: number
  proteinG: number
  carbsG: number
  fatG: number
  kcalMin: number
  kcalMax: number
}

export interface DiaryDay {
  day: string
  entries: DiaryEntry[]
  byMeal: Record<Meal, DiaryEntry[]>
  totals: Totals
  targets: DayTargets | null
}

export interface DailyStat {
  day: string
  kcal: number
  proteinG: number
  carbsG: number
  fatG: number
  entries: number
}

export interface StatsResponse {
  days: DailyStat[]
  summary: {
    loggedDays: number
    avgKcal: number
    avgProteinG: number
    avgCarbsG: number
    avgFatG: number
    daysInRange: number
  }
  targets: DayTargets | null
}

export interface WeightLog {
  id: string
  day: string
  weightKg: number
  bodyFatPct: number | null
  note: string | null
}

export interface WeightResponse {
  items: WeightLog[]
  latest: WeightLog | null
  changeKg: number
  startWeightKg: number | null
  targetWeightKg: number | null
  bmi: number | null
}

export interface TargetEstimate {
  maintenanceKcal: number
  targetKcal: number
  targetProteinG: number
  targetCarbsG: number
  targetFatG: number
  targetKcalMin: number
  targetKcalMax: number
}

export interface AuthResponse {
  token: string
  user: User
  needsOnboarding: boolean
}
