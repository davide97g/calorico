import type { FastifyInstance } from 'fastify'
import { beforeAll, beforeEach, afterAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '../../db/index.js'
import {
  diaryEntries,
  profiles,
  pushSubscriptions,
  reminders,
  weightLogs,
} from '../../db/schema.js'
import {
  auth,
  createUser,
  hasDb,
  resetDb,
  startApp,
  stopApp,
  type TestUser,
} from '../../test/harness.js'
import { runDueReminders, type Sender } from './scheduler.js'
import type { PushPayload } from '../push/send.js'

/**
 * The scheduler, against a real Postgres — which is the only way to test it: the
 * "is it 13:00 for this user?" decision is a `now() at time zone
 * profiles.timezone` comparison, and a fake would be testing the fake.
 *
 * The tests fix the user's zone and then set a reminder to whatever time it is
 * *there*, so they pass at any wall-clock moment in any CI region.
 */
describe.skipIf(!hasDb)('reminder scheduler', () => {
  let app: FastifyInstance
  let user: TestUser

  const TZ = 'Europe/Rome'

  /** The user's local day, weekday and minute-of-day, computed the same way. */
  function localNow(timeZone = TZ) {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).formatToParts(new Date())
    const at = (type: string) => parts.find((p) => p.type === type)!.value
    const day = `${at('year')}-${at('month')}-${at('day')}`
    // '24' shows up at midnight in some ICU versions.
    const hour = Number(at('hour')) % 24
    return {
      day,
      minutes: hour * 60 + Number(at('minute')),
      weekday: new Date(`${day}T12:00:00Z`).getUTCDay(),
    }
  }

  /** Everything a reminder needs to be considered: zone, switch, a device. */
  async function armUser(timeZone = TZ) {
    await db
      .update(profiles)
      .set({ notificationsEnabled: true, timezone: timeZone })
      .where(eq(profiles.userId, user.id))
    await db.insert(pushSubscriptions).values({
      userId: user.id,
      endpoint: `https://push.example.test/${user.id}`,
      p256dh: 'client-public-key',
      auth: 'client-secret',
    })
  }

  async function addReminder(overrides: Partial<typeof reminders.$inferInsert>) {
    const now = localNow()
    const [row] = await db
      .insert(reminders)
      .values({
        userId: user.id,
        kind: 'custom',
        label: 'Bevi acqua',
        atMinutes: now.minutes,
        weekdays: [now.weekday],
        skipIfLogged: false,
        ...overrides,
      })
      .returning()
    return row!
  }

  /** Records what would have been pushed, so nothing leaves the process. */
  function recorder(result: 'sent' | 'gone' | 'failed' = 'sent') {
    const calls: PushPayload[] = []
    const send: Sender = async (_target, payload) => {
      calls.push(payload)
      return result
    }
    return { calls, send }
  }

  beforeAll(async () => {
    app = await startApp()
  })
  afterAll(async () => {
    await stopApp(app)
  })
  beforeEach(async () => {
    await resetDb()
    user = await createUser(app)
  })

  it('sends a due reminder once and never twice the same day', async () => {
    await armUser()
    const reminder = await addReminder({ label: 'Bevi acqua' })
    const { calls, send } = recorder()

    const first = await runDueReminders(send)
    expect(first.sent).toBe(1)
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ title: 'Calorico', body: 'Bevi acqua' })

    // Still inside the grace window, so it is still "due" by the clock — the
    // claim is what stops it.
    const second = await runDueReminders(send)
    expect(second.sent).toBe(0)
    expect(calls).toHaveLength(1)

    const [row] = await db
      .select({ lastSentOn: reminders.lastSentOn })
      .from(reminders)
      .where(eq(reminders.id, reminder.id))
    expect(row?.lastSentOn).toBe(localNow().day)
  })

  it('addresses a meal reminder to that meal', async () => {
    await armUser()
    await addReminder({
      kind: 'meal',
      meal: 'dinner',
      label: 'Cena',
      skipIfLogged: false,
    })
    const { calls, send } = recorder()

    await runDueReminders(send)
    expect(calls[0]).toMatchObject({
      title: 'Cena',
      url: '/add?meal=dinner',
      tag: 'meal-dinner',
    })
  })

  it('stays quiet when the meal is already in the diary', async () => {
    await armUser()
    await addReminder({
      kind: 'meal',
      meal: 'lunch',
      label: 'Pranzo',
      skipIfLogged: true,
    })
    await db.insert(diaryEntries).values({
      userId: user.id,
      day: localNow().day,
      meal: 'lunch',
      quantityG: 120,
      nameSnapshot: 'Pasta',
      kcal: 400,
    })

    const { calls, send } = recorder()
    const result = await runDueReminders(send)
    expect(result.sent).toBe(0)
    expect(result.skipped).toBe(1)
    expect(calls).toHaveLength(0)

    // Skipping is not claiming: with the entry gone it can still go out today.
    await db.delete(diaryEntries).where(eq(diaryEntries.userId, user.id))
    expect((await runDueReminders(send)).sent).toBe(1)
  })

  it('sends the same meal reminder when skipIfLogged is off', async () => {
    await armUser()
    await addReminder({
      kind: 'meal',
      meal: 'lunch',
      label: 'Pranzo',
      skipIfLogged: false,
    })
    await db.insert(diaryEntries).values({
      userId: user.id,
      day: localNow().day,
      meal: 'lunch',
      quantityG: 120,
      nameSnapshot: 'Pasta',
      kcal: 400,
    })

    const { send } = recorder()
    expect((await runDueReminders(send)).sent).toBe(1)
  })

  it('stays quiet when today’s weight is already logged', async () => {
    await armUser()
    await addReminder({ kind: 'weight', label: 'Pesata', skipIfLogged: true })
    await db.insert(weightLogs).values({
      userId: user.id,
      day: localNow().day,
      weightKg: 74.2,
    })

    const { send } = recorder()
    expect((await runDueReminders(send)).skipped).toBe(1)
  })

  it('holds the evening review until the day is short of its calorie band', async () => {
    await armUser()
    await db
      .update(profiles)
      .set({ targetKcalMin: 1900 })
      .where(eq(profiles.userId, user.id))
    await addReminder({ kind: 'review', label: 'Controllo', skipIfLogged: true })

    const { calls, send } = recorder()

    // Well under the band: there is something left to log, so it goes out.
    await db.insert(diaryEntries).values({
      userId: user.id,
      day: localNow().day,
      meal: 'lunch',
      quantityG: 100,
      nameSnapshot: 'Insalata',
      kcal: 300,
    })
    expect((await runDueReminders(send)).sent).toBe(1)
    expect(calls[0]).toMatchObject({ url: '/' })

    // Past the band on another day's reminder — same rule, nothing to say.
    await db.update(reminders).set({ lastSentOn: null })
    await db.insert(diaryEntries).values({
      userId: user.id,
      day: localNow().day,
      meal: 'dinner',
      quantityG: 400,
      nameSnapshot: 'Cena abbondante',
      kcal: 1700,
    })
    expect((await runDueReminders(send)).skipped).toBe(1)
  })

  it('ignores reminders on a weekday they are not set for', async () => {
    await armUser()
    const now = localNow()
    await addReminder({ weekdays: [(now.weekday + 3) % 7] })

    const { send } = recorder()
    expect((await runDueReminders(send)).due).toBe(0)
  })

  it('ignores a time that is more than the grace window old', async () => {
    await armUser()
    const now = localNow()
    await addReminder({ atMinutes: (now.minutes - 45 + 1440) % 1440 })

    const { send } = recorder()
    expect((await runDueReminders(send)).due).toBe(0)
  })

  it('ignores everything for a user with the master switch off', async () => {
    await db.insert(pushSubscriptions).values({
      userId: user.id,
      endpoint: `https://push.example.test/off-${user.id}`,
      p256dh: 'client-public-key',
      auth: 'client-secret',
    })
    await addReminder({})

    const { send } = recorder()
    expect((await runDueReminders(send)).due).toBe(0)
  })

  it('ignores a disabled reminder', async () => {
    await armUser()
    await addReminder({ enabled: false })

    const { send } = recorder()
    expect((await runDueReminders(send)).due).toBe(0)
  })

  it('gives back the claim when nothing could be delivered', async () => {
    await armUser()
    await addReminder({})

    const failing = recorder('failed')
    const result = await runDueReminders(failing.send)
    expect(result.failed).toBe(1)

    const [row] = await db
      .select({ lastSentOn: reminders.lastSentOn })
      .from(reminders)
    expect(row?.lastSentOn).toBeNull()

    // Which is the point: the next pass inside the window still delivers.
    const working = recorder()
    expect((await runDueReminders(working.send)).sent).toBe(1)
  })

  it('drops a subscription the push service says is gone', async () => {
    await armUser()
    await addReminder({})

    const gone = recorder('gone')
    await runDueReminders(gone.send)

    const rows = await db
      .select({ id: pushSubscriptions.id })
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, user.id))
    expect(rows).toHaveLength(0)
  })

  it('reads the clock in the user’s own zone, not the server’s', async () => {
    // Same instant, two zones: a reminder set to the local time in Auckland is
    // due there and nowhere near due in Rome.
    await armUser('Pacific/Auckland')
    const auckland = localNow('Pacific/Auckland')
    const rome = localNow('Europe/Rome')
    // The two zones are never the same minute-of-day; if they somehow are, the
    // assertion below would be vacuous, so guard it.
    if (auckland.minutes === rome.minutes) return

    await addReminder({
      atMinutes: auckland.minutes,
      weekdays: [auckland.weekday],
    })

    const { send } = recorder()
    expect((await runDueReminders(send)).sent).toBe(1)
  })
})
