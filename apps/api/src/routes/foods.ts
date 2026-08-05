import type { FastifyPluginAsync } from 'fastify'
import { and, desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db/index.js'
import { diaryEntries, favorites, foods, type NewFood } from '../db/schema.js'
import { fetchByBarcode, searchOff } from '../lib/off.js'
import { cacheFoods } from '../lib/food-cache.js'
import { searchLocalFoods } from '../lib/food-search.js'
import { listFoodImages, syncOffImages } from '../lib/food-images.js'
import { r2Enabled } from '../lib/r2.js'

const searchQuery = z.object({
  q: z.string().min(1).max(120),
  limit: z.coerce.number().int().min(1).max(50).default(25),
  /** Skip the network call — used by the barcode screen and by tests. */
  local: z.coerce.boolean().default(false),
})

/** Also the shape POST /api/diary/batch accepts for an AI-estimated food. */
export const customFood = z.object({
  name: z.string().min(2).max(160),
  brand: z.string().max(120).optional(),
  kcal100: z.number().min(0).max(950),
  protein100: z.number().min(0).max(100).default(0),
  carbs100: z.number().min(0).max(100).default(0),
  fat100: z.number().min(0).max(100).default(0),
  fiber100: z.number().min(0).max(100).optional(),
  servingSizeG: z.number().min(1).max(2000).optional(),
  servingLabel: z.string().max(80).optional(),
  isLiquid: z.boolean().default(false),
  barcode: z
    .string()
    .regex(/^\d{8,14}$/)
    .optional(),
})

export const foodRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', app.authenticate)

  /** Ranking lives in lib/food-search.ts — the photo matcher reuses it. */
  app.get('/search', async (request) => {
    const { q, limit, local } = searchQuery.parse(request.query)
    const term = q.trim()

    let results = await searchLocalFoods(term, limit)

    // Thin local mirror? Ask Open Food Facts once, cache, then re-query so the
    // ranking rules apply to the newcomers too.
    if (!local && results.length < 8) {
      try {
        const remote = await searchOff(term, limit)
        if (remote.length > 0) {
          await cacheFoods(remote)
          results = await searchLocalFoods(term, limit)
        }
      } catch (err) {
        request.log.warn({ err }, 'OFF search failed, serving local results')
      }
    }

    // `score` is a ranking detail; the client has never seen it.
    const items = results.map(({ score: _score, ...food }) => food)
    return { items, source: items.length ? 'db' : 'empty' }
  })

  app.get('/barcode/:code', async (request, reply) => {
    const { code } = z
      .object({ code: z.string().regex(/^\d{6,14}$/) })
      .parse(request.params)

    const [local] = await db
      .select()
      .from(foods)
      .where(eq(foods.barcode, code))
      .limit(1)
    if (local) return local

    let mapped: NewFood | null = null
    try {
      mapped = await fetchByBarcode(code)
    } catch (err) {
      request.log.warn({ err, code }, 'OFF barcode lookup failed')
      return reply.code(502).send({ error: 'off_unavailable' })
    }
    if (!mapped) return reply.code(404).send({ error: 'product_not_found' })

    const [saved] = await cacheFoods([mapped])
    return saved
  })

  app.get('/recent', async (request) => {
    const rows = await db
      .selectDistinctOn([foods.id], {
        food: foods,
        lastUsed: diaryEntries.createdAt,
      })
      .from(diaryEntries)
      .innerJoin(foods, eq(foods.id, diaryEntries.foodId))
      .where(eq(diaryEntries.userId, request.user.sub))
      .orderBy(foods.id, desc(diaryEntries.createdAt))
      .limit(30)

    return {
      items: rows
        .sort((a, b) => +new Date(b.lastUsed) - +new Date(a.lastUsed))
        .map((r) => r.food),
    }
  })

  app.get('/favorites', async (request) => {
    const rows = await db
      .select({ food: foods })
      .from(favorites)
      .innerJoin(foods, eq(foods.id, favorites.foodId))
      .where(eq(favorites.userId, request.user.sub))
      .orderBy(desc(favorites.createdAt))
      .limit(100)
    return { items: rows.map((r) => r.food) }
  })

  app.post('/', async (request, reply) => {
    const body = customFood.parse(request.body)
    const [created] = await db
      .insert(foods)
      .values({
        ...body,
        source: 'custom',
        unit: body.isLiquid ? 'ml' : 'g',
        createdBy: request.user.sub,
      })
      .returning()
    return reply.code(201).send(created)
  })

  app.get('/:id', async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    const [food] = await db.select().from(foods).where(eq(foods.id, id)).limit(1)
    if (!food) return reply.code(404).send({ error: 'not_found' })

    // First view of an OFF product also pulls in its label shots.
    await syncOffImages(food)

    const [fav] = await db
      .select({ foodId: favorites.foodId })
      .from(favorites)
      .where(
        and(
          eq(favorites.userId, request.user.sub),
          eq(favorites.foodId, id),
        ),
      )
      .limit(1)

    return {
      ...food,
      isFavorite: Boolean(fav),
      images: await listFoodImages(id, request.user.sub),
      imageUploadEnabled: r2Enabled(),
    }
  })

  app.put('/:id/favorite', async (request) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    await db
      .insert(favorites)
      .values({ userId: request.user.sub, foodId: id })
      .onConflictDoNothing()
    return { isFavorite: true }
  })

  app.delete('/:id/favorite', async (request) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    await db
      .delete(favorites)
      .where(
        and(eq(favorites.userId, request.user.sub), eq(favorites.foodId, id)),
      )
    return { isFavorite: false }
  })
}
