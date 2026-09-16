import type { FastifyPluginAsync } from 'fastify'
import { and, desc, eq } from 'drizzle-orm'
import {
  idParam,
  pantryPatchInput,
  pantryStockInput,
} from '@calorico/contracts'
import { db } from '../db/index.js'
import { foods, pantryItems, users } from '../db/schema.js'
import { getFamilyIds } from '../lib/family.js'
import {
  pantryVisibility,
  stockOf,
  stockPantryItem,
  toPantryPayload,
  writeStock,
} from '../lib/pantry.js'
import { env } from '../env.js'

/**
 * The cupboard. Only foods can be in it — see lib/pantry.ts for why nothing
 * here is ever created implicitly, and for the arithmetic that turns a diary
 * entry into a shopping row.
 */
export const pantryRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', app.authenticate)

  app.get('/', async (request) => {
    const userId = request.user.sub
    const familyIds = await getFamilyIds(userId)

    const rows = await db
      .select({
        id: pantryItems.id,
        userId: pantryItems.userId,
        familyId: pantryItems.familyId,
        foodId: pantryItems.foodId,
        sealedPackages: pantryItems.sealedPackages,
        remainingG: pantryItems.remainingG,
        packageSizeG: pantryItems.packageSizeG,
        lowNotifiedAt: pantryItems.lowNotifiedAt,
        createdAt: pantryItems.createdAt,
        updatedAt: pantryItems.updatedAt,
        name: foods.name,
        brand: foods.brand,
        imageUrl: foods.imageUrl,
        stockedBy: {
          id: users.id,
          name: users.name,
          avatarUrl: users.avatarUrl,
        },
      })
      .from(pantryItems)
      .innerJoin(foods, eq(foods.id, pantryItems.foodId))
      .innerJoin(users, eq(users.id, pantryItems.userId))
      .where(pantryVisibility(userId, familyIds))
      // What is nearly gone is the reason to open this screen at all.
      .orderBy(
        desc(pantryItems.lowNotifiedAt),
        desc(pantryItems.updatedAt),
      )

    return {
      items: rows.map(toPantryPayload),
      lowFraction: env.PANTRY_LOW_FRACTION,
    }
  })

  app.post('/', async (request, reply) => {
    const body = pantryStockInput.parse(request.body)
    const result = await stockPantryItem(db, request.user.sub, body)
    if (!result.ok) {
      // `package_size_required` is not a validation failure: the request was
      // well formed and the catalogue simply has no weight for this product,
      // which the client answers by asking the user for one.
      const status = result.error === 'food_not_found' ? 404 : 422
      return reply.code(status).send({ error: result.error })
    }
    return reply.code(201).send({ ok: true })
  })

  /**
   * Correcting the cupboard by hand: the jar thrown away half full, the pack
   * someone opened without logging a bite. Zero on both counts is how "it's
   * finished" is said, and it puts the product on the list like running it down
   * would have.
   */
  app.patch('/:id', async (request, reply) => {
    const { id } = idParam.parse(request.params)
    const body = pantryPatchInput.parse(request.body)
    const userId = request.user.sub
    const familyIds = await getFamilyIds(userId)

    const updated = await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(pantryItems)
        .where(
          and(eq(pantryItems.id, id), pantryVisibility(userId, familyIds)),
        )
        .limit(1)
      if (!existing) return null

      await writeStock(tx, existing, stockOf(existing, body))

      const [row] = await tx
        .select()
        .from(pantryItems)
        .where(eq(pantryItems.id, id))
        .limit(1)
      return row ?? null
    })

    if (!updated) return reply.code(404).send({ error: 'not_found' })
    return toPantryPayload(updated)
  })

  /** Stops tracking the product. The shopping list keeps whatever it holds. */
  app.delete('/:id', async (request, reply) => {
    const { id } = idParam.parse(request.params)
    const userId = request.user.sub
    const familyIds = await getFamilyIds(userId)

    const deleted = await db
      .delete(pantryItems)
      .where(and(eq(pantryItems.id, id), pantryVisibility(userId, familyIds)))
      .returning({ id: pantryItems.id })

    if (deleted.length === 0) return reply.code(404).send({ error: 'not_found' })
    return reply.code(204).send()
  })
}
