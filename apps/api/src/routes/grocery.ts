import type { FastifyPluginAsync } from 'fastify'
import { and, asc, desc, eq, ne, sql } from 'drizzle-orm'
import { z } from 'zod'
import { idParam } from '@calorico/contracts'
import { db } from '../db/index.js'
import { foods, groceryItems, users } from '../db/schema.js'
import {
  getFamilyIds,
  groceryVisibility,
  resolveWriteFamilyId,
} from '../lib/family.js'
import { grocerySuggestions } from '../lib/history.js'

const quantity = z.number().int().min(1).max(999)

const createBody = z
  .object({
    foodId: z.string().uuid().optional(),
    name: z.string().trim().min(1).max(160).optional(),
    quantity: quantity.default(1),
  })
  .refine((body) => Boolean(body.foodId) !== Boolean(body.name), {
    message: 'Provide either foodId or name',
  })

const suggestionsQuery = z.object({
  q: z.string().trim().min(1).max(160),
  limit: z.coerce.number().int().min(1).max(20).default(5),
})

const patchBody = z
  .object({
    quantity: quantity.optional(),
    completed: z.boolean().optional(),
  })
  .refine((body) => body.quantity !== undefined || body.completed !== undefined, {
    message: 'No changes supplied',
  })

function normaliseName(name: string) {
  return name.normalize('NFKC').trim().replace(/\s+/g, ' ')
}

export const groceryRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', app.authenticate)

  app.get('/', async (request) => {
    const userId = request.user.sub
    const familyIds = await getFamilyIds(userId)

    const items = await db
      .select({
        id: groceryItems.id,
        userId: groceryItems.userId,
        familyId: groceryItems.familyId,
        foodId: groceryItems.foodId,
        dedupeKey: groceryItems.dedupeKey,
        nameSnapshot: groceryItems.nameSnapshot,
        brandSnapshot: groceryItems.brandSnapshot,
        quantity: groceryItems.quantity,
        completed: groceryItems.completed,
        completedAt: groceryItems.completedAt,
        createdAt: groceryItems.createdAt,
        updatedAt: groceryItems.updatedAt,
        addedBy: {
          id: users.id,
          name: users.name,
          avatarUrl: users.avatarUrl,
        },
      })
      .from(groceryItems)
      .innerJoin(users, eq(users.id, groceryItems.userId))
      .where(groceryVisibility(userId, familyIds))
      .orderBy(
        asc(groceryItems.completed),
        desc(
          sql`case when ${groceryItems.completed} then ${groceryItems.completedAt} else ${groceryItems.createdAt} end`,
        ),
      )

    return { items }
  })

  /**
   * What the list has held before, matched against what is being typed. The
   * catalogue search answers "what is this product"; this answers "what do we
   * usually buy", which is the question a shopping list is actually asked.
   */
  app.get('/suggestions', async (request) => {
    const { q, limit } = suggestionsQuery.parse(request.query)
    const userId = request.user.sub
    const familyIds = await getFamilyIds(userId)

    return {
      items: await grocerySuggestions(userId, familyIds, {
        term: normaliseName(q),
        limit,
      }),
    }
  })

  app.post('/', async (request, reply) => {
    const body = createBody.parse(request.body)
    const userId = request.user.sub
    let foodId: string | null = null
    let name: string
    let brand: string | null = null
    let dedupeKey: string

    if (body.foodId) {
      const [food] = await db
        .select()
        .from(foods)
        .where(eq(foods.id, body.foodId))
        .limit(1)
      if (!food) return reply.code(404).send({ error: 'food_not_found' })
      foodId = food.id
      name = food.name
      brand = food.brand
      dedupeKey = `food:${food.id}`
    } else {
      name = normaliseName(body.name!)
      dedupeKey = `text:${name.toLocaleLowerCase('it-IT')}`
    }

    const [item] = await db
      .insert(groceryItems)
      .values({
        userId,
        familyId: await resolveWriteFamilyId(userId),
        foodId,
        dedupeKey,
        nameSnapshot: name,
        brandSnapshot: brand,
        quantity: body.quantity,
      })
      .onConflictDoUpdate({
        // `listId` is generated from familyId/userId, so this merges into
        // whichever list the row belongs to — private or shared.
        target: [groceryItems.listId, groceryItems.dedupeKey],
        targetWhere: sql`${groceryItems.completed} = false`,
        set: {
          quantity: sql`least(999, ${groceryItems.quantity} + excluded.quantity)`,
          updatedAt: new Date(),
        },
      })
      .returning()

    return reply.code(201).send(item)
  })

  app.patch('/:id', async (request, reply) => {
    const { id } = idParam.parse(request.params)
    const body = patchBody.parse(request.body)
    const userId = request.user.sub
    const familyIds = await getFamilyIds(userId)
    // Members are all equal: anyone in the family may tick off or edit any row.
    const visible = groceryVisibility(userId, familyIds)

    const result = await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(groceryItems)
        .where(and(eq(groceryItems.id, id), visible))
        .limit(1)
      if (!existing) return null

      // Restoring an older completed row must preserve the one-active-row rule.
      if (body.completed === false && existing.completed) {
        const [active] = await tx
          .select()
          .from(groceryItems)
          .where(
            and(
              eq(groceryItems.listId, existing.listId!),
              eq(groceryItems.dedupeKey, existing.dedupeKey),
              eq(groceryItems.completed, false),
              ne(groceryItems.id, id),
            ),
          )
          .limit(1)

        if (active) {
          const [merged] = await tx
            .update(groceryItems)
            .set({
              quantity: Math.min(999, active.quantity + existing.quantity),
              updatedAt: new Date(),
            })
            .where(eq(groceryItems.id, active.id))
            .returning()
          await tx.delete(groceryItems).where(eq(groceryItems.id, existing.id))
          return merged
        }
      }

      const nextCompleted = body.completed ?? existing.completed
      const [updated] = await tx
        .update(groceryItems)
        .set({
          ...(body.quantity !== undefined ? { quantity: body.quantity } : {}),
          ...(body.completed !== undefined
            ? {
                completed: body.completed,
                completedAt: body.completed ? new Date() : null,
              }
            : {}),
          updatedAt: new Date(),
        })
        .where(eq(groceryItems.id, existing.id))
        .returning()

      return { ...updated, completed: nextCompleted }
    })

    if (!result) return reply.code(404).send({ error: 'not_found' })
    return result
  })

  app.delete('/:id', async (request, reply) => {
    const { id } = idParam.parse(request.params)
    const userId = request.user.sub
    const familyIds = await getFamilyIds(userId)

    const deleted = await db
      .delete(groceryItems)
      .where(and(eq(groceryItems.id, id), groceryVisibility(userId, familyIds)))
      .returning({ id: groceryItems.id })

    if (deleted.length === 0) return reply.code(404).send({ error: 'not_found' })
    return reply.code(204).send()
  })
}
