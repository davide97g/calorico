import type { FastifyPluginAsync } from 'fastify'
import { and, asc, count, desc, eq, inArray, sql } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db/index.js'
import { diaryEntries, foods, mealItems, meals } from '../db/schema.js'
import { env } from '../env.js'
import { scaleNutriments } from '../lib/nutrition.js'

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const mealSlot = z.enum(['breakfast', 'lunch', 'dinner', 'snack'])
const idParam = z.object({ id: z.string().uuid() })

const itemBody = z.object({
  foodId: z.string().uuid(),
  quantityG: z.number().min(0.1).max(5000),
})

const createBody = z.object({
  name: z.string().trim().min(1).max(80),
  meal: mealSlot,
  items: z.array(itemBody).min(1).max(20),
})

const patchBody = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  meal: mealSlot.optional(),
  items: z.array(itemBody).min(1).max(20).optional(),
})

const logBody = z.object({
  day,
  meal: mealSlot,
})

type FoodRow = typeof foods.$inferSelect

interface ItemInput {
  foodId: string
  quantityG: number
}

async function loadFoods(ids: string[]): Promise<Map<string, FoodRow>> {
  if (ids.length === 0) return new Map()
  const rows = await db.select().from(foods).where(inArray(foods.id, ids))
  return new Map(rows.map((f) => [f.id, f]))
}

async function replaceItems(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  mealId: string,
  items: ItemInput[],
) {
  await tx.delete(mealItems).where(eq(mealItems.mealId, mealId))
  await tx.insert(mealItems).values(
    items.map((item, sort) => ({
      mealId,
      foodId: item.foodId,
      quantityG: item.quantityG,
      sort,
    })),
  )
}

function serializeMeal(
  meal: typeof meals.$inferSelect,
  items: Array<{
    id: string
    foodId: string
    quantityG: number
    sort: number
    food: Pick<
      FoodRow,
      'name' | 'brand' | 'unit' | 'kcal100' | 'category' | 'imageUrl'
    >
  }>,
) {
  const kcal = items.reduce(
    (sum, item) => sum + Math.round((item.food.kcal100 * item.quantityG) / 100),
    0,
  )
  return {
    id: meal.id,
    name: meal.name,
    meal: meal.meal,
    lastLoggedAt: meal.lastLoggedAt,
    createdAt: meal.createdAt,
    updatedAt: meal.updatedAt,
    kcal,
    items: items.map((item) => ({
      id: item.id,
      foodId: item.foodId,
      quantityG: item.quantityG,
      sort: item.sort,
      name: item.food.name,
      brand: item.food.brand,
      unit: item.food.unit,
      category: item.food.category,
      imageUrl: item.food.imageUrl,
      kcal100: item.food.kcal100,
    })),
  }
}

export const mealRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', app.authenticate)

  /**
   * Named plates this user has saved. Empty ones (every ingredient deleted)
   * are omitted — there is nothing to log. `?meal=` prefers that slot for the
   * quick-log strip without hiding the rest.
   */
  app.get('/', async (request) => {
    const { meal: prefer } = z
      .object({ meal: mealSlot.optional() })
      .parse(request.query)
    const userId = request.user.sub

    const rows = await db
      .select({
        meal: meals,
        item: mealItems,
        foodName: foods.name,
        foodBrand: foods.brand,
        foodUnit: foods.unit,
        foodCategory: foods.category,
        foodImageUrl: foods.imageUrl,
        foodKcal100: foods.kcal100,
      })
      .from(meals)
      .innerJoin(mealItems, eq(mealItems.mealId, meals.id))
      .innerJoin(foods, eq(foods.id, mealItems.foodId))
      .where(eq(meals.userId, userId))
      .orderBy(
        ...(prefer ? [sql`(${meals.meal} = ${prefer}) desc`] : []),
        sql`${meals.lastLoggedAt} desc nulls last`,
        desc(meals.createdAt),
        asc(mealItems.sort),
      )

    const byId = new Map<
      string,
      {
        meal: typeof meals.$inferSelect
        items: Parameters<typeof serializeMeal>[1]
      }
    >()
    const order: string[] = []
    for (const row of rows) {
      let group = byId.get(row.meal.id)
      if (!group) {
        group = { meal: row.meal, items: [] }
        byId.set(row.meal.id, group)
        order.push(row.meal.id)
      }
      group.items.push({
        id: row.item.id,
        foodId: row.item.foodId,
        quantityG: row.item.quantityG,
        sort: row.item.sort,
        food: {
          name: row.foodName,
          brand: row.foodBrand,
          unit: row.foodUnit,
          category: row.foodCategory,
          imageUrl: row.foodImageUrl,
          kcal100: row.foodKcal100,
        },
      })
    }

    return {
      items: order.map((id) => {
        const group = byId.get(id)!
        return serializeMeal(group.meal, group.items)
      }),
    }
  })

  app.post('/', async (request, reply) => {
    const body = createBody.parse(request.body)
    const userId = request.user.sub

    const [existing] = await db
      .select({ value: count() })
      .from(meals)
      .where(eq(meals.userId, userId))
    if ((existing?.value ?? 0) >= env.MAX_MEALS_PER_USER) {
      return reply.code(409).send({ error: 'too_many_meals' })
    }

    const byId = await loadFoods(body.items.map((i) => i.foodId))
    if (body.items.some((i) => !byId.has(i.foodId))) {
      return reply.code(404).send({ error: 'food_not_found' })
    }

    const created = await db.transaction(async (tx) => {
      const [meal] = await tx
        .insert(meals)
        .values({
          userId,
          name: body.name,
          meal: body.meal,
        })
        .returning()
      if (!meal) throw new Error('failed to create meal')
      await replaceItems(tx, meal.id, body.items)
      return meal
    })

    const items = await db
      .select({ item: mealItems, food: foods })
      .from(mealItems)
      .innerJoin(foods, eq(foods.id, mealItems.foodId))
      .where(eq(mealItems.mealId, created.id))
      .orderBy(asc(mealItems.sort))

    return reply.code(201).send(
      serializeMeal(
        created,
        items.map((r) => ({
          id: r.item.id,
          foodId: r.item.foodId,
          quantityG: r.item.quantityG,
          sort: r.item.sort,
          food: r.food,
        })),
      ),
    )
  })

  app.patch('/:id', async (request, reply) => {
    const { id } = idParam.parse(request.params)
    const body = patchBody.parse(request.body)
    const userId = request.user.sub

    const [existing] = await db
      .select()
      .from(meals)
      .where(and(eq(meals.id, id), eq(meals.userId, userId)))
      .limit(1)
    if (!existing) return reply.code(404).send({ error: 'not_found' })

    if (body.items) {
      const byId = await loadFoods(body.items.map((i) => i.foodId))
      if (body.items.some((i) => !byId.has(i.foodId))) {
        return reply.code(404).send({ error: 'food_not_found' })
      }
    }

    const updated = await db.transaction(async (tx) => {
      const [meal] = await tx
        .update(meals)
        .set({
          ...(body.name ? { name: body.name } : {}),
          ...(body.meal ? { meal: body.meal } : {}),
          updatedAt: new Date(),
        })
        .where(eq(meals.id, id))
        .returning()
      if (!meal) throw new Error('failed to update meal')
      if (body.items) await replaceItems(tx, id, body.items)
      return meal
    })

    const items = await db
      .select({ item: mealItems, food: foods })
      .from(mealItems)
      .innerJoin(foods, eq(foods.id, mealItems.foodId))
      .where(eq(mealItems.mealId, id))
      .orderBy(asc(mealItems.sort))

    return serializeMeal(
      updated,
      items.map((r) => ({
        id: r.item.id,
        foodId: r.item.foodId,
        quantityG: r.item.quantityG,
        sort: r.item.sort,
        food: r.food,
      })),
    )
  })

  app.delete('/:id', async (request, reply) => {
    const { id } = idParam.parse(request.params)
    const deleted = await db
      .delete(meals)
      .where(and(eq(meals.id, id), eq(meals.userId, request.user.sub)))
      .returning({ id: meals.id })
    if (deleted.length === 0) return reply.code(404).send({ error: 'not_found' })
    return reply.code(204).send()
  })

  /**
   * Writes one diary row per ingredient, same as a reviewed photo. The piatto
   * is a template, not a composite food — entries stay independently editable.
   */
  app.post('/:id/log', async (request, reply) => {
    const { id } = idParam.parse(request.params)
    const body = logBody.parse(request.body)
    const userId = request.user.sub

    const [meal] = await db
      .select()
      .from(meals)
      .where(and(eq(meals.id, id), eq(meals.userId, userId)))
      .limit(1)
    if (!meal) return reply.code(404).send({ error: 'not_found' })

    const rows = await db
      .select({ item: mealItems, food: foods })
      .from(mealItems)
      .innerJoin(foods, eq(foods.id, mealItems.foodId))
      .where(eq(mealItems.mealId, id))
      .orderBy(asc(mealItems.sort))

    if (rows.length === 0) {
      return reply.code(404).send({ error: 'meal_empty' })
    }

    const entries = await db.transaction(async (tx) => {
      const created = await tx
        .insert(diaryEntries)
        .values(
          rows.map(({ item, food }) => ({
            userId,
            foodId: food.id,
            day: body.day,
            meal: body.meal,
            quantityG: item.quantityG,
            nameSnapshot: food.name,
            brandSnapshot: food.brand,
            ...scaleNutriments(food, item.quantityG),
          })),
        )
        .returning()

      await tx
        .update(meals)
        .set({ lastLoggedAt: new Date(), updatedAt: new Date() })
        .where(eq(meals.id, id))

      return created
    })

    return reply.code(201).send({ entries })
  })
}
