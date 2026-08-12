import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/index.js'
import {
  diaryEntries,
  foods,
  groceryItems,
  scanEvents,
  type DiaryEntry,
} from '../db/schema.js'
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

describe.skipIf(!hasDb)('recent foods', () => {
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

  const addFood = async (name: string) => {
    const [food] = await db
      .insert(foods)
      .values({
        source: 'generic',
        name,
        kcal100: 100,
        protein100: 5,
        carbs100: 10,
        fat100: 2,
        unit: 'g',
      })
      .returning()
    return food!
  }

  /** One diary row per logged portion, as POST /diary writes them. */
  const seedEntries = (
    foodId: string,
    name: string,
    entries: {
      age: number
      quantityG: number
      meal?: DiaryEntry['meal']
    }[],
  ) =>
    db.insert(diaryEntries).values(
      entries.map(({ age, quantityG, meal = 'breakfast' }) => ({
        userId: user.id,
        foodId,
        day: daysAgo(age).toISOString().slice(0, 10),
        meal,
        quantityG,
        nameSnapshot: name,
        kcal: quantityG,
        createdAt: daysAgo(age),
      })),
    )

  const recent = async (query = '') => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/foods/recent${query}`,
      headers: auth(user),
    })
    expect(res.statusCode).toBe(200)
    return res.json() as {
      items: {
        id: string
        name: string
        lastQuantityG: number | null
        topQuantities: number[]
        times: number
      }[]
    }
  }

  /** Opening a food's page is what records an encounter — see routes/foods.ts. */
  const openFood = async (id: string) => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/foods/${id}`,
      headers: auth(user),
    })
    expect(res.statusCode).toBe(200)
  }

  it('ranks a daily habit above a food logged more often last season', async () => {
    const oats = await addFood('Fiocchi di avena')
    const cake = await addFood('Torta della nonna')
    await seedEntries(oats.id, oats.name, [
      { age: 1, quantityG: 60 },
      { age: 3, quantityG: 60 },
      { age: 6, quantityG: 60 },
    ])
    await seedEntries(cake.id, cake.name, [
      { age: 120, quantityG: 100 },
      { age: 130, quantityG: 100 },
      { age: 140, quantityG: 100 },
      { age: 150, quantityG: 100 },
      { age: 160, quantityG: 100 },
    ])

    const { items } = await recent()
    expect(items.map((item) => item.name)).toEqual([
      'Fiocchi di avena',
      'Torta della nonna',
    ])
    expect(items[0]!.times).toBe(3)
  })

  it('remembers the portion used last, and the portions used most', async () => {
    const yogurt = await addFood('Yogurt greco')
    await seedEntries(yogurt.id, yogurt.name, [
      { age: 1, quantityG: 200 },
      { age: 2, quantityG: 180 },
      { age: 4, quantityG: 180 },
      { age: 9, quantityG: 180 },
    ])

    const [item] = (await recent()).items
    expect(item!.lastQuantityG).toBe(200)
    // 180 g is the habit; 200 g is what happened yesterday. Both are offered,
    // the habit first, and nothing else creeps into the list.
    expect(item!.topQuantities).toEqual([180, 200])
  })

  it('weights the meal being logged without hiding the other meals', async () => {
    const eggs = await addFood('Uova')
    const pasta = await addFood('Pasta')
    await seedEntries(eggs.id, eggs.name, [
      { age: 2, quantityG: 120, meal: 'breakfast' },
      { age: 5, quantityG: 120, meal: 'breakfast' },
    ])
    await seedEntries(pasta.id, pasta.name, [
      { age: 1, quantityG: 100, meal: 'dinner' },
      { age: 3, quantityG: 100, meal: 'dinner' },
      { age: 4, quantityG: 100, meal: 'dinner' },
    ])

    const breakfast = await recent('?meal=breakfast')
    expect(breakfast.items[0]!.name).toBe('Uova')
    // Discounted, not filtered: pasta for breakfast is unusual, not impossible.
    expect(breakfast.items.map((item) => item.name)).toContain('Pasta')

    const dinner = await recent('?meal=dinner')
    expect(dinner.items[0]!.name).toBe('Pasta')
  })

  it('keeps one user’s foods out of another’s list', async () => {
    const oats = await addFood('Fiocchi di avena')
    await seedEntries(oats.id, oats.name, [{ age: 1, quantityG: 60 }])

    const stranger = await createUser(app)
    const res = await app.inject({
      method: 'GET',
      url: '/api/foods/recent',
      headers: auth(stranger),
    })
    expect(res.statusCode).toBe(200)
    expect((res.json() as { items: unknown[] }).items).toEqual([])
  })

  it('offers a food that was only looked at, with no portion to promise', async () => {
    const tuna = await addFood('Tonno in scatola')
    await openFood(tuna.id)

    // The default is for the strip and the sheet, which log with one tap.
    expect((await recent()).items).toEqual([])

    const [item] = (await recent('?include=all')).items
    expect(item!.name).toBe('Tonno in scatola')
    expect(item!.lastQuantityG).toBeNull()
    expect(item!.topQuantities).toEqual([])
    expect(item!.times).toBe(0)
  })

  it('ranks a food that was eaten above one that was only looked at', async () => {
    const oats = await addFood('Fiocchi di avena')
    const tuna = await addFood('Tonno in scatola')
    await seedEntries(oats.id, oats.name, [{ age: 2, quantityG: 60 }])
    await openFood(tuna.id)

    const { items } = await recent('?include=all')
    expect(items.map((item) => item.name)).toEqual([
      'Fiocchi di avena',
      'Tonno in scatola',
    ])
  })

  it('keeps the portions of a food both eaten and looked at', async () => {
    const yogurt = await addFood('Yogurt greco')
    await seedEntries(yogurt.id, yogurt.name, [{ age: 3, quantityG: 180 }])
    await openFood(yogurt.id)

    const { items } = await recent('?include=all')
    expect(items).toHaveLength(1)
    expect(items[0]!.lastQuantityG).toBe(180)
    expect(items[0]!.times).toBe(1)
  })

  it('puts a food created by hand in the list before it is ever logged', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/foods',
      headers: auth(user),
      payload: { name: 'Insalata della nonna', kcal100: 120 },
    })
    expect(res.statusCode).toBe(201)

    const { items } = await recent('?include=all')
    expect(items.map((item) => item.name)).toEqual(['Insalata della nonna'])
  })
})
