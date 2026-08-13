import { z } from 'zod'
import {
  activityLevel,
  dayString,
  goal,
  sex,
  timestamp,
} from './primitives.js'

export const user = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  avatarUrl: z.string().nullable().optional(),
  /** Lifts the cap on meal-photo analysis. */
  isPremium: z.boolean().optional(),
})
export type User = z.infer<typeof user>

export const authResponse = z.object({
  token: z.string(),
  user,
  /** A profile without body metrics cannot produce meaningful targets. */
  needsOnboarding: z.boolean(),
})
export type AuthResponse = z.infer<typeof authResponse>

export const profile = z.object({
  userId: z.string(),
  sex,
  birthDate: dayString.nullable(),
  heightCm: z.number().nullable(),
  startWeightKg: z.number().nullable(),
  targetWeightKg: z.number().nullable(),
  activityLevel,
  goal,
  targetKcal: z.number(),
  targetProteinG: z.number(),
  targetCarbsG: z.number(),
  targetFatG: z.number(),
  targetKcalMin: z.number(),
  targetKcalMax: z.number(),
  locale: z.string(),
})
export type Profile = z.infer<typeof profile>

/** GET /auth/me — the session, its profile, and whether onboarding is done. */
export const meResponse = z.object({
  user,
  /** Null between registering and finishing onboarding. */
  profile: profile.nullable(),
  needsOnboarding: z.boolean(),
})
export type MeResponse = z.infer<typeof meResponse>

/**
 * The metrics both /profile/estimate and /profile/onboarding take — the numbers
 * the target formulas are computed from. A **request** schema: the API parses
 * with it, and the onboarding form is typed by it.
 */
export const bodyMetrics = z.object({
  sex,
  birthDate: dayString,
  heightCm: z.number().min(80).max(250),
  weightKg: z.number().min(25).max(400),
  activityLevel,
  goal,
  targetWeightKg: z.number().min(25).max(400).optional(),
})
export type BodyMetrics = z.infer<typeof bodyMetrics>

export const targetEstimate = z.object({
  maintenanceKcal: z.number(),
  targetKcal: z.number(),
  targetProteinG: z.number(),
  targetCarbsG: z.number(),
  targetFatG: z.number(),
  targetKcalMin: z.number(),
  targetKcalMax: z.number(),
})
export type TargetEstimate = z.infer<typeof targetEstimate>

/** GET /profile/suggested — the formulas' answer for the stored metrics. */
export const suggestedTargets = z.object({
  /** The weigh-in the numbers were computed from. */
  weightKg: z.number(),
  targets: targetEstimate,
  /** Suggested protein per kg of bodyweight, for the hint text. */
  proteinPerKg: z.number(),
  leanBodyMassKg: z.number(),
})
export type SuggestedTargets = z.infer<typeof suggestedTargets>

export const photoQuota = z.object({
  isPremium: z.boolean(),
  /** Free photos analysed over the life of the account. */
  used: z.number(),
  /** null when premium, which is uncapped. */
  limit: z.number().nullable(),
  remaining: z.number().nullable(),
})
export type PhotoQuota = z.infer<typeof photoQuota>

export const premiumStatus = z.object({
  isPremium: z.boolean(),
  since: timestamp.nullable(),
  /** End of the period already paid for; null when there is nothing running. */
  until: timestamp.nullable(),
  /** Cancelled, but still inside the period above. */
  cancelAtPeriodEnd: z.boolean(),
  /** False when the server has no Stripe keys: the paywall stays hidden. */
  paymentsEnabled: z.boolean(),
  /** Monthly price, in euro, for the copy on the paywall. */
  priceEur: z.number(),
  photoQuota,
})
export type PremiumStatus = z.infer<typeof premiumStatus>

/** Stripe Checkout and the customer portal both answer with a URL to go to. */
export const checkoutSession = z.object({ url: z.string() })
export type CheckoutSession = z.infer<typeof checkoutSession>
