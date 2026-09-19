import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
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

describe.skipIf(!hasDb)('recipes', () => {
  let app: FastifyInstance
  let user: TestUser
  let albume: string
  let yogurt: string
  let avena: string

  const create = (payload: Record<string, unknown>) =>
    app.inject({
      method: 'POST',
      url: '/api/recipes',
      headers: auth(user),
      payload,
    })

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
          name: 'Albume',
          kcal100: 52,
          protein100: 11,
          carbs100: 0.7,
          fat100: 0.2,
          salt100: 0.5,
        },
        {
          source: 'generic',
          name: 'Yogurt greco',
          kcal100: 97,
          protein100: 9,
          carbs100: 3.6,
          fat100: 5,
          sugars100: 3.6,
          satFat100: 3.5,
        },
        {
          source: 'generic',
          name: 'Farina di avena',
          kcal100: 370,
          protein100: 13,
          carbs100: 60,
          fat100: 7,
          fiber100: 10,
        },
      ])
      .returning({ id: foods.id })
    albume = created[0]!.id
    yogurt = created[1]!.id
    avena = created[2]!.id
  })

  /** The dish from the brief: egg white, yogurt and oats, cut into two. */
  const brief = () => ({
    name: 'Pancake proteici',
    servings: 2,
    items: [
      { foodId: albume, quantityG: 110 },
      { foodId: yogurt, quantityG: 150 },
      { foodId: avena, quantityG: 60 },
    ],
  })

  it('measures the dish and keeps it as a food', async () => {
    const res = await create(brief())
    expect(res.statusCode).toBe(201)
    const body = res.json() as {
      food: { id: string; source: string; kcal100: number; servingSizeG: number }
      yieldG: number
      portionG: number
      totals: { kcal: number }
      perPortion: { kcal: number }
      items: { kcal: number }[]
    }

    expect(body.food.source).toBe('recipe')
    // 320 g in, nothing said about cooking, so the dish weighs what went in.
    expect(body.yieldG).toBe(320)
    expect(body.totals.kcal).toBe(425)
    expect(body.food.kcal100).toBeCloseTo(132.7, 1)
    // Two portions of 160 g, and the food offers that portion by itself.
    expect(body.portionG).toBe(160)
    expect(body.food.servingSizeG).toBe(160)
    expect(body.perPortion.kcal).toBe(212)
    expect(body.items).toHaveLength(3)
  })

  it('logs by the gram like any other food', async () => {
    const created = (await create(brief())).json() as { food: { id: string } }
    const logged = await app.inject({
      method: 'POST',
      url: '/api/diary',
      headers: auth(user),
      payload: {
        foodId: created.food.id,
        day: '2026-09-19',
        meal: 'breakfast',
        quantityG: 160,
      },
    })
    expect(logged.statusCode).toBe(201)
    expect((logged.json() as { kcal: number }).kcal).toBe(212)
  })

  it('divides by the cooked weight when one is given', async () => {
    const res = await create({ ...brief(), yieldG: 250 })
    const body = res.json() as { food: { kcal100: number }; ingredientsG: number }
    expect(body.ingredientsG).toBe(320)
    expect(body.food.kcal100).toBeCloseTo(170, 0)
  })

  it('is found by searching the catalogue, and only by its author', async () => {
    await create(brief())
    const mine = await app.inject({
      method: 'GET',
      url: '/api/foods/search?q=pancake&local=true',
      headers: auth(user),
    })
    expect(
      (mine.json() as { items: { name: string }[] }).items.map((f) => f.name),
    ).toContain('Pancake proteici')

    const other = await createUser(app)
    const theirs = await app.inject({
      method: 'GET',
      url: '/api/foods/search?q=pancake&local=true',
      headers: auth(other),
    })
    expect((theirs.json() as { items: unknown[] }).items).toHaveLength(0)

    const list = await app.inject({
      method: 'GET',
      url: '/api/recipes',
      headers: auth(other),
    })
    expect((list.json() as { items: unknown[] }).items).toHaveLength(0)
  })

  it('re-measures the food when the ingredients change', async () => {
    const created = (await create(brief())).json() as {
      id: string
      food: { id: string; kcal100: number }
    }
    const patched = await app.inject({
      method: 'PATCH',
      url: `/api/recipes/${created.id}`,
      headers: auth(user),
      payload: { items: [{ foodId: albume, quantityG: 200 }] },
    })
    expect(patched.statusCode).toBe(200)
    const body = patched.json() as {
      yieldG: number
      food: { kcal100: number }
      items: unknown[]
    }
    // The yield follows the ingredients when nobody has overridden it.
    expect(body.yieldG).toBe(200)
    expect(body.food.kcal100).toBeCloseTo(52, 1)
    expect(body.items).toHaveLength(1)

    const [row] = await db
      .select()
      .from(foods)
      .where(eq(foods.id, created.food.id))
    expect(row!.kcal100).toBeCloseTo(52, 1)
  })

  it('keeps the name and the servings a patch does not mention', async () => {
    const created = (await create(brief())).json() as { id: string }
    const patched = await app.inject({
      method: 'PATCH',
      url: `/api/recipes/${created.id}`,
      headers: auth(user),
      payload: { name: 'Pancake della domenica' },
    })
    const body = patched.json() as {
      name: string
      servings: number
      yieldG: number
    }
    expect(body.name).toBe('Pancake della domenica')
    expect(body.servings).toBe(2)
    expect(body.yieldG).toBe(320)
  })

  it('refuses an ingredient this user cannot see', async () => {
    const other = await createUser(app)
    const theirs = await app.inject({
      method: 'POST',
      url: '/api/foods',
      headers: auth(other),
      payload: { name: 'Segreto di famiglia', kcal100: 200 },
    })
    const hidden = (theirs.json() as { id: string }).id

    const res = await create({
      name: 'Con un ingrediente altrui',
      servings: 1,
      items: [{ foodId: hidden, quantityG: 100 }],
    })
    expect(res.statusCode).toBe(404)
    expect((res.json() as { error: string }).error).toBe('food_not_found')
  })

  it('takes its food with it when it is deleted', async () => {
    const created = (await create(brief())).json() as {
      id: string
      food: { id: string }
    }
    const deleted = await app.inject({
      method: 'DELETE',
      url: `/api/recipes/${created.id}`,
      headers: auth(user),
    })
    expect(deleted.statusCode).toBe(204)

    const rows = await db
      .select()
      .from(foods)
      .where(eq(foods.id, created.food.id))
    expect(rows).toHaveLength(0)
  })
})
