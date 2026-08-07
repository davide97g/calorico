import { and, eq, sql as raw } from 'drizzle-orm'
import { db } from '../../db/index.js'
import {
  diaryEntries,
  profiles,
  pushSubscriptions,
  reminders,
  weightLogs,
} from '../../db/schema.js'
import { env } from '../../env.js'
import { pushConfigured, sendPush, type PushPayload } from '../push/send.js'
import { reminderMessage, type Meal, type ReminderKind } from './presets.js'

/**
 * The reminder scheduler: one pass a minute, no queue, no cron container.
 *
 * Three things make that safe rather than merely simple.
 *
 * **Postgres owns the clock arithmetic.** A reminder is a wall-clock time and
 * the user's zone lives in `profiles.timezone`, so `now() at time zone
 * profiles.timezone` answers "is it 13:00 for this person?" without a line of
 * timezone maths here — and without the process having to agree with the
 * database about what day it is.
 *
 * **A reminder is claimed before it is sent.** The claim is a conditional write
 * of today's local date into `last_sent_on`; only the pass that changes that row
 * sends. A restart mid-window, or a second API container, therefore cannot
 * double-notify.
 *
 * **Nothing is retried outside the grace window.** A reminder that could not go
 * out within REMINDER_GRACE_MINUTES of its time is dropped for the day: a nudge
 * to log lunch arriving at 17:00 is worse than silence.
 */

const TICK_MS = 60_000

/** One tick's ceiling. Far above any realistic user count on one VPS. */
const MAX_PER_TICK = 500

interface DueRow {
  id: string
  userId: string
  kind: ReminderKind
  meal: Meal | null
  label: string
  skipIfLogged: boolean
  /** Restored if delivery fails outright, so the claim is not lost silently. */
  previousSentOn: string | null
  /** The user's local calendar day, as Postgres computed it. */
  localDay: string
}

/** Everything armed, due right now, and with a device to deliver to. */
export async function findDueReminders(
  graceMinutes = env.REMINDER_GRACE_MINUTES,
): Promise<DueRow[]> {
  const localNow = raw`(now() at time zone ${profiles.timezone})`
  const localDay = raw<string>`${localNow}::date`
  const localMinutes = raw<number>`(extract(hour from ${localNow})::int * 60 + extract(minute from ${localNow})::int)`

  return db
    .select({
      id: reminders.id,
      userId: reminders.userId,
      kind: reminders.kind,
      meal: reminders.meal,
      label: reminders.label,
      skipIfLogged: reminders.skipIfLogged,
      previousSentOn: reminders.lastSentOn,
      localDay,
    })
    .from(reminders)
    .innerJoin(profiles, eq(profiles.userId, reminders.userId))
    .where(
      and(
        eq(reminders.enabled, true),
        eq(profiles.notificationsEnabled, true),
        raw`extract(dow from ${localNow})::int = any(${reminders.weekdays})`,
        // The window opens at the reminder's time and closes graceMinutes
        // later. A reminder set within the grace of local midnight simply gets
        // a shorter window: the day rolls over and it is no longer due.
        raw`${localMinutes} between ${reminders.atMinutes} and ${reminders.atMinutes} + ${graceMinutes}`,
        raw`(${reminders.lastSentOn} is null or ${reminders.lastSentOn} <> ${localDay})`,
        // No device, nothing to send to — and skipping here keeps a user who
        // revoked notification permission out of every later step.
        raw`exists (select 1 from ${pushSubscriptions} s where s.user_id = ${reminders.userId})`,
      ),
    )
    .limit(MAX_PER_TICK)
}

/**
 * Whether the thing this reminder nudges is already done. Only asked when the
 * reminder has `skipIfLogged`, and never for `custom`: a free-text reminder has
 * nothing in the database that could mark it complete.
 */
export async function alreadyHandled(row: DueRow): Promise<boolean> {
  switch (row.kind) {
    case 'meal': {
      if (!row.meal) return false
      const [entry] = await db
        .select({ id: diaryEntries.id })
        .from(diaryEntries)
        .where(
          and(
            eq(diaryEntries.userId, row.userId),
            eq(diaryEntries.day, row.localDay),
            eq(diaryEntries.meal, row.meal),
          ),
        )
        .limit(1)
      return Boolean(entry)
    }
    case 'review': {
      // "Already reviewed" is not a thing we store, so the proxy is the day
      // being inside its calorie band: past the lower edge there is nothing
      // left to nag about.
      const [row_] = await db
        .select({
          kcal: raw<number>`coalesce(sum(${diaryEntries.kcal}), 0)::float`,
          target: profiles.targetKcalMin,
        })
        .from(profiles)
        .leftJoin(
          diaryEntries,
          and(
            eq(diaryEntries.userId, profiles.userId),
            eq(diaryEntries.day, row.localDay),
          ),
        )
        .where(eq(profiles.userId, row.userId))
        .groupBy(profiles.targetKcalMin)
      if (!row_) return false
      return row_.kcal >= row_.target
    }
    case 'weight': {
      const [log] = await db
        .select({ id: weightLogs.id })
        .from(weightLogs)
        .where(
          and(
            eq(weightLogs.userId, row.userId),
            eq(weightLogs.day, row.localDay),
          ),
        )
        .limit(1)
      return Boolean(log)
    }
    case 'custom':
      return false
  }
}

/**
 * Takes the day's slot for this reminder. Conditional on `last_sent_on` still
 * being what the due query saw, so exactly one caller can win.
 */
async function claim(id: string, localDay: string): Promise<boolean> {
  const claimed = await db
    .update(reminders)
    .set({ lastSentOn: localDay, lastSentAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(reminders.id, id),
        raw`(${reminders.lastSentOn} is null or ${reminders.lastSentOn} <> ${localDay})`,
      ),
    )
    .returning({ id: reminders.id })

  return claimed.length > 0
}

/** Hands the slot back, so a transient delivery failure can retry this tick+1. */
async function releaseClaim(id: string, previousSentOn: string | null) {
  await db
    .update(reminders)
    .set({ lastSentOn: previousSentOn })
    .where(eq(reminders.id, id))
}

export type Sender = (
  target: { endpoint: string; p256dh: string; auth: string },
  payload: PushPayload,
) => Promise<'sent' | 'gone' | 'failed'>

/**
 * Pushes to every device of one user. Returns how many got it — zero means the
 * caller should not consider the reminder delivered.
 *
 * A `gone` verdict deletes the row on the spot: that endpoint will never work
 * again, and leaving it behind would make every later tick pay for it.
 */
export async function deliver(
  userId: string,
  payload: PushPayload,
  send: Sender = sendPush,
): Promise<{ sent: number; removed: number; failed: number }> {
  const targets = await db
    .select({
      id: pushSubscriptions.id,
      endpoint: pushSubscriptions.endpoint,
      p256dh: pushSubscriptions.p256dh,
      auth: pushSubscriptions.auth,
    })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId))

  let sent = 0
  let removed = 0
  let failed = 0

  for (const target of targets) {
    const result = await send(target, payload)
    if (result === 'sent') {
      sent += 1
      await db
        .update(pushSubscriptions)
        .set({ lastSuccessAt: new Date() })
        .where(eq(pushSubscriptions.id, target.id))
      continue
    }
    // Both remaining verdicts are a device that did not get it; only one of
    // them means the row is worthless. The count of the rest is what tells a
    // caller "there were devices, the push itself was refused" — the difference
    // between a misconfigured server and an account with no phone on it.
    failed += 1
    if (result === 'gone') {
      removed += 1
      await db
        .delete(pushSubscriptions)
        .where(eq(pushSubscriptions.id, target.id))
    }
  }

  return { sent, removed, failed }
}

export interface TickResult {
  due: number
  sent: number
  skipped: number
  failed: number
}

/** One pass. Exported separately from the timer so tests can call it directly. */
export async function runDueReminders(send: Sender = sendPush): Promise<TickResult> {
  const rows = await findDueReminders()
  const result: TickResult = { due: rows.length, sent: 0, skipped: 0, failed: 0 }

  for (const row of rows) {
    if (row.skipIfLogged && (await alreadyHandled(row))) {
      result.skipped += 1
      continue
    }

    // Claim first, send second: the reverse order double-notifies on a restart.
    if (!(await claim(row.id, row.localDay))) {
      result.skipped += 1
      continue
    }

    const { sent } = await deliver(row.userId, reminderMessage(row), send)
    if (sent > 0) {
      result.sent += 1
      continue
    }

    // Nothing landed. If it was a dead subscription the row is gone now and the
    // due query will not return this reminder again; if it was the network, the
    // released claim gives it another chance inside the grace window.
    result.failed += 1
    await releaseClaim(row.id, row.previousSentOn)
  }

  return result
}

interface Logger {
  info: (obj: object, msg: string) => void
  warn: (obj: object, msg: string) => void
  error: (obj: object, msg: string) => void
}

/**
 * Starts the per-minute pass. Called from index.ts rather than app.ts so the
 * test suite, which builds the app dozens of times, never starts a timer.
 *
 * Returns the stopper. A pass that overlaps the next tick is skipped rather than
 * queued — the work is idempotent, and the next minute will pick it up anyway.
 */
export function startReminderScheduler(log: Logger): () => void {
  if (!pushConfigured()) {
    // Warn, not info: on a deployment that means every reminder anyone sets is
    // silently never sent, and that should not be buried at info level.
    log.warn(
      {},
      'reminders: VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT not all set, scheduler not started',
    )
    return () => {}
  }

  let running = false
  const tick = async () => {
    if (running) return
    running = true
    try {
      const result = await runDueReminders()
      if (result.due > 0) log.info(result, 'reminders: pass complete')
      // Reminders that were due, claimed and then landed nowhere. Usually a push
      // service refusing the keys, which is invisible from the client.
      if (result.failed > 0) {
        log.warn({ failed: result.failed }, 'reminders: deliveries failed')
      }
      if (result.due === MAX_PER_TICK) {
        log.warn({ cap: MAX_PER_TICK }, 'reminders: hit the per-pass cap')
      }
    } catch (err) {
      log.error({ err }, 'reminders: pass failed')
    } finally {
      running = false
    }
  }

  const timer = setInterval(() => void tick(), TICK_MS)
  // A deploy that lands mid-window should still deliver, so the first pass runs
  // now instead of a minute from now.
  void tick()

  log.info({ graceMinutes: env.REMINDER_GRACE_MINUTES }, 'reminders: scheduler started')
  return () => clearInterval(timer)
}
