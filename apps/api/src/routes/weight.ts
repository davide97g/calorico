import type { FastifyPluginAsync } from 'fastify'
import { and, asc, desc, eq, gte, lte } from 'drizzle-orm'
import { z } from 'zod'
import { dayString } from '@calorico/contracts'
import { db } from '../db/index.js'
import { profiles, weightLogs } from '../db/schema.js'

const upsertBody = z.object({
  day: dayString,
  weightKg: z.number().min(25).max(400),
  bodyFatPct: z.number().min(2).max(70).optional(),
  note: z.string().max(200).optional(),
})

export const weightRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', app.authenticate)

  app.get('/', async (request) => {
    const { from, to } = z
      .object({ from: dayString.optional(), to: dayString.optional() })
      .parse(request.query)
    const userId = request.user.sub

    const rows = await db
      .select()
      .from(weightLogs)
      .where(
        and(
          eq(weightLogs.userId, userId),
          ...(from ? [gte(weightLogs.day, from)] : []),
          ...(to ? [lte(weightLogs.day, to)] : []),
        ),
      )
      .orderBy(asc(weightLogs.day))
      .limit(400)

    const [profile] = await db
      .select({
        startWeightKg: profiles.startWeightKg,
        targetWeightKg: profiles.targetWeightKg,
        heightCm: profiles.heightCm,
      })
      .from(profiles)
      .where(eq(profiles.userId, userId))
      .limit(1)

    const latest = rows.at(-1) ?? null
    const first = rows[0] ?? null
    const bmi =
      latest && profile?.heightCm
        ? Math.round(
            (latest.weightKg / (profile.heightCm / 100) ** 2) * 10,
          ) / 10
        : null

    return {
      items: rows,
      latest,
      /** Change over the queried window, not since account creation. */
      changeKg:
        latest && first
          ? Math.round((latest.weightKg - first.weightKg) * 10) / 10
          : 0,
      startWeightKg: profile?.startWeightKg ?? null,
      targetWeightKg: profile?.targetWeightKg ?? null,
      bmi,
    }
  })

  app.put('/', async (request) => {
    const body = upsertBody.parse(request.body)
    const [row] = await db
      .insert(weightLogs)
      .values({ userId: request.user.sub, ...body })
      .onConflictDoUpdate({
        target: [weightLogs.userId, weightLogs.day],
        set: {
          weightKg: body.weightKg,
          bodyFatPct: body.bodyFatPct ?? null,
          note: body.note ?? null,
        },
      })
      .returning()
    return row
  })

  app.delete('/:day', async (request, reply) => {
    const { day: theDay } = z.object({ day: dayString }).parse(request.params)
    const deleted = await db
      .delete(weightLogs)
      .where(
        and(
          eq(weightLogs.userId, request.user.sub),
          eq(weightLogs.day, theDay),
        ),
      )
      .returning({ id: weightLogs.id })
    if (deleted.length === 0) return reply.code(404).send({ error: 'not_found' })
    return reply.code(204).send()
  })

  app.get('/latest', async (request) => {
    const [row] = await db
      .select()
      .from(weightLogs)
      .where(eq(weightLogs.userId, request.user.sub))
      .orderBy(desc(weightLogs.day))
      .limit(1)
    return row ?? null
  })
}
