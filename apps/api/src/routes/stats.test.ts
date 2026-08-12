import type { FastifyInstance } from 'fastify'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/index.js'
import { diaryEntries, profiles, weightLogs } from '../db/schema.js'
import {
  auth,
  createUser,
  hasDb,
  resetDb,
  startApp,
  stopApp,
  type TestUser,
} from '../test/harness.js'
import { shiftDay } from '../lib/stats.js'

/**
 * The stats endpoints, checked on the properties the screens rely on: what an
 * average divides by, where a bucket starts and stops, and which comparisons are
 * absent rather than zero.
 *
 * Fixed calendar dates rather than "n days ago": every assertion here is about
 * week boundaries and weekdays, and a relative date would move the expected
 * bucket depending on the day the suite runs.
 */

/** Monday 3 August 2026 — `date_trunc('week')` starts weeks on a Monday. */
const MONDAY = '2026-08-03'
const SUNDAY = '2026-08-09'

interface Entry {
  day: string
  kcal: number
  meal?: 'breakfast' | 'lunch' | 'dinner' | 'snack'
  name?: string
  brand?: string | null
  quantityG?: number
}

async function seedDays(userId: string, entries: Entry[]) {
  await db.insert(diaryEntries).values(
    entries.map((entry) => ({
      userId,
      day: entry.day,
      meal: entry.meal ?? ('lunch' as const),
      quantityG: entry.quantityG ?? 100,
      nameSnapshot: entry.name ?? 'Pasta',
      brandSnapshot: entry.brand ?? null,
      kcal: entry.kcal,
      proteinG: entry.kcal / 20,
      carbsG: entry.kcal / 5,
      fatG: entry.kcal / 40,
      fiberG: 3,
    })),
  )
}

/** The band the fixtures are written against: 2050–2350, target 2200. */
async function setTargets(userId: string) {
  await db
    .update(profiles)
    .set({ targetKcal: 2200, targetKcalMin: 2050, targetKcalMax: 2350 })
    .where(eq(profiles.userId, userId))
}

describe.skipIf(!hasDb)('stats', () => {
  let app: FastifyInstance
  let user: TestUser

  beforeAll(async () => {
    app = await startApp()
  })
  afterAll(async () => {
    await stopApp(app)
  })
  beforeEach(async () => {
    await resetDb()
    user = await createUser(app)
    await setTargets(user.id)
  })

  const get = async (url: string, expected = 200) => {
    const res = await app.inject({ method: 'GET', url, headers: auth(user) })
    expect(res.statusCode).toBe(expected)
    return res.json()
  }

  describe('GET /daily', () => {
    it('returns a row per calendar day, empty days included', async () => {
      await seedDays(user.id, [
        { day: MONDAY, kcal: 2100 },
        { day: '2026-08-05', kcal: 1700 },
      ])

      const body = await get(`/api/stats/daily?from=${MONDAY}&to=2026-08-05`)
      expect(body.days).toHaveLength(3)
      expect(body.days[1]).toMatchObject({ day: '2026-08-04', kcal: 0, entries: 0 })
      // Averaged over the two logged days, not the three calendar ones.
      expect(body.summary).toMatchObject({ loggedDays: 2, avgKcal: 1900 })
      expect(body.summary.daysInRange).toBe(1)
    })

    it('rejects a reversed or oversized range', async () => {
      await get(`/api/stats/daily?from=2026-08-05&to=${MONDAY}`, 400)
      await get('/api/stats/daily?from=2020-01-01&to=2026-08-05', 400)
    })
  })

  describe('GET /day', () => {
    it('splits the day by meal and names its biggest contributors', async () => {
      await seedDays(user.id, [
        { day: MONDAY, kcal: 400, meal: 'breakfast', name: 'Yogurt' },
        { day: MONDAY, kcal: 900, meal: 'lunch', name: 'Pasta', brand: 'Barilla' },
        { day: MONDAY, kcal: 700, meal: 'dinner', name: 'Salmone' },
      ])

      const body = await get(`/api/stats/day?day=${MONDAY}`)
      expect(body.totals).toMatchObject({ kcal: 2000, entries: 3 })

      const lunch = body.byMeal.find((m: { meal: string }) => m.meal === 'lunch')
      expect(lunch).toMatchObject({ kcal: 900, share: 45 })
      // Every meal is listed, so a skipped one is visible as a zero.
      expect(body.byMeal.map((m: { meal: string }) => m.meal)).toEqual([
        'breakfast',
        'lunch',
        'dinner',
        'snack',
      ])
      expect(body.topFoods[0]).toMatchObject({
        name: 'Pasta',
        brand: 'Barilla',
        kcal: 900,
      })
    })

    it('compares against yesterday, the week, and the same weekday', async () => {
      await seedDays(user.id, [
        { day: MONDAY, kcal: 2000 },
        // Yesterday, and a same-weekday sample a week before that.
        { day: shiftDay(MONDAY, -1), kcal: 1600 },
        { day: shiftDay(MONDAY, -7), kcal: 2400 },
      ])

      const { context } = await get(`/api/stats/day?day=${MONDAY}`)
      expect(context.prevDayKcal).toBe(1600)
      expect(context.recentAvgKcal).toBe(2000)
      expect(context.weekdayAvgKcal).toBe(2400)
      expect(context.weekdayDays).toBe(1)
    })

    it('leaves a missing comparison null rather than zero', async () => {
      await seedDays(user.id, [{ day: MONDAY, kcal: 2000 }])

      const { context } = await get(`/api/stats/day?day=${MONDAY}`)
      expect(context.prevDayKcal).toBeNull()
      expect(context.recentAvgKcal).toBeNull()
      expect(context.weekdayAvgKcal).toBeNull()
    })
  })

  describe('GET /periods', () => {
    it('buckets by Monday-started weeks and averages over logged days', async () => {
      await seedDays(user.id, [
        { day: shiftDay(MONDAY, -1), kcal: 1000 }, // the Sunday before: own week
        { day: MONDAY, kcal: 2100 },
        { day: '2026-08-05', kcal: 1700 },
      ])

      const body = await get(
        `/api/stats/periods?unit=week&from=${shiftDay(MONDAY, -7)}&to=${SUNDAY}`,
      )
      expect(body.buckets.map((b: { key: string }) => b.key)).toEqual([
        shiftDay(MONDAY, -7),
        MONDAY,
      ])

      const week = body.buckets[1]
      expect(week).toMatchObject({
        from: MONDAY,
        to: SUNDAY,
        days: 7,
        loggedDays: 2,
        avgKcal: 1900,
        totalKcal: 3800,
        daysInRange: 1,
        daysUnder: 1,
        daysOver: 0,
      })
      expect(week.lightestDay).toEqual({ day: '2026-08-05', kcal: 1700 })
      expect(week.dailyStats).toHaveLength(7)
    })

    it('keeps a bucket that the range cuts short, and its own key', async () => {
      await seedDays(user.id, [{ day: '2026-08-05', kcal: 2200 }])

      const body = await get(
        '/api/stats/periods?unit=week&from=2026-08-05&to=2026-08-06',
      )
      const [week] = body.buckets
      expect(week.key).toBe(MONDAY)
      expect(week).toMatchObject({ from: '2026-08-05', to: '2026-08-06', days: 2 })
    })

    it('spans the weigh-ins inside each month', async () => {
      await seedDays(user.id, [{ day: MONDAY, kcal: 2200 }])
      await db.insert(weightLogs).values([
        { userId: user.id, day: '2026-07-31', weightKg: 80 },
        { userId: user.id, day: MONDAY, weightKg: 79.5 },
        { userId: user.id, day: '2026-08-20', weightKg: 78.5 },
      ])

      const body = await get(
        '/api/stats/periods?unit=month&from=2026-07-01&to=2026-08-31',
      )
      expect(body.buckets[0].weight).toMatchObject({ count: 1, changeKg: 0 })
      expect(body.buckets[1].weight).toMatchObject({
        startKg: 79.5,
        endKg: 78.5,
        changeKg: -1,
        count: 2,
      })
    })

    it('rejects a unit it cannot bucket by', async () => {
      await get(
        `/api/stats/periods?unit=fortnight&from=${MONDAY}&to=${SUNDAY}`,
        400,
      )
    })
  })

  describe('GET /breakdown', () => {
    it('shares out meals, weekdays and the foods that carried the range', async () => {
      await seedDays(user.id, [
        { day: MONDAY, kcal: 600, meal: 'breakfast', name: 'Yogurt' },
        { day: MONDAY, kcal: 1400, meal: 'dinner', name: 'Pasta' },
        { day: '2026-08-04', kcal: 1000, meal: 'dinner', name: 'Pasta' },
      ])

      const body = await get(`/api/stats/breakdown?from=${MONDAY}&to=${SUNDAY}`)
      expect(body).toMatchObject({ days: 7, loggedDays: 2, totalKcal: 3000 })
      expect(body.coverage).toBeCloseTo(28.6, 1)

      const dinner = body.mealSplit.find(
        (m: { meal: string }) => m.meal === 'dinner',
      )
      // 2400 kcal over the two evenings it was eaten, not over seven days.
      expect(dinner).toMatchObject({ kcal: 2400, share: 80, avgKcal: 1200, days: 2 })

      expect(body.topFoods[0]).toMatchObject({ name: 'Pasta', kcal: 2400, times: 2 })
      // Monday is dow 1; the two logged days average 2000 and 1000.
      expect(body.weekdayPattern[1]).toMatchObject({ avgKcal: 2000, loggedDays: 1 })
      expect(body.weekdayPattern[3]).toMatchObject({ avgKcal: 0, loggedDays: 0 })
    })

    it('counts the streak up to the range end, unbroken by the day in progress', async () => {
      await seedDays(user.id, [
        { day: '2026-08-01', kcal: 1800 },
        { day: '2026-08-02', kcal: 1900 },
        { day: MONDAY, kcal: 2000 },
      ])

      // Asked as of the 4th, on which nothing is logged yet.
      const body = await get('/api/stats/breakdown?from=2026-08-01&to=2026-08-04')
      expect(body.streak).toMatchObject({
        current: 3,
        longest: 3,
        lastLoggedDay: MONDAY,
      })
    })
  })

  it('answers 401 without a token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/stats/day?day=${MONDAY}`,
    })
    expect(res.statusCode).toBe(401)
  })
})
