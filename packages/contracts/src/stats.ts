import { z } from 'zod'
import { dayTargets, totals } from './diary.js'
import { dayString, mealSlot, periodUnit } from './primitives.js'

export const dailyStat = z.object({
  day: dayString,
  kcal: z.number(),
  proteinG: z.number(),
  carbsG: z.number(),
  fatG: z.number(),
  fiberG: z.number().optional(),
  entries: z.number(),
})
export type DailyStat = z.infer<typeof dailyStat>

/** GET /stats/daily — one row per calendar day, empty days included. */
export const statsResponse = z.object({
  days: z.array(dailyStat),
  summary: z.object({
    /** Averages below are per logged day, so this is their denominator. */
    loggedDays: z.number(),
    avgKcal: z.number(),
    avgProteinG: z.number(),
    avgCarbsG: z.number(),
    avgFatG: z.number(),
    daysInRange: z.number(),
  }),
  targets: dayTargets.nullable(),
})
export type StatsResponse = z.infer<typeof statsResponse>

/** One meal's slice of a day or of a period. */
export const mealShare = z.object({
  meal: mealSlot,
  kcal: z.number(),
  /** Percent of the period's calories. */
  share: z.number(),
  /** Per day this meal was actually logged, not per calendar day. */
  avgKcal: z.number(),
  days: z.number(),
  entries: z.number(),
})
export type MealShare = z.infer<typeof mealShare>

export const mealShareWithMacros = mealShare.extend({
  proteinG: z.number(),
  carbsG: z.number(),
  fatG: z.number(),
})
export type MealShareWithMacros = z.infer<typeof mealShareWithMacros>

export const topFood = z.object({
  name: z.string(),
  brand: z.string().nullable(),
  kcal: z.number(),
  quantityG: z.number(),
  times: z.number(),
})
export type TopFood = z.infer<typeof topFood>

/** GET /stats/day — one day, plus what to read it against. */
export const dayStats = z.object({
  day: dayString,
  totals: totals.extend({ entries: z.number() }),
  byMeal: z.array(mealShareWithMacros),
  topFoods: z.array(topFood),
  /** Null wherever there is no history to compare with, never 0. */
  context: z.object({
    prevDayKcal: z.number().nullable(),
    recentAvgKcal: z.number().nullable(),
    recentDays: z.number(),
    weekdayAvgKcal: z.number().nullable(),
    weekdayDays: z.number(),
  }),
  targets: dayTargets.nullable(),
})
export type DayStats = z.infer<typeof dayStats>

/** What the scale did across one bucket. Null when it was never stepped on. */
export const weightSpan = z.object({
  startKg: z.number(),
  endKg: z.number(),
  changeKg: z.number(),
  avgKg: z.number(),
  count: z.number(),
})
export type WeightSpan = z.infer<typeof weightSpan>

/** One week or month of the diary, as GET /stats/periods returns it. */
export const periodBucket = z.object({
  /** The bucket's own first day, even when the range starts mid-bucket. */
  key: dayString,
  /** First and last day covered — a running week stops at today. */
  from: dayString,
  to: dayString,
  days: z.number(),
  loggedDays: z.number(),
  entries: z.number(),
  totalKcal: z.number(),
  /** Averages are per logged day. */
  avgKcal: z.number(),
  avgProteinG: z.number(),
  avgCarbsG: z.number(),
  avgFatG: z.number(),
  avgFiberG: z.number(),
  avgSugarsG: z.number(),
  avgSatFatG: z.number(),
  avgSaltG: z.number(),
  daysInRange: z.number(),
  daysUnder: z.number(),
  daysOver: z.number(),
  lightestDay: z.object({ day: dayString, kcal: z.number() }).nullable(),
  heaviestDay: z.object({ day: dayString, kcal: z.number() }).nullable(),
  weight: weightSpan.nullable(),
  dailyStats: z.array(dailyStat),
})
export type PeriodBucket = z.infer<typeof periodBucket>

export const periodsResponse = z.object({
  unit: periodUnit,
  buckets: z.array(periodBucket),
  targets: dayTargets.nullable(),
})
export type PeriodsResponse = z.infer<typeof periodsResponse>

/** GET /stats/breakdown — a range seen as one shape rather than day by day. */
export const breakdownResponse = z.object({
  from: dayString,
  to: dayString,
  days: z.number(),
  loggedDays: z.number(),
  entries: z.number(),
  totalKcal: z.number(),
  /** Percent of calendar days with at least one entry. */
  coverage: z.number(),
  mealSplit: z.array(mealShare),
  /** Sunday-first, matching WEEKDAY_INITIALS on the client. */
  weekdayPattern: z.array(
    z.object({
      dow: z.number(),
      avgKcal: z.number(),
      loggedDays: z.number(),
    }),
  ),
  topFoods: z.array(topFood.extend({ days: z.number(), share: z.number() })),
  streak: z.object({
    current: z.number(),
    longest: z.number(),
    lastLoggedDay: dayString.nullable(),
  }),
})
export type BreakdownResponse = z.infer<typeof breakdownResponse>
