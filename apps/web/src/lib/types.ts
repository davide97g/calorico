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
  /** Lifts the cap on meal-photo analysis. See hooks/use-premium.ts. */
  isPremium?: boolean
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

export interface PhotoQuota {
  isPremium: boolean
  /** Free photos analysed over the life of the account. */
  used: number
  /** null when premium, which is uncapped. */
  limit: number | null
  remaining: number | null
}

export interface PremiumStatus {
  isPremium: boolean
  since: string | null
  /** End of the period already paid for; null when there is nothing running. */
  until: string | null
  /** Cancelled, but still inside the period above. */
  cancelAtPeriodEnd: boolean
  /** False when the server has no Stripe keys: the paywall stays hidden. */
  paymentsEnabled: boolean
  /** Monthly price, in euro, for the copy on the paywall. */
  priceEur: number
  photoQuota: PhotoQuota
}

/** Stripe Checkout and the customer portal both answer with a URL to go to. */
export interface CheckoutSession {
  url: string
}

export interface VisionStatus {
  /** False when the server has no vision provider configured. */
  enabled: boolean
  quota: PhotoQuota
}

/** Every shot comes from Open Food Facts; users cannot add their own. */
export type FoodImageKind = 'front' | 'ingredients' | 'nutrition'

export interface FoodImage {
  id: string
  url: string
  kind: FoodImageKind
  width: number | null
  height: number | null
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
  packageSizeG: number | null
  packageSizeLabel: string | null
  unit: string
  isLiquid: boolean
  verified: boolean
  isFavorite?: boolean
}

/** One food's portion history, as GET /foods/:id/portions returns it. */
export interface FoodPortions {
  /** null when this user has never logged this food. */
  lastQuantityG: number | null
  /** Most-used first, at most three. */
  topQuantities: number[]
  times: number
}

/**
 * A food plus this user's history with it, as GET /foods/recent returns it.
 *
 * The portions are the reason this shape exists: logging the same food again is
 * the daily job, and it is only one tap if the quantity comes with the food.
 */
export interface RecentFood extends Food {
  /** The portion used the last time this food was logged. */
  lastQuantityG: number
  /** Its best-remembered portions, most-used first. At most three. */
  topQuantities: number[]
  times: number
  lastAt: string
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

/** The subset of a user shown next to anything they added or scanned. */
export interface PersonRef {
  id: string
  name: string
  avatarUrl?: string | null
}

export interface GroceryItem {
  id: string
  userId: string
  /** Null on a private list; set once the row belongs to a family. */
  familyId: string | null
  foodId: string | null
  dedupeKey: string
  nameSnapshot: string
  brandSnapshot: string | null
  quantity: number
  completed: boolean
  completedAt: string | null
  createdAt: string
  updatedAt: string
  /** Absent only on the optimistic row a mutation writes before the response. */
  addedBy?: PersonRef
}

export interface GroceryResponse {
  items: GroceryItem[]
}

export interface FamilyMember extends PersonRef {
  joinedAt: string
}

export interface Family {
  id: string
  name: string
  createdAt: string
  joinedAt: string
  members: FamilyMember[]
}

export interface FamiliesResponse {
  families: Family[]
  /** Where this user's new shared rows land. */
  activeFamilyId: string | null
}

export interface FamilyInvite {
  id: string
  familyId: string
  token: string
  expiresAt: string
  revokedAt: string | null
  createdAt: string
}

export interface InvitePreview {
  id: string
  familyId: string
  familyName: string
  expiresAt: string
  memberCount: number
  alreadyMember: boolean
}

export type ScanKind = 'barcode' | 'photo'

/**
 * One scanned item, not one scan: the API folds every scan of the same product
 * into a single row ranked by how often and how recently it comes up.
 */
export interface ScanHistoryItem {
  /** Stable per item, not per scan — safe as a list key, useless as a row id. */
  key: string
  kind: ScanKind
  foodId: string | null
  barcode: string | null
  nameSnapshot: string
  brandSnapshot: string | null
  /** Photo scans only: what the model saw. Never nutrition figures. */
  items: { label: string; quantityG: number }[] | null
  /** How many times this item was scanned, ever. */
  times: number
  lastAt: string
  /** Frequency and recency in one number; the order the list arrives in. */
  score: number
  scannedBy: PersonRef
}

export interface ScansResponse {
  items: ScanHistoryItem[]
  /** Offset to ask for next, or null at the end — the order is a score, not a clock. */
  nextOffset: number | null
}

/** A line the list has held before, offered back while typing. */
export interface GrocerySuggestion {
  key: string
  name: string
  brand: string | null
  foodId: string | null
  times: number
  lastAt: string
  score: number
}

export interface GrocerySuggestionsResponse {
  items: GrocerySuggestion[]
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

/** GET /profile/suggested — the formulas' answer for the stored metrics. */
export interface SuggestedTargets {
  /** The weigh-in the numbers were computed from. */
  weightKg: number
  targets: TargetEstimate
  /** Suggested protein per kg of bodyweight, for the hint text. */
  proteinPerKg: number
  leanBodyMassKg: number
}

export type Confidence = 'low' | 'medium' | 'high'

/** Per 100 g/ml, the model's own estimate. */
export interface Nutrients100 {
  kcal100: number
  protein100: number
  carbs100: number
  fat100: number
  fiber100: number | null
}

/** One food the photo analysis found, with catalogue candidates attached. */
export interface AnalyzedItem {
  label: string
  searchQuery: string
  quantityG: number
  confidence: Confidence
  /** What the quantity estimate is anchored on. Shown under the row. */
  basis: string
  isLiquid: boolean
  packaged: boolean
  nutrients100: Nutrients100 | null
  /** Best catalogue guesses, best first. May be empty. */
  candidates: Food[]
  /** True when candidates[0] is good enough to preselect. */
  matched: boolean
}

export interface MealAnalysis {
  items: AnalyzedItem[]
  labelText: string | null
}

/** What POST /api/diary/batch accepts for a food that is not in the catalogue. */
export interface NewFoodInput {
  name: string
  brand?: string
  kcal100: number
  protein100: number
  carbs100: number
  fat100: number
  fiber100?: number
  isLiquid: boolean
}

export type BatchEntryInput =
  | { foodId: string; quantityG: number }
  | { newFood: NewFoodInput; quantityG: number }

export type ReminderKind = 'meal' | 'review' | 'weight' | 'custom'

export interface Reminder {
  id: string
  kind: ReminderKind
  /** Set only for meal reminders; it is the meal the skip check looks at. */
  meal: Meal | null
  label: string
  /** Minutes since local midnight. 13:00 is 780. */
  atMinutes: number
  /** Days it fires on, 0 = Sunday. */
  weekdays: number[]
  skipIfLogged: boolean
  enabled: boolean
  lastSentOn: string | null
  lastSentAt: string | null
  createdAt: string
}

/** A suggested reminder. Sent by the API so labels match what gets delivered. */
export interface ReminderPreset {
  key: string
  kind: ReminderKind
  meal: Meal | null
  label: string
  atMinutes: number
  weekdays: number[]
  skipIfLogged: boolean
  description: string
}

export interface NotificationSettings {
  push: {
    /** False when the server has no VAPID keys: nothing can be delivered. */
    supported: boolean
    publicKey: string | null
  }
  enabled: boolean
  /** IANA zone the reminder times are read in. */
  timezone: string
  /** Browsers registered for this account. Zero means nothing arrives. */
  devices: number
  maxReminders: number
  presets: ReminderPreset[]
  reminders: Reminder[]
}

export interface AuthResponse {
  token: string
  user: User
  needsOnboarding: boolean
}
