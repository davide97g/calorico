import type { FastifyPluginAsync } from 'fastify'
import { sql as raw } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db/index.js'
import { profiles } from '../db/schema.js'
import { eq } from 'drizzle-orm'

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

const rangeQuery = z.object({
  from: day,
  to: day,
})

type DailyRow = {
  day: string
  kcal: number
  protein_g: number
  carbs_g: number
  fat_g: number
  entries: number
} & Record<string, unknown>

export const statsRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', app.authenticate)

  /**
   * One row per calendar day in [from, to] — including empty days, which the
   * bar chart needs as gaps rather than as missing bars.
   */
  app.get('/daily', async (request) => {
    const { from, to } = rangeQuery.parse(request.query)
    const userId = request.user.sub

    const rows = await db.execute<DailyRow>(raw`
      select
        to_char(d.day, 'YYYY-MM-DD') as day,
        coalesce(sum(e.kcal), 0)::float as kcal,
        coalesce(sum(e.protein_g), 0)::float as protein_g,
        coalesce(sum(e.carbs_g), 0)::float as carbs_g,
        coalesce(sum(e.fat_g), 0)::float as fat_g,
        count(e.id)::int as entries
      from generate_series(${from}::date, ${to}::date, interval '1 day') as d(day)
      left join diary_entries e
        on e.day = d.day and e.user_id = ${userId}
      group by d.day
      order by d.day asc
    `)

    const [profile] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.userId, userId))
      .limit(1)

    const days = (rows as unknown as DailyRow[]).map((r) => ({
      day: r.day,
      kcal: Math.round(r.kcal),
      proteinG: Math.round(r.protein_g * 10) / 10,
      carbsG: Math.round(r.carbs_g * 10) / 10,
      fatG: Math.round(r.fat_g * 10) / 10,
      entries: r.entries,
    }))

    const logged = days.filter((d) => d.entries > 0)
    const avg = (pick: (d: (typeof days)[number]) => number) =>
      logged.length === 0
        ? 0
        : Math.round(
            (logged.reduce((s, d) => s + pick(d), 0) / logged.length) * 10,
          ) / 10

    return {
      days,
      summary: {
        loggedDays: logged.length,
        avgKcal: Math.round(avg((d) => d.kcal)),
        avgProteinG: avg((d) => d.proteinG),
        avgCarbsG: avg((d) => d.carbsG),
        avgFatG: avg((d) => d.fatG),
        /** Days that landed inside the target band — the streak-ish metric. */
        daysInRange: profile
          ? logged.filter(
              (d) =>
                d.kcal >= profile.targetKcalMin && d.kcal <= profile.targetKcalMax,
            ).length
          : 0,
      },
      targets: profile
        ? {
            kcal: profile.targetKcal,
            kcalMin: profile.targetKcalMin,
            kcalMax: profile.targetKcalMax,
            proteinG: profile.targetProteinG,
            carbsG: profile.targetCarbsG,
            fatG: profile.targetFatG,
          }
        : null,
    }
  })
}
