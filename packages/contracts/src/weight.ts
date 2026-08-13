import { z } from 'zod'
import { dayString } from './primitives.js'

export const weightLog = z.object({
  id: z.string(),
  day: dayString,
  weightKg: z.number(),
  bodyFatPct: z.number().nullable(),
  note: z.string().nullable(),
})
export type WeightLog = z.infer<typeof weightLog>

export const weightResponse = z.object({
  items: z.array(weightLog),
  latest: weightLog.nullable(),
  /** Change over the queried window, not since the account was created. */
  changeKg: z.number(),
  startWeightKg: z.number().nullable(),
  targetWeightKg: z.number().nullable(),
  bmi: z.number().nullable(),
})
export type WeightResponse = z.infer<typeof weightResponse>
