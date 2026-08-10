import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/index.js'
import { foods, groceryItems, scanEvents } from '../db/schema.js'
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
 * The ranking in lib/history.ts is the whole point of both endpoints, so these
 * check the properties it promises rather than exact scores: a weekly habit
 * outranks an old flurry, an old flurry still outranks a single old buy, and
 * whatever is already on the list stays out of the suggestions.
 */

const daysAgo = (days: number) =>
  new Date(Date.now() - days * 24 * 60 * 60 * 1000)

/** One grocery row per add, which is what the real insert path produces. */
async function seedGroceryAdds(
  userId: string,
  name: string,
  ages: number[],
  { completed = true }: { completed?: boolean } = {},
) {
  await db.insert(groceryItems).values(
    ages.map((age) => ({
      userId,
      dedupeKey: `text:${name.toLowerCase()}`,
      nameSnapshot: name,
      quantity: 1,
      completed,
      completedAt: completed ? daysAgo(age) : null,
      createdAt: daysAgo(age),
      updatedAt: daysAgo(age),
    })),
  )
}

describe.skipIf(!hasDb)('grocery suggestions', () => {
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

  const suggest = async (q: string) => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/grocery/suggestions?q=${encodeURIComponent(q)}`,
      headers: auth(user),
    })
    expect(res.statusCode).toBe(200)
    return res.json() as {
      items: { name: string; times: number; score: number; foodId: string | null }[]
    }
  }

  it('ranks a live habit above a bigger but older one', async () => {
    // Six buys, all last winter, against four in the past month.
    await seedGroceryAdds(user.id, 'Latte di mandorla', [
      200, 210, 220, 230, 240, 250,
    ])
    await seedGroceryAdds(user.id, 'Latte intero', [2, 9, 16, 23])

    const { items } = await suggest('latte')
    expect(items.map((item) => item.name)).toEqual([
      'Latte intero',
      'Latte di mandorla',
    ])
    expect(items[0]!.times).toBe(4)
    expect(items[0]!.score).toBeGreaterThan(items[1]!.score)
  })

  it('counts repeats, so an old regular still beats an old one-off', async () => {
    await seedGroceryAdds(user.id, 'Pane integrale', [90, 100, 110])
    await seedGroceryAdds(user.id, 'Pane azzimo', [95])

    const { items } = await suggest('pane')
    expect(items.map((item) => item.name)).toEqual([
      'Pane integrale',
      'Pane azzimo',
    ])
  })

  it('prefers a name that starts with what was typed', async () => {
    // "Insalata" is bought far more often, but "lat" is the start of "Latte".
    await seedGroceryAdds(user.id, 'Insalata', [1, 3, 5, 7, 9, 11])
    await seedGroceryAdds(user.id, 'Latte', [40])

    const { items } = await suggest('lat')
    expect(items[0]!.name).toBe('Latte')
  })

  it('leaves out what is already waiting on the list', async () => {
    await seedGroceryAdds(user.id, 'Detersivo', [30, 60])
    await seedGroceryAdds(user.id, 'Detersivo', [0], { completed: false })

    expect((await suggest('deter')).items).toEqual([])
  })

  it('offers a scanned product back as its food, not as free text', async () => {
    const [food] = await db
      .insert(foods)
      .values({
        source: 'off',
        barcode: '8000500310427',
        name: 'Nutella',
        brand: 'Ferrero',
        kcal100: 539,
        protein100: 6.3,
        carbs100: 57.5,
        fat100: 30.9,
        unit: 'g',
      })
      .returning()

    await db.insert(scanEvents).values({
      userId: user.id,
      kind: 'barcode',
      foodId: food!.id,
      barcode: food!.barcode,
      nameSnapshot: food!.name,
      brandSnapshot: food!.brand,
      createdAt: daysAgo(3),
    })

    const { items } = await suggest('nutel')
    expect(items).toHaveLength(1)
    // With a foodId the add goes through POST /grocery { foodId }, which is what
    // gives the row its brand and links it back to the catalogue.
    expect(items[0]!.foodId).toBe(food!.id)
  })

  it('ignores photo scans, whose name is a summary of a meal', async () => {
    await db.insert(scanEvents).values({
      userId: user.id,
      kind: 'photo',
      nameSnapshot: 'Pasta al pomodoro, insalata',
      items: [{ label: 'Pasta al pomodoro', quantityG: 250 }],
      createdAt: daysAgo(1),
    })

    expect((await suggest('pasta')).items).toEqual([])
  })

  it('treats % and _ as text, not as wildcards', async () => {
    await seedGroceryAdds(user.id, 'Yogurt', [1])
    expect((await suggest('%')).items).toEqual([])
  })
})

describe.skipIf(!hasDb)('scan history', () => {
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

  const list = async (query = '') => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/scans${query}`,
      headers: auth(user),
    })
    expect(res.statusCode).toBe(200)
    return res.json() as {
      items: {
        key: string
        nameSnapshot: string
        times: number
        lastAt: string
        scannedBy: { name: string }
      }[]
      nextOffset: number | null
    }
  }

  const seedScan = (name: string, barcode: string, age: number) =>
    db.insert(scanEvents).values({
      userId: user.id,
      kind: 'barcode',
      barcode,
      nameSnapshot: name,
      createdAt: daysAgo(age),
    })

  it('folds repeat scans of one product into a single ranked row', async () => {
    await seedScan('Yogurt greco', '1111111111111', 1)
    await seedScan('Yogurt greco', '1111111111111', 8)
    await seedScan('Yogurt greco', '1111111111111', 15)
    await seedScan('Tonno', '2222222222222', 4)

    const { items } = await list()
    expect(items).toHaveLength(2)
    expect(items[0]!.nameSnapshot).toBe('Yogurt greco')
    expect(items[0]!.times).toBe(3)
    // The snapshot and the author come from the most recent of the three.
    expect(new Date(items[0]!.lastAt).getTime()).toBeCloseTo(
      daysAgo(1).getTime(),
      -4,
    )
    expect(items[1]!.times).toBe(1)
  })

  it('filters by name and pages by offset', async () => {
    await seedScan('Yogurt greco', '1111111111111', 1)
    await seedScan('Yogurt magro', '3333333333333', 2)
    await seedScan('Tonno', '2222222222222', 3)

    const filtered = await list('?q=yogurt')
    expect(filtered.items.map((item) => item.nameSnapshot)).toEqual([
      'Yogurt greco',
      'Yogurt magro',
    ])

    const firstPage = await list('?limit=1')
    expect(firstPage.items).toHaveLength(1)
    expect(firstPage.nextOffset).toBe(1)

    const secondPage = await list('?limit=1&offset=1')
    expect(secondPage.items[0]!.nameSnapshot).not.toBe(
      firstPage.items[0]!.nameSnapshot,
    )
  })

  it('keeps a family member out of a stranger’s history', async () => {
    await seedScan('Yogurt greco', '1111111111111', 1)

    const stranger = await createUser(app)
    const res = await app.inject({
      method: 'GET',
      url: '/api/scans',
      headers: auth(stranger),
    })
    expect(res.statusCode).toBe(200)
    expect((res.json() as { items: unknown[] }).items).toEqual([])
  })
})
