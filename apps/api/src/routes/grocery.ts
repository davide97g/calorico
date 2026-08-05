import type { FastifyPluginAsync } from 'fastify'
import { and, asc, desc, eq, ne, sql } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db/index.js'
import { foods, groceryItems } from '../db/schema.js'

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
    const items = await db
      .select()
      .from(groceryItems)
      .where(eq(groceryItems.userId, request.user.sub))
      .orderBy(
        asc(groceryItems.completed),
        desc(
          sql`case when ${groceryItems.completed} then ${groceryItems.completedAt} else ${groceryItems.createdAt} end`,
        ),
      )

    return { items }
  })

  app.post('/', async (request, reply) => {
    const body = createBody.parse(request.body)
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
        userId: request.user.sub,
        foodId,
        dedupeKey,
        nameSnapshot: name,
        brandSnapshot: brand,
        quantity: body.quantity,
      })
      .onConflictDoUpdate({
        target: [groceryItems.userId, groceryItems.dedupeKey],
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
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    const body = patchBody.parse(request.body)
    const userId = request.user.sub

    const result = await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(groceryItems)
        .where(and(eq(groceryItems.id, id), eq(groceryItems.userId, userId)))
        .limit(1)
      if (!existing) return null

      // Restoring an older completed row must preserve the one-active-row rule.
      if (body.completed === false && existing.completed) {
        const [active] = await tx
          .select()
          .from(groceryItems)
          .where(
            and(
              eq(groceryItems.userId, userId),
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
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    const deleted = await db
      .delete(groceryItems)
      .where(
        and(
          eq(groceryItems.id, id),
          eq(groceryItems.userId, request.user.sub),
        ),
      )
      .returning({ id: groceryItems.id })

    if (deleted.length === 0) return reply.code(404).send({ error: 'not_found' })
    return reply.code(204).send()
  })
}
