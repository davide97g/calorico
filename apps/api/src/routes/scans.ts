import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { getFamilyIds } from '../lib/family.js'
import { rankedScans } from '../lib/history.js'

const listQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  /** Offset and not a timestamp cursor: the order is a score, not a clock. */
  offset: z.coerce.number().int().min(0).default(0),
  /** Free-text filter on the scanned name. */
  q: z.string().trim().max(120).optional(),
})

export const scanRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', app.authenticate)

  /**
   * One row per distinct item rather than per scan, ranked by the frequency and
   * recency of its scans — see lib/history.ts. Scanning the same yoghurt every
   * week should keep it at the top of the history, not spread it over six weeks
   * of day headings.
   */
  app.get('/', async (request) => {
    const { limit, offset, q } = listQuery.parse(request.query)
    const userId = request.user.sub
    const familyIds = await getFamilyIds(userId)

    const rows = await rankedScans(userId, familyIds, {
      limit: limit + 1,
      offset,
      term: q || undefined,
    })

    const hasMore = rows.length > limit
    const items = hasMore ? rows.slice(0, limit) : rows

    return {
      items,
      nextOffset: hasMore ? offset + limit : null,
    }
  })
}
