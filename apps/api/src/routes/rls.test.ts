import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { adminSql } from '../db/index.js'
import { diaryEntries } from '../db/schema.js'
import { db } from '../db/index.js'
import {
  auth,
  createUser,
  hasDb,
  resetDb,
  startApp,
  stopApp,
} from '../test/harness.js'

/**
 * FORCE RLS on calorico_app: a missed WHERE in application code must not leak
 * another person's diary. The request path SET LOCAL ROLEs to that user;
 * this talks to Postgres the same way, without going through the API.
 */
describe.skipIf(!hasDb)('row level security', () => {
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

  it('hides another account diary from calorico_app even without a WHERE', async () => {
    const alice = await createUser(app)
    const bob = await createUser(app)

    const food = await app.inject({
      method: 'POST',
      url: '/api/foods',
      headers: auth(alice),
      payload: {
        name: 'Diario segreto',
        kcal100: 100,
        protein100: 1,
        carbs100: 10,
        fat100: 1,
      },
    })
    const foodId = (food.json() as { id: string }).id
    const logged = await app.inject({
      method: 'POST',
      url: '/api/diary',
      headers: auth(alice),
      payload: {
        foodId,
        day: '2026-08-12',
        meal: 'lunch',
        quantityG: 100,
      },
    })
    expect(logged.statusCode).toBe(201)

    const asOwner = await db.select().from(diaryEntries)
    expect(asOwner).toHaveLength(1)

    const bobView = await adminSql.begin(async (tx) => {
      await tx.unsafe('SET LOCAL ROLE calorico_app')
      await tx`select set_config('app.user_id', ${bob.id}, true)`
      return tx`select id from diary_entries`
    })
    expect(bobView).toHaveLength(0)

    const aliceView = await adminSql.begin(async (tx) => {
      await tx.unsafe('SET LOCAL ROLE calorico_app')
      await tx`select set_config('app.user_id', ${alice.id}, true)`
      return tx`select id from diary_entries`
    })
    expect(aliceView).toHaveLength(1)
  })

  it('keeps a private pantry out of another account reach', async () => {
    const alice = await createUser(app)
    const bob = await createUser(app)

    const food = await app.inject({
      method: 'POST',
      url: '/api/foods',
      headers: auth(alice),
      payload: {
        name: 'Crema alla nocciola',
        kcal100: 539,
        protein100: 6,
        carbs100: 57,
        fat100: 31,
      },
    })
    const foodId = (food.json() as { id: string }).id
    const stocked = await app.inject({
      method: 'POST',
      url: '/api/pantry',
      headers: auth(alice),
      payload: { foodId, packages: 1, packageSizeG: 400 },
    })
    expect(stocked.statusCode).toBe(201)

    const asRole = (userId: string) =>
      adminSql.begin(async (tx) => {
        await tx.unsafe('SET LOCAL ROLE calorico_app')
        await tx`select set_config('app.user_id', ${userId}, true)`
        return tx`select id from pantry_items`
      })

    expect(await asRole(bob.id)).toHaveLength(0)
    expect(await asRole(alice.id)).toHaveLength(1)
  })

  it('keeps a recipe and its lines to the account that wrote them', async () => {
    const alice = await createUser(app)
    const bob = await createUser(app)

    const food = await app.inject({
      method: 'POST',
      url: '/api/foods',
      headers: auth(alice),
      payload: { name: 'Farina di avena', kcal100: 370 },
    })
    const created = await app.inject({
      method: 'POST',
      url: '/api/recipes',
      headers: auth(alice),
      payload: {
        name: 'Pancake proteici',
        servings: 2,
        items: [
          { foodId: (food.json() as { id: string }).id, quantityG: 60 },
        ],
      },
    })
    expect(created.statusCode).toBe(201)

    const asRole = (userId: string, table: string) =>
      adminSql.begin(async (tx) => {
        await tx.unsafe('SET LOCAL ROLE calorico_app')
        await tx`select set_config('app.user_id', ${userId}, true)`
        return tx.unsafe(`select id from ${table}`)
      })

    expect(await asRole(bob.id, 'recipes')).toHaveLength(0)
    expect(await asRole(alice.id, 'recipes')).toHaveLength(1)
    // The lines follow the recipe: their policy is written through it.
    expect(await asRole(bob.id, 'recipe_ingredients')).toHaveLength(0)
    expect(await asRole(alice.id, 'recipe_ingredients')).toHaveLength(1)
  })
})
