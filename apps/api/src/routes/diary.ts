import type { FastifyPluginAsync } from 'fastify'
import { and, asc, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db/index.js'
import { diaryEntries, foods, profiles } from '../db/schema.js'
import { scaleNutriments } from '../lib/nutrition.js'
import { env } from '../env.js'
import { customFood } from './foods.js'

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const meal = z.enum(['breakfast', 'lunch', 'dinner', 'snack'])

const createBody = z.object({
  foodId: z.string().uuid(),
  day,
  meal,
  quantityG: z.number().min(0.1).max(5000),
})

const patchBody = z.object({
  quantityG: z.number().min(0.1).max(5000).optional(),
  meal: meal.optional(),
  day: day.optional(),
})

const quantityG = z.number().min(0.1).max(5000)

/**
 * A batched row is either an existing food or one the photo flow invented,
 * which has to become a real `foods` row before it can be logged — diary
 * entries reference a food by id.
 */
const batchItem = z.union([
  z.object({ foodId: z.string().uuid(), quantityG }),
  z.object({ newFood: customFood, quantityG }),
])

const batchBody = z.object({
  day,
  meal,
  // One photo of one plate. Well above what a meal produces, low enough that a
  // buggy client cannot write hundreds of rows in one call.
  items: z.array(batchItem).min(1).max(20),
})

export const diaryRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', app.authenticate)

  /** Everything the Today screen needs in one round trip. */
  app.get('/', async (request) => {
    const { day: theDay } = z.object({ day }).parse(request.query)
    const userId = request.user.sub

    const [entries, [profile]] = await Promise.all([
      db
        .select({
          entry: diaryEntries,
          foodImageUrl: foods.imageUrl,
          foodUnit: foods.unit,
          foodServingSizeG: foods.servingSizeG,
        })
        .from(diaryEntries)
        .leftJoin(foods, eq(foods.id, diaryEntries.foodId))
        .where(and(eq(diaryEntries.userId, userId), eq(diaryEntries.day, theDay)))
        .orderBy(asc(diaryEntries.createdAt)),
      db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1),
    ])

    const items = entries.map((r) => ({
      ...r.entry,
      imageUrl: r.foodImageUrl,
      unit: r.foodUnit ?? 'g',
      servingSizeG: r.foodServingSizeG,
    }))

    const totals = items.reduce(
      (acc, e) => {
        acc.kcal += e.kcal
        acc.proteinG += e.proteinG
        acc.carbsG += e.carbsG
        acc.fatG += e.fatG
        acc.fiberG += e.fiberG ?? 0
        acc.sugarsG += e.sugarsG ?? 0
        acc.satFatG += e.satFatG ?? 0
        acc.saltG += e.saltG ?? 0
        return acc
      },
      {
        kcal: 0,
        proteinG: 0,
        carbsG: 0,
        fatG: 0,
        fiberG: 0,
        sugarsG: 0,
        satFatG: 0,
        saltG: 0,
      },
    )

    const byMeal = {
      breakfast: items.filter((e) => e.meal === 'breakfast'),
      lunch: items.filter((e) => e.meal === 'lunch'),
      dinner: items.filter((e) => e.meal === 'dinner'),
      snack: items.filter((e) => e.meal === 'snack'),
    }

    return {
      day: theDay,
      entries: items,
      byMeal,
      totals: {
        kcal: Math.round(totals.kcal),
        proteinG: Math.round(totals.proteinG * 10) / 10,
        carbsG: Math.round(totals.carbsG * 10) / 10,
        fatG: Math.round(totals.fatG * 10) / 10,
        fiberG: Math.round(totals.fiberG * 10) / 10,
        sugarsG: Math.round(totals.sugarsG * 10) / 10,
        satFatG: Math.round(totals.satFatG * 10) / 10,
        saltG: Math.round(totals.saltG * 10) / 10,
      },
      targets: profile
        ? {
            kcal: profile.targetKcal,
            proteinG: profile.targetProteinG,
            carbsG: profile.targetCarbsG,
            fatG: profile.targetFatG,
            kcalMin: profile.targetKcalMin,
            kcalMax: profile.targetKcalMax,
          }
        : null,
    }
  })

  app.post('/', async (request, reply) => {
    const body = createBody.parse(request.body)
    const [food] = await db
      .select()
      .from(foods)
      .where(eq(foods.id, body.foodId))
      .limit(1)
    if (!food) return reply.code(404).send({ error: 'food_not_found' })

    const macros = scaleNutriments(food, body.quantityG)
    const [created] = await db
      .insert(diaryEntries)
      .values({
        userId: request.user.sub,
        foodId: food.id,
        day: body.day,
        meal: body.meal,
        quantityG: body.quantityG,
        nameSnapshot: food.name,
        brandSnapshot: food.brand,
        ...macros,
      })
      .returning()

    return reply.code(201).send(created)
  })

  /**
   * Saves a whole reviewed meal at once — what the photo flow produces. Foods
   * the catalogue did not have are created as custom foods owned by the caller,
   * so they are searchable and re-loggable next time.
   *
   * All or nothing: a plate half-written because row four had a stale food id
   * is worse than a plate the user has to re-confirm.
   */
  app.post('/batch', async (request, reply) => {
    const body = batchBody.parse(request.body)
    const userId = request.user.sub

    // Resolve the existing foods in one query, before opening a transaction —
    // a bad id should 404 rather than roll back work already done.
    const ids = body.items.flatMap((i) => ('foodId' in i ? [i.foodId] : []))
    const existing = ids.length
      ? await db.select().from(foods).where(inArray(foods.id, ids))
      : []
    const byId = new Map(existing.map((f) => [f.id, f]))
    if (ids.some((id) => !byId.has(id)))
      return reply.code(404).send({ error: 'food_not_found' })

    const created = await db.transaction(async (tx) => {
      const rows = []

      for (const item of body.items) {
        let food: typeof foods.$inferSelect
        if ('foodId' in item) {
          // Presence was checked above, before the transaction opened.
          food = byId.get(item.foodId)!
        } else {
          const [inserted] = await tx
            .insert(foods)
            .values({
              ...item.newFood,
              source: 'custom',
              unit: item.newFood.isLiquid ? 'ml' : 'g',
              createdBy: userId,
              // The marker rides in the existing jsonb column, so telling
              // AI guesses apart from foods the user typed needs no migration.
              raw: {
                aiEstimated: true,
                via: 'photo',
                model: env.vision?.model ?? null,
              },
            })
            .returning()
          if (!inserted) throw new Error('failed to create food')
          food = inserted
        }

        rows.push({
          userId,
          foodId: food.id,
          day: body.day,
          meal: body.meal,
          quantityG: item.quantityG,
          nameSnapshot: food.name,
          brandSnapshot: food.brand,
          ...scaleNutriments(food, item.quantityG),
        })
      }

      return tx.insert(diaryEntries).values(rows).returning()
    })

    return reply.code(201).send({ entries: created })
  })

  app.patch('/:id', async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    const body = patchBody.parse(request.body)
    const userId = request.user.sub

    const [existing] = await db
      .select()
      .from(diaryEntries)
      .where(and(eq(diaryEntries.id, id), eq(diaryEntries.userId, userId)))
      .limit(1)
    if (!existing) return reply.code(404).send({ error: 'not_found' })

    // Changing the quantity means re-deriving macros from the source food; if
    // that food is gone we scale the snapshot instead of failing the edit.
    let macros: ReturnType<typeof scaleNutriments> | undefined
    if (body.quantityG != null && body.quantityG !== existing.quantityG) {
      const [food] = existing.foodId
        ? await db
            .select()
            .from(foods)
            .where(eq(foods.id, existing.foodId))
            .limit(1)
        : []
      const per100 = food ?? {
        kcal100: (existing.kcal / existing.quantityG) * 100,
        protein100: (existing.proteinG / existing.quantityG) * 100,
        carbs100: (existing.carbsG / existing.quantityG) * 100,
        fat100: (existing.fatG / existing.quantityG) * 100,
        fiber100:
          existing.fiberG == null
            ? null
            : (existing.fiberG / existing.quantityG) * 100,
        sugars100:
          existing.sugarsG == null
            ? null
            : (existing.sugarsG / existing.quantityG) * 100,
        satFat100:
          existing.satFatG == null
            ? null
            : (existing.satFatG / existing.quantityG) * 100,
        salt100:
          existing.saltG == null
            ? null
            : (existing.saltG / existing.quantityG) * 100,
      }
      macros = scaleNutriments(per100, body.quantityG)
    }

    const [updated] = await db
      .update(diaryEntries)
      .set({
        ...(body.meal ? { meal: body.meal } : {}),
        ...(body.day ? { day: body.day } : {}),
        ...(body.quantityG != null ? { quantityG: body.quantityG } : {}),
        ...(macros ?? {}),
      })
      .where(eq(diaryEntries.id, id))
      .returning()

    return updated
  })

  app.delete('/:id', async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    const deleted = await db
      .delete(diaryEntries)
      .where(
        and(eq(diaryEntries.id, id), eq(diaryEntries.userId, request.user.sub)),
      )
      .returning({ id: diaryEntries.id })
    if (deleted.length === 0) return reply.code(404).send({ error: 'not_found' })
    return reply.code(204).send()
  })

  /** Copies a whole meal from one day to another — "same lunch as yesterday". */
  app.post('/copy', async (request) => {
    const body = z
      .object({ from: day, to: day, meal: meal.optional() })
      .parse(request.body)
    const userId = request.user.sub

    const source = await db
      .select()
      .from(diaryEntries)
      .where(
        and(
          eq(diaryEntries.userId, userId),
          eq(diaryEntries.day, body.from),
          ...(body.meal ? [eq(diaryEntries.meal, body.meal)] : []),
        ),
      )

    if (source.length === 0) return { copied: 0 }

    await db.insert(diaryEntries).values(
      source.map((e) => ({
        userId,
        foodId: e.foodId,
        day: body.to,
        meal: e.meal,
        quantityG: e.quantityG,
        nameSnapshot: e.nameSnapshot,
        brandSnapshot: e.brandSnapshot,
        kcal: e.kcal,
        proteinG: e.proteinG,
        carbsG: e.carbsG,
        fatG: e.fatG,
        fiberG: e.fiberG,
        sugarsG: e.sugarsG,
        satFatG: e.satFatG,
        saltG: e.saltG,
      })),
    )

    return { copied: source.length }
  })
}
