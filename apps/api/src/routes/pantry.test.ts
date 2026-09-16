import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/index.js'
import { foods } from '../db/schema.js'
import {
  auth,
  createUser,
  hasDb,
  resetDb,
  startApp,
  stopApp,
  type TestUser,
} from '../test/harness.js'

/**
 * The loop this feature exists for: eating a tracked product runs the cupboard
 * down and the product puts itself on the shopping list. What is worth testing
 * is not that the arithmetic works — pantry.test.ts covers that without a
 * database — but that it fires once, that it can be refused, and that it never
 * fires for a product nobody asked to track.
 */
describe.skipIf(!hasDb)('pantry', () => {
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

  /** A packaged food with a size on it, the way Open Food Facts hands one over. */
  const createFood = async (packageSizeG: number | null = 400) => {
    const [food] = await db
      .insert(foods)
      .values({
        source: 'off',
        name: 'Crema alla nocciola',
        brand: 'Marca',
        kcal100: 539,
        protein100: 6,
        carbs100: 57,
        fat100: 31,
        packageSizeG,
      })
      .returning({ id: foods.id })
    return food!.id
  }

  const stock = (foodId: string, payload: Record<string, unknown> = {}) =>
    app.inject({
      method: 'POST',
      url: '/api/pantry',
      headers: auth(user),
      payload: { foodId, ...payload },
    })

  const eat = (foodId: string, quantityG: number, day = '2026-09-16') =>
    app.inject({
      method: 'POST',
      url: '/api/diary',
      headers: auth(user),
      payload: { foodId, day, meal: 'breakfast', quantityG },
    })

  const pantry = async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/pantry',
      headers: auth(user),
    })
    expect(res.statusCode).toBe(200)
    return res.json() as {
      items: { id: string; totalG: number; low: boolean }[]
      lowFraction: number
    }
  }

  /** Only what is still to be bought: a ticked-off row stays in the payload. */
  const grocery = async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/grocery',
      headers: auth(user),
    })
    expect(res.statusCode).toBe(200)
    const { items } = res.json() as {
      items: { id: string; source: string; completed: boolean }[]
    }
    return items.filter((item) => !item.completed)
  }

  it('refuses to stock a product with no package size until one is given', async () => {
    const foodId = await createFood(null)

    const without = await stock(foodId)
    expect(without.statusCode).toBe(422)
    expect(without.json()).toMatchObject({ error: 'package_size_required' })

    expect((await stock(foodId, { packageSizeG: 250 })).statusCode).toBe(201)
    expect((await pantry()).items[0]?.totalG).toBe(250)
  })

  it('runs the stock down and puts the product on the list once', async () => {
    const foodId = await createFood(400)
    await stock(foodId)

    await eat(foodId, 300)
    expect((await pantry()).items[0]).toMatchObject({ totalG: 100, low: false })
    expect(await grocery()).toHaveLength(0)

    await eat(foodId, 45)
    const low = (await pantry()).items[0]!
    expect(low.totalG).toBe(55)
    expect(low.low).toBe(true)

    const list = await grocery()
    expect(list).toHaveLength(1)
    expect(list[0]?.source).toBe('auto')

    // The second mouthful past the line must not write a second row.
    await eat(foodId, 10)
    expect(await grocery()).toHaveLength(1)
  })

  it('does not put the row back after it has been deleted', async () => {
    const foodId = await createFood(400)
    await stock(foodId)
    await eat(foodId, 350)

    const [row] = await grocery()
    const deleted = await app.inject({
      method: 'DELETE',
      url: `/api/grocery/${row!.id}`,
      headers: auth(user),
    })
    expect(deleted.statusCode).toBe(204)

    // Deleting an automatic row is a user saying no. Only a restock re-arms it.
    await eat(foodId, 10)
    expect(await grocery()).toHaveLength(0)
  })

  it('hands the grams back when the entry that spent them is deleted', async () => {
    const foodId = await createFood(400)
    await stock(foodId)

    const eaten = await eat(foodId, 300)
    const entryId = (eaten.json() as { id: string }).id
    const removed = await app.inject({
      method: 'DELETE',
      url: `/api/diary/${entryId}`,
      headers: auth(user),
    })
    expect(removed.statusCode).toBe(204)

    expect((await pantry()).items[0]?.totalG).toBe(400)
  })

  it('refills the cupboard when the row is ticked off the list', async () => {
    const foodId = await createFood(400)
    await stock(foodId)
    await eat(foodId, 350)

    const [row] = await grocery()
    const ticked = await app.inject({
      method: 'PATCH',
      url: `/api/grocery/${row!.id}`,
      headers: auth(user),
      payload: { completed: true },
    })
    expect(ticked.statusCode).toBe(200)

    const after = (await pantry()).items[0]!
    expect(after.totalG).toBe(450)
    expect(after.low).toBe(false)

    // Re-armed: the next run-down writes a fresh row.
    await eat(foodId, 400)
    expect(await grocery()).toHaveLength(1)
  })

  it('leaves a food nobody stocked alone', async () => {
    const foodId = await createFood(400)
    await eat(foodId, 4000)
    expect(await pantry()).toMatchObject({ items: [] })
    expect(await grocery()).toHaveLength(0)
  })

  it('treats zero on both counts as "finished"', async () => {
    const foodId = await createFood(400)
    await stock(foodId, { packages: 2 })

    const item = (await pantry()).items[0]!
    const patched = await app.inject({
      method: 'PATCH',
      url: `/api/pantry/${item.id}`,
      headers: auth(user),
      payload: { sealedPackages: 0, remainingG: 0 },
    })
    expect(patched.statusCode).toBe(200)
    expect(patched.json()).toMatchObject({ totalG: 0, low: true })
    expect(await grocery()).toHaveLength(1)
  })
})
