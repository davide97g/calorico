import type { FastifyInstance } from 'fastify'
import { beforeAll, beforeEach, afterAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { pushSubscriptions } from '../db/schema.js'
import {
  auth,
  createUser,
  hasDb,
  resetDb,
  startApp,
  stopApp,
  type TestUser,
} from '../test/harness.js'
import { REMINDER_PRESETS } from '../lib/reminders/presets.js'

/**
 * The reminder API. What is worth testing here is not that a row can be created
 * but the rules around it: the per-account cap, the fields the server overrides
 * whatever the client sent, one account never reaching another's reminders, and
 * a push endpoint moving to whichever account subscribed it last.
 */
describe.skipIf(!hasDb)('notifications', () => {
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
  })

  const get = async (as: TestUser = user) => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/notifications',
      headers: auth(as),
    })
    expect(res.statusCode).toBe(200)
    return res.json() as {
      push: { supported: boolean; publicKey: string | null }
      enabled: boolean
      timezone: string
      devices: number
      maxReminders: number
      presets: { key: string }[]
      reminders: {
        id: string
        kind: string
        meal: string | null
        label: string
        atMinutes: number
        weekdays: number[]
        skipIfLogged: boolean
        enabled: boolean
      }[]
    }
  }

  const create = (payload: object, as: TestUser = user) =>
    app.inject({
      method: 'POST',
      url: '/api/notifications/reminders',
      headers: auth(as),
      payload,
    })

  const subscribe = (endpoint: string, as: TestUser = user) =>
    app.inject({
      method: 'POST',
      url: '/api/notifications/subscribe',
      headers: auth(as),
      payload: {
        endpoint,
        keys: { p256dh: 'a-client-public-key', auth: 'a-client-secret' },
      },
    })

  it('reports the server push config and the suggested set', async () => {
    const state = await get()
    expect(state.push.supported).toBe(true)
    expect(state.push.publicKey).toBeTruthy()
    expect(state.enabled).toBe(false)
    expect(state.devices).toBe(0)
    expect(state.reminders).toEqual([])
    expect(state.presets.map((p) => p.key)).toEqual(
      REMINDER_PRESETS.map((p) => p.key),
    )
  })

  it('creates the suggested set once, and tops it up rather than duplicating', async () => {
    const first = await app.inject({
      method: 'POST',
      url: '/api/notifications/reminders/defaults',
      headers: auth(user),
    })
    expect(first.statusCode).toBe(200)
    expect((first.json() as { created: number }).created).toBe(
      REMINDER_PRESETS.length,
    )

    const again = await app.inject({
      method: 'POST',
      url: '/api/notifications/reminders/defaults',
      headers: auth(user),
    })
    expect((again.json() as { created: number }).created).toBe(0)
    expect((await get()).reminders).toHaveLength(REMINDER_PRESETS.length)

    // A deleted one comes back; the others are left alone.
    const [victim] = (await get()).reminders
    await app.inject({
      method: 'DELETE',
      url: `/api/notifications/reminders/${victim!.id}`,
      headers: auth(user),
    })
    const third = await app.inject({
      method: 'POST',
      url: '/api/notifications/reminders/defaults',
      headers: auth(user),
    })
    expect((third.json() as { created: number }).created).toBe(1)
  })

  it('refuses to go past the per-account cap', async () => {
    const { maxReminders } = await get()
    for (let i = 0; i < maxReminders; i += 1) {
      const res = await create({ label: `Promemoria ${i}`, atMinutes: 600 + i })
      expect(res.statusCode).toBe(201)
    }
    const overflow = await create({ label: 'Uno di troppo', atMinutes: 700 })
    expect(overflow.statusCode).toBe(409)
    expect(overflow.json()).toMatchObject({ error: 'too_many_reminders' })
  })

  it('normalises what only makes sense for some kinds', async () => {
    // A custom reminder has nothing to compare against, so it never skips …
    const custom = await create({
      kind: 'custom',
      label: 'Bevi acqua',
      atMinutes: 660,
      skipIfLogged: true,
      meal: 'lunch',
    })
    expect(custom.json()).toMatchObject({
      kind: 'custom',
      skipIfLogged: false,
      meal: null,
    })

    // … while a meal reminder keeps its meal and its skip rule.
    const meal = await create({
      kind: 'meal',
      meal: 'lunch',
      label: 'Pranzo',
      atMinutes: 780,
    })
    expect(meal.json()).toMatchObject({
      kind: 'meal',
      meal: 'lunch',
      skipIfLogged: true,
    })
  })

  it('sorts and dedupes weekdays, and rejects none at all', async () => {
    const res = await create({
      label: 'Allenamento',
      atMinutes: 1080,
      weekdays: [5, 1, 1, 3],
    })
    expect((res.json() as { weekdays: number[] }).weekdays).toEqual([1, 3, 5])

    const empty = await create({
      label: 'Mai',
      atMinutes: 1080,
      weekdays: [],
    })
    expect(empty.statusCode).toBe(400)
  })

  it('keeps one account out of another’s reminders', async () => {
    const stranger = await createUser(app)
    const mine = (await create({ label: 'Mio', atMinutes: 600 })).json() as {
      id: string
    }

    const read = await get(stranger)
    expect(read.reminders).toEqual([])

    const patch = await app.inject({
      method: 'PATCH',
      url: `/api/notifications/reminders/${mine.id}`,
      headers: auth(stranger),
      payload: { label: 'Tuo' },
    })
    expect(patch.statusCode).toBe(404)

    const remove = await app.inject({
      method: 'DELETE',
      url: `/api/notifications/reminders/${mine.id}`,
      headers: auth(stranger),
    })
    expect(remove.statusCode).toBe(404)

    // And it is still mine, unchanged.
    expect((await get()).reminders[0]).toMatchObject({ label: 'Mio' })
  })

  it('stores the timezone the browser reports, and refuses one it made up', async () => {
    const ok = await app.inject({
      method: 'PATCH',
      url: '/api/notifications',
      headers: auth(user),
      payload: { enabled: true, timezone: 'America/New_York' },
    })
    expect(ok.statusCode).toBe(200)
    expect(ok.json()).toMatchObject({
      enabled: true,
      timezone: 'America/New_York',
    })

    const bad = await app.inject({
      method: 'PATCH',
      url: '/api/notifications',
      headers: auth(user),
      payload: { timezone: 'Mars/Olympus_Mons' },
    })
    expect(bad.statusCode).toBe(400)
    expect((await get()).timezone).toBe('America/New_York')
  })

  it('moves a push endpoint to whichever account subscribed it last', async () => {
    const endpoint = 'https://push.example.test/subscription-1'

    expect((await subscribe(endpoint)).statusCode).toBe(201)
    // The same browser re-subscribing must update the row, not add one.
    expect((await subscribe(endpoint)).statusCode).toBe(201)
    expect((await get()).devices).toBe(1)

    const other = await createUser(app)
    expect((await subscribe(endpoint, other)).statusCode).toBe(201)
    expect((await get()).devices).toBe(0)
    expect((await get(other)).devices).toBe(1)
  })

  it('only lets you unsubscribe your own endpoint', async () => {
    const endpoint = 'https://push.example.test/subscription-2'
    await subscribe(endpoint)

    const stranger = await createUser(app)
    const theirs = await app.inject({
      method: 'DELETE',
      url: '/api/notifications/subscribe',
      headers: auth(stranger),
      payload: { endpoint },
    })
    expect(theirs.statusCode).toBe(204)
    expect((await get()).devices).toBe(1)

    const mine = await app.inject({
      method: 'DELETE',
      url: '/api/notifications/subscribe',
      headers: auth(user),
      payload: { endpoint },
    })
    expect(mine.statusCode).toBe(204)
    expect((await get()).devices).toBe(0)
  })

  it('records the build a device reports, and only for its own endpoint', async () => {
    const endpoint = 'https://push.example.test/subscription-3'
    await subscribe(endpoint)

    const report = (buildId: string, as: TestUser = user) =>
      app.inject({
        method: 'POST',
        url: '/api/notifications/version',
        headers: auth(as),
        payload: { endpoint, buildId },
      })

    expect((await report('build-42')).statusCode).toBe(204)
    const buildOf = async () => {
      const [row] = await db
        .select({ buildId: pushSubscriptions.buildId })
        .from(pushSubscriptions)
        .where(eq(pushSubscriptions.endpoint, endpoint))
      return row?.buildId
    }
    expect(await buildOf()).toBe('build-42')

    // A stranger reporting someone else's endpoint changes nothing, and is not
    // told whether the endpoint exists.
    const stranger = await createUser(app)
    expect((await report('build-99', stranger)).statusCode).toBe(204)
    expect(await buildOf()).toBe('build-42')
  })

  it('says so instead of pretending when there is no device to test with', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/notifications/test',
      headers: auth(user),
    })
    expect(res.statusCode).toBe(409)
    expect(res.json()).toMatchObject({ error: 'no_devices' })
  })
})
