import type { FastifyPluginAsync } from 'fastify'
import { and, desc, eq, inArray, isNull, lt, or } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db/index.js'
import { scanEvents, users } from '../db/schema.js'
import { getFamilyIds } from '../lib/family.js'

const listQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  /** Cursor: the createdAt of the last row already shown. */
  before: z.string().datetime().optional(),
})

export const scanRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', app.authenticate)

  app.get('/', async (request) => {
    const { limit, before } = listQuery.parse(request.query)
    const userId = request.user.sub
    const familyIds = await getFamilyIds(userId)

    const own = and(isNull(scanEvents.familyId), eq(scanEvents.userId, userId))!
    const visible =
      familyIds.length === 0
        ? own
        : or(inArray(scanEvents.familyId, familyIds), own)!

    const rows = await db
      .select({
        id: scanEvents.id,
        kind: scanEvents.kind,
        foodId: scanEvents.foodId,
        barcode: scanEvents.barcode,
        nameSnapshot: scanEvents.nameSnapshot,
        brandSnapshot: scanEvents.brandSnapshot,
        items: scanEvents.items,
        familyId: scanEvents.familyId,
        createdAt: scanEvents.createdAt,
        scannedBy: {
          id: users.id,
          name: users.name,
          avatarUrl: users.avatarUrl,
        },
      })
      .from(scanEvents)
      .innerJoin(users, eq(users.id, scanEvents.userId))
      .where(
        before
          ? and(visible, lt(scanEvents.createdAt, new Date(before)))!
          : visible,
      )
      .orderBy(desc(scanEvents.createdAt))
      .limit(limit + 1)

    const hasMore = rows.length > limit
    const items = hasMore ? rows.slice(0, limit) : rows

    return {
      items,
      nextCursor: hasMore ? items.at(-1)!.createdAt.toISOString() : null,
    }
  })
}
