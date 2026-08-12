import type { FastifyPluginAsync } from 'fastify'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db/index.js'
import { foods } from '../db/schema.js'
import { isFoodVisibleTo } from '../lib/food-visibility.js'
import { listFoodImages, syncOffImages } from '../lib/food-images.js'

const foodParam = z.object({ id: z.string().uuid() })

/**
 * Photos of a food, all of them from Open Food Facts. Mounted under /api/foods,
 * alongside foodRoutes.
 *
 * There is no upload path: users used to be able to attach their own shots,
 * hosted on R2, and that feature was removed along with the bucket.
 */
export const foodImageRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', app.authenticate)

  app.get('/:id/images', async (request, reply) => {
    const { id } = foodParam.parse(request.params)
    const [food] = await db.select().from(foods).where(eq(foods.id, id)).limit(1)
    if (!food || !isFoodVisibleTo(food, request.user.sub)) {
      return reply.code(404).send({ error: 'food_not_found' })
    }

    // Entry pages reach the gallery without loading the food first.
    await syncOffImages(food)

    return { items: await listFoodImages(id) }
  })
}
