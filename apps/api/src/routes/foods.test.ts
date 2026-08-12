import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/index.js'
import { foods, type NewFood } from '../db/schema.js'
import { hasConfidentGenericMatch } from '../lib/food-search.js'
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
 * The generic half of the catalogue exists so that plain food is findable:
 * Open Food Facts has no record of a peach, only of peach iced tea. These
 * check the two halves of that — the alias matching in the SQL, and the rule
 * that stops the OFF fallback from burying the fruit under the drinks.
 *
 * OFF_ENABLED is false for the whole test run, so nothing here reaches the
 * network regardless.
 */

const peach: NewFood = {
  source: 'generic',
  name: 'Pesche',
  aliases: ['pesca', 'peaches'],
  category: 'Frutta',
  kcal100: 43.3,
  protein100: 1.08,
  carbs100: 9,
  fat100: 0.33,
  servingSizeG: 150,
  unit: 'g',
}

const icedTea: NewFood = {
  source: 'off',
  barcode: '5449000237132',
  name: 'Fuze Tea pesca',
  brand: 'Coca-Cola',
  kcal100: 18,
  protein100: 0,
  carbs100: 4.4,
  fat100: 0,
  unit: 'ml',
  isLiquid: true,
}

describe.skipIf(!hasDb)('food search', () => {
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
    await db.insert(foods).values([peach, icedTea])
  })

  const search = async (q: string) => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/foods/search?q=${encodeURIComponent(q)}`,
      headers: auth(user),
    })
    expect(res.statusCode).toBe(200)
    return (res.json() as { items: Array<{ name: string; source: string }> })
      .items
  }

  it('finds the fruit by a form its name is never written in', async () => {
    // The catalogue names it "Pesche"; nobody searching types the plural.
    const names = (await search('pesca')).map((f) => f.name)
    expect(names).toContain('Pesche')
  })

  it('ranks the plain food above the flavoured product', async () => {
    const items = await search('pesca')
    expect(items[0]?.name).toBe('Pesche')
    expect(items.map((f) => f.name)).toContain('Fuze Tea pesca')
  })

  it('finds it by the English name too', async () => {
    // The alias is the plural the taxonomy stores; the singular has to work.
    expect((await search('peach')).map((f) => f.name)).toContain('Pesche')
    expect((await search('peaches')).map((f) => f.name)).toContain('Pesche')
  })

  it('does not leak the search-only fields to the client', async () => {
    const [first] = await search('pesca')
    expect(first).not.toHaveProperty('aliases')
    expect(first).not.toHaveProperty('score')
  })
})

describe.skipIf(!hasDb)('custom food isolation', () => {
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

  const createCustom = async (who: TestUser, name: string, barcode?: string) => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/foods',
      headers: auth(who),
      payload: {
        name,
        kcal100: 380,
        protein100: 6,
        carbs100: 45,
        fat100: 19,
        ...(barcode ? { barcode } : {}),
      },
    })
    expect(res.statusCode).toBe(201)
    return res.json() as { id: string; name: string }
  }

  it("keeps one user's homemade food out of another's search, detail and barcode", async () => {
    const alice = await createUser(app)
    const bob = await createUser(app)
    const food = await createCustom(alice, 'Torta della nonna', '8000000000001')

    const search = await app.inject({
      method: 'GET',
      url: `/api/foods/search?q=${encodeURIComponent('Torta della nonna')}&local=true`,
      headers: auth(bob),
    })
    expect(search.statusCode).toBe(200)
    const names = (search.json() as { items: { name: string }[] }).items.map(
      (i) => i.name,
    )
    expect(names).not.toContain('Torta della nonna')

    const detail = await app.inject({
      method: 'GET',
      url: `/api/foods/${food.id}`,
      headers: auth(bob),
    })
    expect(detail.statusCode).toBe(404)

    const images = await app.inject({
      method: 'GET',
      url: `/api/foods/${food.id}/images`,
      headers: auth(bob),
    })
    expect(images.statusCode).toBe(404)

    const barcode = await app.inject({
      method: 'GET',
      url: '/api/foods/barcode/8000000000001',
      headers: auth(bob),
    })
    expect(barcode.statusCode).not.toBe(200)

    const own = await app.inject({
      method: 'GET',
      url: `/api/foods/${food.id}`,
      headers: auth(alice),
    })
    expect(own.statusCode).toBe(200)
  })
})

describe('hasConfidentGenericMatch', () => {
  const generic = { source: 'generic', name: 'Pesche', aliases: ['pesca'] }

  it('accepts a generic food whose name or alias starts with the term', () => {
    expect(hasConfidentGenericMatch([generic] as never, 'pesc')).toBe(true)
    expect(hasConfidentGenericMatch([generic] as never, 'pesca')).toBe(true)
  })

  it('ignores accents and case, as the SQL does', () => {
    const purè = { source: 'generic', name: 'Purè di patate', aliases: [] }
    expect(hasConfidentGenericMatch([purè] as never, 'PURE')).toBe(true)
  })

  it('does not count a branded product, however well it matches', () => {
    const tea = { source: 'off', name: 'Fuze Tea pesca', aliases: null }
    expect(hasConfidentGenericMatch([tea] as never, 'fuze')).toBe(false)
  })

  it('stays out of the way of a two-letter query', () => {
    // Too short to be a confident answer — let Open Food Facts have a go.
    expect(hasConfidentGenericMatch([generic] as never, 'pe')).toBe(false)
  })
})
