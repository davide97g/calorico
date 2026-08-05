import type { FastifyPluginAsync } from 'fastify'
import { and, desc, eq, sql as raw } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db/index.js'
import { diaryEntries, favorites, foods, type NewFood } from '../db/schema.js'
import { fetchByBarcode, searchOff } from '../lib/off.js'

const searchQuery = z.object({
  q: z.string().min(1).max(120),
  limit: z.coerce.number().int().min(1).max(50).default(25),
  /** Skip the network call — used by the barcode screen and by tests. */
  local: z.coerce.boolean().default(false),
})

const customFood = z.object({
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

/**
 * Upserts imported/searched products. Barcode is the natural key; rows without
 * one (rare, from free-text search) are inserted as-is.
 */
async function cacheFoods(rows: NewFood[]) {
  if (rows.length === 0) return []
  const withBarcode = rows.filter((r) => r.barcode)
  const withoutBarcode = rows.filter((r) => !r.barcode)
  const saved = []

  if (withBarcode.length > 0) {
    saved.push(
      ...(await db
        .insert(foods)
        .values(withBarcode)
        .onConflictDoUpdate({
          target: foods.barcode,
          // Matches the partial unique index in the schema.
          targetWhere: raw`${foods.barcode} is not null`,
          set: {
            name: raw`excluded.name`,
            brand: raw`excluded.brand`,
            imageUrl: raw`excluded.image_url`,
            kcal100: raw`excluded.kcal_100`,
            protein100: raw`excluded.protein_100`,
            carbs100: raw`excluded.carbs_100`,
            fat100: raw`excluded.fat_100`,
            sugars100: raw`excluded.sugars_100`,
            satFat100: raw`excluded.sat_fat_100`,
            fiber100: raw`excluded.fiber_100`,
            salt100: raw`excluded.salt_100`,
            servingSizeG: raw`excluded.serving_size_g`,
            servingLabel: raw`excluded.serving_label`,
            updatedAt: new Date(),
          },
        })
        .returning()),
    )
  }
  if (withoutBarcode.length > 0) {
    saved.push(...(await db.insert(foods).values(withoutBarcode).returning()))
  }
  return saved
}

export const foodRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', app.authenticate)

  /**
   * Ranking: exact prefix first, then trigram similarity on "brand + name",
   * with generic (composition-table) foods nudged up — when someone types
   * "pollo" they almost always mean the raw cut, not a ready meal.
   */
  app.get('/search', async (request) => {
    const { q, limit, local } = searchQuery.parse(request.query)
    const term = q.trim()

    const like = `%${term}%`
    const nameKey = raw`unaccent(lower(${foods.name}))`
    const brandKey = raw`unaccent(lower(coalesce(${foods.brand}, '')))`

    const runLocal = async () => {
      /**
       * OFF holds the same product under several barcodes, with the brand
       * spelled differently each time ("Ferrero", "Nutella", "FerreroNutella"),
       * so "nutella" alone returns a dozen identical rows. Collapse on
       * name + energy — same name and same kcal is the same food in practice —
       * and keep the most useful copy: branded, with a photo and a serving
       * size, most recently imported.
       */
      const deduped = db
        .selectDistinctOn([nameKey, raw`round(${foods.kcal100})`])
        .from(foods)
        .where(
          raw`(
            ${nameKey} like unaccent(lower(${like}))
            or ${brandKey} like unaccent(lower(${like}))
            or similarity(${foods.name}, ${term}) > 0.22
          )`,
        )
        .orderBy(
          raw`${nameKey}, round(${foods.kcal100}),
            (${foods.brand} is null),
            (${foods.imageUrl} is null),
            (${foods.servingSizeG} is null),
            ${foods.updatedAt} desc`,
        )
        .as('deduped')

      return db
        .select()
        .from(deduped)
        .orderBy(
          raw`
            (case when unaccent(lower(${deduped.name})) like unaccent(lower(${term + '%'})) then 0 else 1 end),
            (case when ${deduped.source} = 'generic' then 0 else 1 end),
            greatest(
              similarity(${deduped.name}, ${term}),
              similarity(coalesce(${deduped.brand}, ''), ${term})
            ) desc,
            length(${deduped.name}) asc
          `,
        )
        .limit(limit)
    }

    let results = await runLocal()

    // Thin local mirror? Ask Open Food Facts once, cache, then re-query so the
    // ranking rules apply to the newcomers too.
    if (!local && results.length < 8) {
      try {
        const remote = await searchOff(term, limit)
        if (remote.length > 0) {
          await cacheFoods(remote)
          results = await runLocal()
        }
      } catch (err) {
        request.log.warn({ err }, 'OFF search failed, serving local results')
      }
    }

    return { items: results, source: results.length ? 'db' : 'empty' }
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
