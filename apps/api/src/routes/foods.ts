import type { FastifyPluginAsync } from 'fastify'
import { and, desc, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db/index.js'
import { favorites, foods, type Food, type NewFood } from '../db/schema.js'
import { fetchByBarcode, searchOff } from '../lib/off.js'
import { recordScan } from '../lib/scan-log.js'
import { cacheFoods } from '../lib/food-cache.js'
import { rankedDiaryFoods } from '../lib/history.js'
import {
  hasConfidentGenericMatch,
  searchLocalFoods,
} from '../lib/food-search.js'

const searchQuery = z.object({
  q: z.string().min(1).max(120),
  limit: z.coerce.number().int().min(1).max(50).default(25),
  /** Skip the network call — used by the barcode screen and by tests. */
  local: z.coerce.boolean().default(false),
})

const recentQuery = z.object({
  /** The meal being logged, which the ranking weights towards. */
  meal: z.enum(['breakfast', 'lunch', 'dinner', 'snack']).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(30),
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
    // ranking rules apply to the newcomers too. Unless the catalogue already
    // has the plain food that was asked for — see hasConfidentGenericMatch.
    if (!local && results.length < 8 && !hasConfidentGenericMatch(results, term)) {
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

    // `score` is a ranking detail and `aliases` are search fodder: neither is
    // shown, and a generic food carries up to eight of the latter.
    const items = results.map(
      ({ score: _score, aliases: _aliases, ...food }) => food,
    )
    return { items, source: items.length ? 'db' : 'empty' }
  })

  app.get('/barcode/:code', async (request, reply) => {
    const { code } = z
      .object({ code: z.string().regex(/^\d{6,14}$/) })
      .parse(request.params)

    // A GET with a side effect, deliberately: this route is only ever reached
    // from the scanner sheets, so it is the one honest place to record that a
    // scan happened. Logging is best-effort and never fails the lookup.
    const logScan = (food: Food) =>
      recordScan(
        request.user.sub,
        {
          kind: 'barcode',
          foodId: food.id,
          barcode: code,
          nameSnapshot: food.name,
          brandSnapshot: food.brand,
        },
        request.log,
      )

    const [local] = await db
      .select()
      .from(foods)
      .where(eq(foods.barcode, code))
      .limit(1)
    if (local) {
      await logScan(local)
      return local
    }

    let mapped: NewFood | null = null
    try {
      mapped = await fetchByBarcode(code)
    } catch (err) {
      request.log.warn({ err, code }, 'OFF barcode lookup failed')
      return reply.code(502).send({ error: 'off_unavailable' })
    }
    if (!mapped) return reply.code(404).send({ error: 'product_not_found' })

    const [saved] = await cacheFoods([mapped])
    if (saved) await logScan(saved)
    return saved
  })

  /**
   * The warm path: foods this user already logs, each carrying the portion they
   * use, so the client can write a whole entry from one tap.
   *
   * Ordered by how well remembered a food is, not by when it was last touched —
   * plain recency buries the daily yogurt under one-off entries within a week.
   * Pass `meal` and the meal being logged is weighted up. See lib/history.ts.
   */
  app.get('/recent', async (request) => {
    const { meal, limit } = recentQuery.parse(request.query)
    const ranked = await rankedDiaryFoods(request.user.sub, { limit, meal })
    if (ranked.length === 0) return { items: [] }

    const rows = await db
      .select()
      .from(foods)
      .where(
        inArray(
          foods.id,
          ranked.map((r) => r.foodId),
        ),
      )
    const byId = new Map(rows.map((food) => [food.id, food]))

    return {
      items: ranked.flatMap((r) => {
        const row = byId.get(r.foodId)
        if (!row) return []
        // `aliases` are search fodder, as in /search: eight strings per food is
        // real weight on the screen that opens most often.
        const { aliases: _aliases, ...food } = row
        return [
          {
            ...food,
            lastQuantityG: r.lastQuantityG,
            topQuantities: r.topQuantities,
            times: r.times,
            lastAt: r.lastAt,
          },
        ]
      }),
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

    // No photos here. This route is on the path of every re-log, and fetching a
    // product's label shots from Open Food Facts on the way is a network round
    // trip between the user's tap and their portion field. The gallery asks
    // GET /:id/images for itself, which syncs there instead.
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

    return { ...food, isFavorite: Boolean(fav) }
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
