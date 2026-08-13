import { z } from 'zod'
import { dayString, mealSlot, reminderKind, timestamp } from './primitives.js'

export const reminder = z.object({
  id: z.string(),
  kind: reminderKind,
  /** Set only for meal reminders; it is the meal the skip check looks at. */
  meal: mealSlot.nullable(),
  label: z.string(),
  /** Minutes since local midnight. 13:00 is 780. */
  atMinutes: z.number(),
  /** Days it fires on, 0 = Sunday. */
  weekdays: z.array(z.number()),
  skipIfLogged: z.boolean(),
  enabled: z.boolean(),
  lastSentOn: dayString.nullable(),
  lastSentAt: timestamp.nullable(),
  createdAt: timestamp,
})
export type Reminder = z.infer<typeof reminder>

/**
 * A suggested reminder. Sent by the API rather than written into the browser so
 * the labels the scheduler delivers and the labels the settings screen offers
 * cannot drift apart.
 */
export const reminderPreset = z.object({
  key: z.string(),
  kind: reminderKind,
  meal: mealSlot.nullable(),
  label: z.string(),
  atMinutes: z.number(),
  weekdays: z.array(z.number()),
  skipIfLogged: z.boolean(),
  description: z.string(),
})
export type ReminderPreset = z.infer<typeof reminderPreset>

export const notificationSettings = z.object({
  push: z.object({
    /** False when the server has no VAPID keys: nothing can be delivered. */
    supported: z.boolean(),
    publicKey: z.string().nullable(),
  }),
  enabled: z.boolean(),
  /** IANA zone the reminder times are read in. */
  timezone: z.string(),
  /** Browsers registered for this account. Zero means nothing arrives. */
  devices: z.number(),
  maxReminders: z.number(),
  presets: z.array(reminderPreset),
  reminders: z.array(reminder),
})
export type NotificationSettings = z.infer<typeof notificationSettings>
