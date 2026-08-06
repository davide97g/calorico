import type { FastifyInstance } from 'fastify'
import { beforeAll, beforeEach, afterAll, describe, expect, it } from 'vitest'
import {
  ageFromBirthDate,
  proteinRecommendation,
  type ActivityLevel,
  type Goal,
  type Sex,
} from '../lib/nutrition.js'
import {
  auth,
  createUser,
  hasDb,
  resetDb,
  startApp,
  stopApp,
  type TestUser,
} from '../test/harness.js'

describe.skipIf(!hasDb)('profile targets', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await startApp()
  })
  afterAll(async () => {
    await stopApp(app)
  })
  beforeEach(async () => {
    await resetDb()
  })

  const metrics: {
    sex: Sex
    birthDate: string
    heightCm: number
    weightKg: number
    activityLevel: ActivityLevel
    goal: Goal
  } = {
    sex: 'male',
    birthDate: '1990-05-20',
    heightCm: 180,
    weightKg: 80,
    activityLevel: 'moderate',
    goal: 'maintain',
  }

  const onboard = async (
    user: TestUser,
    overrides: Partial<typeof metrics> = {},
  ) => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/profile/onboarding',
      headers: auth(user),
      payload: { ...metrics, ...overrides },
    })
    expect(res.statusCode).toBe(200)
    return res.json() as { profile: { targetProteinG: number } }
  }

  const suggested = async (user: TestUser) => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/profile/suggested',
      headers: auth(user),
    })
    return res
  }

  it('refuses to suggest anything before onboarding', async () => {
    const user = await createUser(app)
    const res = await suggested(user)
    expect(res.statusCode).toBe(400)
    expect(res.json()).toEqual({ error: 'incomplete_profile' })
  })

  it('suggests the standard protein amount for the stored metrics', async () => {
    const user = await createUser(app)
    await onboard(user)

    const res = await suggested(user)
    expect(res.statusCode).toBe(200)
    const body = res.json() as {
      weightKg: number
      proteinPerKg: number
      targets: { targetProteinG: number }
    }

    const expected = proteinRecommendation({
      ...metrics,
      age: ageFromBirthDate(metrics.birthDate),
    })
    expect(body.weightKg).toBe(metrics.weightKg)
    expect(body.targets.targetProteinG).toBe(expected.proteinG)
    expect(body.proteinPerKg).toBe(expected.perKg)
  })

  /** The point of putting sex in the settings: it moves the recommendation. */
  it('follows a change of sex', async () => {
    const user = await createUser(app)
    await onboard(user)
    const before = (await suggested(user)).json() as {
      targets: { targetProteinG: number }
    }

    const patched = await app.inject({
      method: 'PATCH',
      url: '/api/profile',
      headers: auth(user),
      payload: { sex: 'female' },
    })
    expect(patched.statusCode).toBe(200)

    const after = (await suggested(user)).json() as {
      targets: { targetProteinG: number }
    }
    expect(after.targets.targetProteinG).toBeLessThan(
      before.targets.targetProteinG,
    )
  })

  it('leaves the stored targets alone', async () => {
    const user = await createUser(app)
    await onboard(user)

    await app.inject({
      method: 'PATCH',
      url: '/api/profile',
      headers: auth(user),
      payload: { targetProteinG: 111 },
    })
    await suggested(user)

    const profile = (
      await app.inject({
        method: 'GET',
        url: '/api/profile',
        headers: auth(user),
      })
    ).json() as { targetProteinG: number }
    expect(profile.targetProteinG).toBe(111)
  })

  it('recalculate writes the suggestion back onto the profile', async () => {
    const user = await createUser(app)
    await onboard(user, { goal: 'lose' })

    await app.inject({
      method: 'PATCH',
      url: '/api/profile',
      headers: auth(user),
      payload: { targetProteinG: 50 },
    })

    const recalculated = await app.inject({
      method: 'POST',
      url: '/api/profile/recalculate',
      headers: auth(user),
    })
    expect(recalculated.statusCode).toBe(200)

    const body = (await suggested(user)).json() as {
      targets: { targetProteinG: number }
    }
    const profile = (
      await app.inject({
        method: 'GET',
        url: '/api/profile',
        headers: auth(user),
      })
    ).json() as { targetProteinG: number }
    expect(profile.targetProteinG).toBe(body.targets.targetProteinG)
  })

  /** The latest weigh-in drives the numbers, not the weight given at signup. */
  it('recomputes from the most recent weight', async () => {
    const user = await createUser(app)
    await onboard(user)

    const logged = await app.inject({
      method: 'PUT',
      url: '/api/weight',
      headers: auth(user),
      payload: { day: new Date().toISOString().slice(0, 10), weightKg: 95 },
    })
    expect(logged.statusCode).toBe(200)

    const body = (await suggested(user)).json() as { weightKg: number }
    expect(body.weightKg).toBe(95)
  })
})
