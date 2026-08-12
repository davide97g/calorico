import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { diaryEntries, foods, meals } from '../db/schema.js'
import {
  auth,
  createUser,
  hasDb,
  resetDb,
  startApp,
  stopApp,
  type TestUser,
} from '../test/harness.js'

describe.skipIf(!hasDb)('saved meals', () => {
  let app: FastifyInstance
  let user: TestUser
  let yogurt: string
  let bread: string

  beforeAll(async () => {
    app = await startApp()
  })
  afterAll(async () => {
    await stopApp(app)
  })
  beforeEach(async () => {
    await resetDb()
    user = await createUser(app)
    const created = await db
      .insert(foods)
      .values([
        {
          source: 'generic',
          name: 'Yogurt greco',
          kcal100: 97,
          protein100: 9,
          carbs100: 3.6,
          fat100: 5,
          sugars100: 3.6,
          satFat100: 3.5,
          salt100: 0.1,
          servingSizeG: 125,
        },
        {
          source: 'generic',
          name: 'Fette biscottate',
          kcal100: 410,
          protein100: 11.3,
          carbs100: 79,
          fat100: 6,
          sugars100: 6,
          satFat100: 1.2,
          salt100: 1.1,
          servingSizeG: 20,
        },
      ])
      .returning({ id: foods.id })
    yogurt = created[0]!.id
    bread = created[1]!.id
  })

  const createPlate = async (
    payload: Record<string, unknown> = {},
    who: TestUser = user,
  ) => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/meals',
      headers: auth(who),
      payload: {
        name: 'Colazione tipo',
        meal: 'breakfast',
        items: [
          { foodId: yogurt, quantityG: 125 },
          { foodId: bread, quantityG: 20 },
        ],
        ...payload,
      },
    })
    return res
  }

  it('creates a plate and lists it with its ingredients', async () => {
    const created = await createPlate()
    expect(created.statusCode).toBe(201)
    const body = created.json() as {
      id: string
      name: string
      kcal: number
      items: Array<{ name: string; quantityG: number }>
    }
    expect(body.name).toBe('Colazione tipo')
    expect(body.items).toHaveLength(2)
    expect(body.items.map((i) => i.name)).toEqual([
      'Yogurt greco',
      'Fette biscottate',
    ])
    expect(body.kcal).toBe(Math.round((97 * 125) / 100) + Math.round((410 * 20) / 100))

    const list = await app.inject({
      method: 'GET',
      url: '/api/meals',
      headers: auth(user),
    })
    expect(list.statusCode).toBe(200)
    expect((list.json() as { items: unknown[] }).items).toHaveLength(1)
  })

  it('refuses a missing food rather than saving a half plate', async () => {
    const res = await createPlate({
      items: [{ foodId: '00000000-0000-4000-8000-000000000000', quantityG: 100 }],
    })
    expect(res.statusCode).toBe(404)
    expect(res.json()).toEqual({ error: 'food_not_found' })
  })

  it('logs a plate as individual diary rows with nutrient snapshots', async () => {
    const created = await createPlate()
    const id = (created.json() as { id: string }).id

    const logged = await app.inject({
      method: 'POST',
      url: `/api/meals/${id}/log`,
      headers: auth(user),
      payload: { day: '2026-08-12', meal: 'breakfast' },
    })
    expect(logged.statusCode).toBe(201)
    const entries = (logged.json() as { entries: Array<{ sugarsG: number | null; saltG: number | null; nameSnapshot: string }> }).entries
    expect(entries).toHaveLength(2)
    expect(entries.map((e) => e.nameSnapshot)).toEqual([
      'Yogurt greco',
      'Fette biscottate',
    ])
    expect(entries[0]!.sugarsG).toBe(4.5)
    expect(entries[1]!.saltG).toBe(0.2)

    const rows = await db
      .select()
      .from(diaryEntries)
      .where(eq(diaryEntries.userId, user.id))
    expect(rows).toHaveLength(2)

    const copied = await app.inject({
      method: 'POST',
      url: '/api/diary/copy',
      headers: auth(user),
      payload: { from: '2026-08-12', to: '2026-08-13', meal: 'breakfast' },
    })
    expect(copied.statusCode).toBe(200)
    expect(copied.json()).toEqual({ copied: 2 })
    const clone = await db
      .select()
      .from(diaryEntries)
      .where(eq(diaryEntries.day, '2026-08-13'))
    const yogurtRow = clone.find((e) => e.nameSnapshot === 'Yogurt greco')
    const breadRow = clone.find((e) => e.nameSnapshot === 'Fette biscottate')
    expect(yogurtRow?.sugarsG).toBe(4.5)
    expect(breadRow?.saltG).toBe(0.2)
  })

  it('answers 404 when logging a plate that is not yours', async () => {
    const created = await createPlate()
    const id = (created.json() as { id: string }).id
    const other = await createUser(app)

    const logged = await app.inject({
      method: 'POST',
      url: `/api/meals/${id}/log`,
      headers: auth(other),
      payload: { day: '2026-08-12', meal: 'lunch' },
    })
    expect(logged.statusCode).toBe(404)
  })

  it('deletes a plate', async () => {
    const created = await createPlate()
    const id = (created.json() as { id: string }).id
    const deleted = await app.inject({
      method: 'DELETE',
      url: `/api/meals/${id}`,
      headers: auth(user),
    })
    expect(deleted.statusCode).toBe(204)
    const left = await db.select().from(meals).where(eq(meals.userId, user.id))
    expect(left).toHaveLength(0)
  })

  it('caps how many plates one account may keep', async () => {
    await db.insert(meals).values(
      Array.from({ length: 40 }, (_, i) => ({
        userId: user.id,
        name: `Piatto ${i}`,
        meal: 'snack' as const,
      })),
    )
    const res = await createPlate()
    expect(res.statusCode).toBe(409)
    expect(res.json()).toEqual({ error: 'too_many_meals' })
  })
})
