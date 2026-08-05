import type { FastifyPluginAsync } from 'fastify'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db/index.js'
import { foodImages, foods } from '../db/schema.js'
import { env } from '../env.js'
import {
  listFoodImages,
  syncOffImages,
  toDto,
  userImageSort,
} from '../lib/food-images.js'
import {
  buildObjectKey,
  deleteObject,
  headObject,
  isOwnedKey,
  MIME_EXTENSIONS,
  publicUrl,
  r2Enabled,
  signUpload,
} from '../lib/r2.js'

/** Enough to hold a packshot, the label and a couple of shelf photos. */
const MAX_USER_IMAGES_PER_FOOD = 8

const foodParam = z.object({ id: z.string().uuid() })
const imageParam = z.object({
  id: z.string().uuid(),
  imageId: z.string().uuid(),
})

const uploadRequest = z.object({
  contentType: z.enum(
    Object.keys(MIME_EXTENSIONS) as [string, ...string[]],
  ),
  bytes: z.number().int().positive(),
})

const registerRequest = z.object({
  key: z.string().min(1).max(200),
  width: z.number().int().positive().max(20000).optional(),
  height: z.number().int().positive().max(20000).optional(),
})

/**
 * Photos attached to a food. Mounted under /api/foods, alongside foodRoutes.
 *
 * Uploads go browser → R2 directly with a presigned PUT; this API only signs,
 * verifies and records. The browser is expected to have already resized and
 * re-encoded the photo, and `R2_MAX_UPLOAD_BYTES` is the backstop for clients
 * that did not.
 */
export const foodImageRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', app.authenticate)

  app.get('/:id/images', async (request, reply) => {
    const { id } = foodParam.parse(request.params)
    const [food] = await db.select().from(foods).where(eq(foods.id, id)).limit(1)
    if (!food) return reply.code(404).send({ error: 'food_not_found' })

    // Entry pages reach the gallery without loading the food first.
    await syncOffImages(food)

    return {
      items: await listFoodImages(id, request.user.sub),
      // Without a bucket configured the UI hides its camera button.
      uploadEnabled: r2Enabled(),
    }
  })

  app.post('/:id/images/upload-url', async (request, reply) => {
    if (!r2Enabled()) return reply.code(503).send({ error: 'uploads_disabled' })

    const { id } = foodParam.parse(request.params)
    const { contentType, bytes } = uploadRequest.parse(request.body)

    const max = env.r2?.maxUploadBytes ?? 0
    if (bytes > max) {
      return reply.code(413).send({ error: 'image_too_large', max })
    }

    const [food] = await db
      .select({ id: foods.id })
      .from(foods)
      .where(eq(foods.id, id))
      .limit(1)
    if (!food) return reply.code(404).send({ error: 'food_not_found' })

    const mine = await db
      .select({ id: foodImages.id })
      .from(foodImages)
      .where(
        and(
          eq(foodImages.foodId, id),
          eq(foodImages.userId, request.user.sub),
        ),
      )
    if (mine.length >= MAX_USER_IMAGES_PER_FOOD) {
      return reply.code(409).send({ error: 'too_many_images' })
    }

    const key = buildObjectKey(id, request.user.sub, contentType)
    const signed = await signUpload(key, contentType)
    return { key, ...signed }
  })

  app.post('/:id/images', async (request, reply) => {
    if (!r2Enabled()) return reply.code(503).send({ error: 'uploads_disabled' })

    const { id } = foodParam.parse(request.params)
    const { key, width, height } = registerRequest.parse(request.body)

    // The key was minted by us for this user and this food, or it is not theirs.
    if (!isOwnedKey(key, id, request.user.sub)) {
      return reply.code(403).send({ error: 'forbidden' })
    }

    const object = await headObject(key)
    if (!object) return reply.code(404).send({ error: 'upload_not_found' })
    if (object.bytes > (env.r2?.maxUploadBytes ?? 0)) {
      await deleteObject(key)
      return reply.code(413).send({ error: 'image_too_large' })
    }

    const [created] = await db
      .insert(foodImages)
      .values({
        foodId: id,
        userId: request.user.sub,
        kind: 'user',
        url: publicUrl(key),
        storageKey: key,
        width: width ?? null,
        height: height ?? null,
        bytes: object.bytes,
        sort: userImageSort,
      })
      .returning()

    return reply.code(201).send(toDto(created!, request.user.sub))
  })

  app.delete('/:id/images/:imageId', async (request, reply) => {
    const { id, imageId } = imageParam.parse(request.params)

    const [image] = await db
      .select()
      .from(foodImages)
      .where(
        and(
          eq(foodImages.id, imageId),
          eq(foodImages.foodId, id),
          // Only your own photos: product shots are shared, not yours to remove.
          eq(foodImages.userId, request.user.sub),
        ),
      )
      .limit(1)
    if (!image) return reply.code(404).send({ error: 'image_not_found' })

    if (image.storageKey) {
      try {
        await deleteObject(image.storageKey)
      } catch (err) {
        // Losing the row matters more than an orphaned object in the bucket.
        request.log.warn({ err, key: image.storageKey }, 'R2 delete failed')
      }
    }
    await db.delete(foodImages).where(eq(foodImages.id, imageId))

    return reply.code(204).send()
  })
}
