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
})
