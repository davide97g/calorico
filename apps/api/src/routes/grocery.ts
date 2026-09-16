import type { FastifyPluginAsync } from 'fastify'
import { and, asc, desc, eq, ne, sql } from 'drizzle-orm'
import { z } from 'zod'
import { groceryCategory, groceryUnit, idParam } from '@calorico/contracts'
import { adminDb, db } from '../db/index.js'
import { foods, groceryItems, users } from '../db/schema.js'
import {
  getFamilyIds,
  groceryVisibility,
  resolveWriteFamilyId,
} from '../lib/family.js'
import { grocerySuggestions } from '../lib/history.js'
import { restockFromGrocery } from '../lib/pantry.js'
import {
  IMAGE_CONTENT_TYPES,
  decodedBytes,
  deleteObject,
  getObject,
  groceryImageKey,
  putObject,
  signImagePath,
  storageEnabled,
  verifyImageSignature,
} from '../lib/storage.js'
import { env } from '../env.js'

const quantity = z.number().int().min(1).max(999)

const createBody = z
  .object({
    foodId: z.string().uuid().optional(),
    name: z.string().trim().min(1).max(160).optional(),
    quantity: quantity.default(1),
    unit: groceryUnit.default('pz'),
    /**
     * Optional because the sensible aisle depends on which half of the body
     * arrived, and the handler knows that better than the client does: a row
     * with a foodId is something edible by definition.
     */
    category: groceryCategory.optional(),
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
    unit: groceryUnit.optional(),
    category: groceryCategory.optional(),
  })
  .refine((body) => Object.values(body).some((v) => v !== undefined), {
    message: 'No changes supplied',
  })

const imageBody = z.object({
  /** Raw base64, no data-URI prefix — the client strips it. */
  image: z.string().min(32),
  contentType: z.string().max(60),
})

const signedQuery = z.object({ exp: z.string(), sig: z.string() })

/**
 * Sized so the byte check in the handler is what rejects an oversized photo,
 * not Fastify's body limit: base64 inflates by 4/3, so a limit set to the image
 * size would always trip first and answer with a generic message instead of
 * `image_too_large`. Same arrangement as the vision route.
 */
const IMAGE_BODY_LIMIT =
  Math.ceil((env.storage?.maxImageBytes ?? 512 * 1024) * (4 / 3)) + 4096

function normaliseName(name: string) {
  return name.normalize('NFKC').trim().replace(/\s+/g, ' ')
}

/**
 * The object key never leaves the server: it is an address in a bucket nobody
 * else can reach, and it would be useless to a client anyway. What goes out is
 * a link the browser can actually fetch, signed and short-lived.
 */
function toItem<T extends { id: string; imageKey: string | null }>(row: T) {
  const { imageKey, ...item } = row
  return { ...item, imagePath: imageKey ? signImagePath(row.id) : null }
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
        unit: groceryItems.unit,
        category: groceryItems.category,
        source: groceryItems.source,
        imageKey: groceryItems.imageKey,
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
        // Within a list the aisle order is what a trolley follows; the picker
        // filling a pickup order walks it the same way.
        asc(groceryItems.category),
        desc(
          sql`case when ${groceryItems.completed} then ${groceryItems.completedAt} else ${groceryItems.createdAt} end`,
        ),
      )

    return { items: items.map(toItem), imagesEnabled: storageEnabled() }
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
        unit: body.unit,
        // A row that names a catalogue food is food; anything else is a guess,
        // and `other` is the guess that never puts a descaler in with the pasta.
        category: body.category ?? (foodId ? 'food' : 'other'),
      })
      .onConflictDoUpdate({
        // `listId` is generated from familyId/userId, so this merges into
        // whichever list the row belongs to — private or shared.
        target: [groceryItems.listId, groceryItems.dedupeKey],
        targetWhere: sql`${groceryItems.completed} = false`,
        set: {
          quantity: sql`least(999, ${groceryItems.quantity} + excluded.quantity)`,
          unit: sql`excluded.unit`,
          category: sql`excluded.category`,
          updatedAt: new Date(),
        },
      })
      .returning()

    return reply.code(201).send(toItem(item!))
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

      // Ticking a tracked product off is the household saying it bought it, so
      // the cupboard fills back up. Untick and it empties again: the toast
      // offers "Annulla", and an undo that left a phantom jar behind would make
      // the automatic row that follows look like a bug.
      if (body.completed !== undefined && body.completed !== existing.completed) {
        await restockFromGrocery(tx, userId, {
          foodId: existing.foodId,
          quantity: body.completed ? existing.quantity : -existing.quantity,
          unit: existing.unit,
        })
      }

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
          ...(body.unit !== undefined ? { unit: body.unit } : {}),
          ...(body.category !== undefined ? { category: body.category } : {}),
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

      return updated ? { ...updated, completed: nextCompleted } : null
    })

    if (!result) return reply.code(404).send({ error: 'not_found' })
    return toItem(result)
  })

  app.delete('/:id', async (request, reply) => {
    const { id } = idParam.parse(request.params)
    const userId = request.user.sub
    const familyIds = await getFamilyIds(userId)

    const deleted = await db
      .delete(groceryItems)
      .where(and(eq(groceryItems.id, id), groceryVisibility(userId, familyIds)))
      .returning({ id: groceryItems.id, imageKey: groceryItems.imageKey })

    const [row] = deleted
    if (!row) return reply.code(404).send({ error: 'not_found' })
    // The row is gone either way; an unreachable bucket must not turn a delete
    // the user has already seen happen into a 500.
    if (row.imageKey) await deleteObject(row.imageKey).catch(() => {})
    return reply.code(204).send()
  })

  /**
   * A photo for the rows a name cannot pin down — the specific descaler, the
   * tap washer of the right size. The client compresses before sending, and the
   * body is base64 in JSON rather than multipart because that is what the photo
   * flow already does and it needs no extra plugin.
   */
  app.post('/:id/image', { bodyLimit: IMAGE_BODY_LIMIT }, async (request, reply) => {
    if (!storageEnabled())
      return reply.code(503).send({ error: 'storage_disabled' })

    const { id } = idParam.parse(request.params)
    const body = imageBody.parse(request.body)
    const userId = request.user.sub
    const familyIds = await getFamilyIds(userId)

    if (!IMAGE_CONTENT_TYPES[body.contentType])
      return reply.code(415).send({ error: 'unsupported_media_type' })
    if (decodedBytes(body.image) > (env.storage?.maxImageBytes ?? 0))
      return reply.code(413).send({ error: 'image_too_large' })

    const [existing] = await db
      .select()
      .from(groceryItems)
      .where(
        and(eq(groceryItems.id, id), groceryVisibility(userId, familyIds)),
      )
      .limit(1)
    if (!existing) return reply.code(404).send({ error: 'not_found' })

    const key = groceryImageKey(id, body.contentType)
    await putObject(key, Buffer.from(body.image, 'base64'), body.contentType)

    const [updated] = await db
      .update(groceryItems)
      .set({ imageKey: key, updatedAt: new Date() })
      .where(eq(groceryItems.id, id))
      .returning()

    // Only once the row points at the new object: an orphan in the bucket is
    // cheap, a row pointing at bytes that are gone is a broken photo.
    if (existing.imageKey) await deleteObject(existing.imageKey).catch(() => {})

    return toItem(updated!)
  })

  app.delete('/:id/image', async (request, reply) => {
    const { id } = idParam.parse(request.params)
    const userId = request.user.sub
    const familyIds = await getFamilyIds(userId)

    const [existing] = await db
      .select({ imageKey: groceryItems.imageKey })
      .from(groceryItems)
      .where(and(eq(groceryItems.id, id), groceryVisibility(userId, familyIds)))
      .limit(1)
    if (!existing) return reply.code(404).send({ error: 'not_found' })

    const [updated] = await db
      .update(groceryItems)
      .set({ imageKey: null, updatedAt: new Date() })
      .where(eq(groceryItems.id, id))
      .returning()

    if (existing.imageKey) await deleteObject(existing.imageKey).catch(() => {})

    return toItem(updated!)
  })
}

/**
 * The bytes of one photo, mounted under the same prefix but outside the
 * authenticated plugin.
 *
 * An `<img>` cannot present a bearer token, so the link carries its own
 * signature instead — the same arrangement the Stripe webhook uses, where a
 * signature rather than a session is what proves the request may proceed. The
 * signature names one row and expires, and the only thing read without a
 * session is that row's object key.
 */
export const groceryImageRoutes: FastifyPluginAsync = async (app) => {
  app.get('/:id/image', async (request, reply) => {
    const { id } = idParam.parse(request.params)
    const { exp, sig } = signedQuery.parse(request.query)
    if (!verifyImageSignature(id, exp, sig))
      return reply.code(403).send({ error: 'invalid_signature' })

    // adminDb because there is no session to enter RLS with. The signature has
    // already authorised this one row, and one column of it is all that is read.
    const [row] = await adminDb
      .select({ imageKey: groceryItems.imageKey })
      .from(groceryItems)
      .where(eq(groceryItems.id, id))
      .limit(1)
    if (!row?.imageKey) return reply.code(404).send({ error: 'not_found' })

    const object = await getObject(row.imageKey)
    if (!object) return reply.code(404).send({ error: 'not_found' })

    // Private: the link is signed and short-lived, so a shared cache holding a
    // copy would outlive the permission that fetched it.
    return reply
      .header('content-type', object.contentType)
      .header('cache-control', `private, max-age=${env.storage?.imageTtlSeconds ?? 3600}`)
      .send(object.body)
  })
}
