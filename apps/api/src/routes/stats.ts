import type { FastifyPluginAsync } from 'fastify'
import { eq, sql as raw } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db/index.js'
import { profiles, type Profile } from '../db/schema.js'
import {
  bucketPeriods,
  computeStreaks,
  mealShares,
  spanDays,
  type MealTotal,
  type StatsDay,
  type WeighIn,
} from '../lib/stats.js'

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

/**
 * A phone asking for four years of days would be asking for a chart nobody can
 * read; the cap keeps one bad query from scanning a whole diary.
 */
const MAX_RANGE_DAYS = 400

const rangeQuery = z
  .object({ from: day, to: day })
  .refine((r) => r.from <= r.to, { message: 'from must not be after to' })
  .refine((r) => spanDays(r.from, r.to) <= MAX_RANGE_DAYS, {
    message: `range must not exceed ${MAX_RANGE_DAYS} days`,
  })

const periodsQuery = z.intersection(
  rangeQuery,
  z.object({ unit: z.enum(['week', 'month']) }),
)

type DailyRow = {
  day: string
  kcal: number
  protein_g: number
  carbs_g: number
  fat_g: number
  fiber_g: number
  entries: number
} & Record<string, unknown>

type BucketedRow = DailyRow & { bucket: string }

type MealRow = {
  meal: string
  kcal: number
  protein_g: number
  carbs_g: number
  fat_g: number
  fiber_g: number
  entries: number
} & Record<string, unknown>

type MealSpanRow = {
  meal: string
  kcal: number
  entries: number
  days: number
} & Record<string, unknown>

type FoodRow = {
  name: string
  brand: string | null
  kcal: number
  quantity_g: number
  times: number
  days: number
} & Record<string, unknown>

/** postgres-js hands back the rows themselves; drizzle's type says otherwise. */
const rowsOf = <T>(result: unknown) => result as unknown as T[]

const round = (n: number) => Math.round(n)
const round1 = (n: number) => Math.round(n * 10) / 10

function loadProfile(userId: string) {
  return db
    .select()
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .limit(1)
    .then((rows) => rows[0] ?? null)
}

function targetsOf(profile: Profile | null) {
  return profile
    ? {
        kcal: profile.targetKcal,
        kcalMin: profile.targetKcalMin,
        kcalMax: profile.targetKcalMax,
        proteinG: profile.targetProteinG,
        carbsG: profile.targetCarbsG,
        fatG: profile.targetFatG,
      }
    : null
}

const bandOf = (profile: Profile | null) =>
  profile ? { min: profile.targetKcalMin, max: profile.targetKcalMax } : null

/** The per-day totals every range endpoint starts from, empty days included. */
function dailyRows(userId: string, from: string, to: string) {
  return db.execute<DailyRow>(raw`
    select
      to_char(d.day, 'YYYY-MM-DD') as day,
      coalesce(sum(e.kcal), 0)::float as kcal,
      coalesce(sum(e.protein_g), 0)::float as protein_g,
      coalesce(sum(e.carbs_g), 0)::float as carbs_g,
      coalesce(sum(e.fat_g), 0)::float as fat_g,
      coalesce(sum(e.fiber_g), 0)::float as fiber_g,
      count(e.id)::int as entries
    from generate_series(${from}::date, ${to}::date, interval '1 day') as d(day)
    left join diary_entries e
      on e.day = d.day and e.user_id = ${userId}
    group by d.day
    order by d.day asc
  `)
}

export const statsRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', app.authenticate)

  /**
   * One row per calendar day in [from, to] — including empty days, which the
   * bar chart needs as gaps rather than as missing bars.
   */
  app.get('/daily', async (request) => {
    const { from, to } = rangeQuery.parse(request.query)
    const userId = request.user.sub

    const [rows, profile] = await Promise.all([
      dailyRows(userId, from, to),
      loadProfile(userId),
    ])

    const days = rowsOf<DailyRow>(rows).map((r) => ({
      day: r.day,
      kcal: round(r.kcal),
      proteinG: round1(r.protein_g),
      carbsG: round1(r.carbs_g),
      fatG: round1(r.fat_g),
      fiberG: round1(r.fiber_g),
      entries: r.entries,
    }))

    const logged = days.filter((d) => d.entries > 0)
    const avg = (pick: (d: (typeof days)[number]) => number) =>
      logged.length === 0
        ? 0
        : round1(logged.reduce((s, d) => s + pick(d), 0) / logged.length)

    return {
      days,
      summary: {
        loggedDays: logged.length,
        avgKcal: round(avg((d) => d.kcal)),
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
      targets: targetsOf(profile),
    }
  })

  /**
   * One day, in full: where its calories came from, and what to read them
   * against. A number on its own ("2.150 kcal") says nothing — the same figure
   * is a good day or a blown one depending on yesterday, on the week, and on
   * what this weekday usually looks like, so all three ship with it.
   */
  app.get('/day', async (request) => {
    const { day: target } = z.object({ day }).parse(request.query)
    const userId = request.user.sub

    const [mealRows, foodRows, contextRows, profile] = await Promise.all([
      db.execute<MealRow>(raw`
        select
          e.meal::text as meal,
          coalesce(sum(e.kcal), 0)::float as kcal,
          coalesce(sum(e.protein_g), 0)::float as protein_g,
          coalesce(sum(e.carbs_g), 0)::float as carbs_g,
          coalesce(sum(e.fat_g), 0)::float as fat_g,
          coalesce(sum(e.fiber_g), 0)::float as fiber_g,
          count(*)::int as entries
        from diary_entries e
        where e.user_id = ${userId} and e.day = ${target}::date
        group by e.meal
      `),
      db.execute<FoodRow>(raw`
        select
          e.name_snapshot as name,
          e.brand_snapshot as brand,
          sum(e.kcal)::float as kcal,
          sum(e.quantity_g)::float as quantity_g,
          count(*)::int as times,
          1 as days
        from diary_entries e
        where e.user_id = ${userId} and e.day = ${target}::date
        group by e.name_snapshot, e.brand_snapshot
        order by kcal desc
        limit 5
      `),
      db.execute(raw`
        with prev as (
          select coalesce(sum(kcal), 0)::float as kcal, count(*)::int as entries
          from diary_entries
          where user_id = ${userId} and day = ${target}::date - 1
        ),
        recent as (
          select avg(kcal)::float as kcal, count(*)::int as days
          from (
            select day, sum(kcal) as kcal
            from diary_entries
            where user_id = ${userId}
              and day >= ${target}::date - 7
              and day < ${target}::date
            group by day
          ) t
        ),
        weekday as (
          select avg(kcal)::float as kcal, count(*)::int as days
          from (
            select day, sum(kcal) as kcal
            from diary_entries
            where user_id = ${userId}
              and day < ${target}::date
              and day >= ${target}::date - 28
              and extract(dow from day) = extract(dow from ${target}::date)
            group by day
          ) t
        )
        select
          prev.kcal as prev_kcal,
          prev.entries as prev_entries,
          recent.kcal as recent_kcal,
          recent.days as recent_days,
          weekday.kcal as weekday_kcal,
          weekday.days as weekday_days
        from prev, recent, weekday
      `),
      loadProfile(userId),
    ])

    const meals = rowsOf<MealRow>(mealRows)
    const context =
      rowsOf<{
        prev_kcal: number
        prev_entries: number
        recent_kcal: number | null
        recent_days: number
        weekday_kcal: number | null
        weekday_days: number
      }>(contextRows)[0] ?? null

    const sum = (pick: (m: MealRow) => number) =>
      meals.reduce((s, m) => s + pick(m), 0)

    return {
      day: target,
      totals: {
        kcal: round(sum((m) => m.kcal)),
        proteinG: round1(sum((m) => m.protein_g)),
        carbsG: round1(sum((m) => m.carbs_g)),
        fatG: round1(sum((m) => m.fat_g)),
        fiberG: round1(sum((m) => m.fiber_g)),
        entries: sum((m) => m.entries),
      },
      byMeal: mealShares(
        meals.map(
          (m): MealTotal => ({
            meal: m.meal,
            kcal: m.kcal,
            entries: m.entries,
            days: m.entries > 0 ? 1 : 0,
          }),
        ),
      ).map((share) => {
        const row = meals.find((m) => m.meal === share.meal)
        return {
          ...share,
          proteinG: round1(row?.protein_g ?? 0),
          carbsG: round1(row?.carbs_g ?? 0),
          fatG: round1(row?.fat_g ?? 0),
        }
      }),
      topFoods: rowsOf<FoodRow>(foodRows).map((f) => ({
        name: f.name,
        brand: f.brand,
        kcal: round(f.kcal),
        quantityG: round(f.quantity_g),
        times: f.times,
      })),
      /** Null where there is nothing to compare against, not zero. */
      context: {
        prevDayKcal:
          context && context.prev_entries > 0 ? round(context.prev_kcal) : null,
        recentAvgKcal:
          context?.recent_kcal == null ? null : round(context.recent_kcal),
        recentDays: context?.recent_days ?? 0,
        weekdayAvgKcal:
          context?.weekday_kcal == null ? null : round(context.weekday_kcal),
        weekdayDays: context?.weekday_days ?? 0,
      },
      targets: targetsOf(profile),
    }
  })

  /**
   * The same days folded into weeks or months. Postgres decides the bucket a
   * day belongs to — `date_trunc('week', …)` starts on Monday, which is the
   * week this app's users live in — and the running bucket simply stops at
   * whatever `to` the client asked for, so "this week" is 3 days when it is
   * Wednesday and the averages know it.
   */
  app.get('/periods', async (request) => {
    const { from, to, unit } = periodsQuery.parse(request.query)
    const userId = request.user.sub

    const [rows, weightRows, profile] = await Promise.all([
      db.execute<BucketedRow>(raw`
        select
          to_char(date_trunc(${unit}::text, d.day)::date, 'YYYY-MM-DD') as bucket,
          to_char(d.day, 'YYYY-MM-DD') as day,
          coalesce(sum(e.kcal), 0)::float as kcal,
          coalesce(sum(e.protein_g), 0)::float as protein_g,
          coalesce(sum(e.carbs_g), 0)::float as carbs_g,
          coalesce(sum(e.fat_g), 0)::float as fat_g,
          coalesce(sum(e.fiber_g), 0)::float as fiber_g,
          count(e.id)::int as entries
        from generate_series(${from}::date, ${to}::date, interval '1 day') as d(day)
        left join diary_entries e
          on e.day = d.day and e.user_id = ${userId}
        group by 1, d.day
        order by d.day asc
      `),
      db.execute(raw`
        select to_char(day, 'YYYY-MM-DD') as day, weight_kg::float as weight_kg
        from weight_logs
        where user_id = ${userId} and day between ${from}::date and ${to}::date
        order by day asc
      `),
      loadProfile(userId),
    ])

    const days = rowsOf<BucketedRow>(rows).map(
      (r): StatsDay => ({
        day: r.day,
        bucket: r.bucket,
        kcal: r.kcal,
        proteinG: r.protein_g,
        carbsG: r.carbs_g,
        fatG: r.fat_g,
        fiberG: r.fiber_g,
        entries: r.entries,
      }),
    )
    const weighIns = rowsOf<{ day: string; weight_kg: number }>(weightRows).map(
      (w): WeighIn => ({ day: w.day, weightKg: w.weight_kg }),
    )

    return {
      unit,
      buckets: bucketPeriods(days, weighIns, bandOf(profile)),
      targets: targetsOf(profile),
    }
  })

  /**
   * The cross-cutting view of a range: which meals the calories arrive in,
   * which weekdays run high, which foods carry the period, and how unbroken the
   * logging has been. None of it is per-day — this is what a week or a month
   * looks like as one shape.
   */
  app.get('/breakdown', async (request) => {
    const { from, to } = rangeQuery.parse(request.query)
    const userId = request.user.sub

    const [totalRows, mealRows, weekdayRows, foodRows, loggedRows] =
      await Promise.all([
        db.execute(raw`
          select
            coalesce(sum(kcal), 0)::float as kcal,
            count(*)::int as entries,
            count(distinct day)::int as logged_days
          from diary_entries
          where user_id = ${userId} and day between ${from}::date and ${to}::date
        `),
        db.execute<MealSpanRow>(raw`
          select
            meal::text as meal,
            sum(kcal)::float as kcal,
            count(*)::int as entries,
            count(distinct day)::int as days
          from diary_entries
          where user_id = ${userId} and day between ${from}::date and ${to}::date
          group by meal
        `),
        db.execute(raw`
          select
            extract(dow from day)::int as dow,
            sum(kcal)::float as kcal,
            count(distinct day)::int as days
          from diary_entries
          where user_id = ${userId} and day between ${from}::date and ${to}::date
          group by 1
        `),
        db.execute<FoodRow>(raw`
          select
            name_snapshot as name,
            brand_snapshot as brand,
            sum(kcal)::float as kcal,
            sum(quantity_g)::float as quantity_g,
            count(*)::int as times,
            count(distinct day)::int as days
          from diary_entries
          where user_id = ${userId} and day between ${from}::date and ${to}::date
          group by 1, 2
          order by kcal desc
          limit 8
        `),
        /**
         * A year of logged days, not just the range: a streak that started in
         * March is still a streak when the chart is showing May.
         */
        db.execute(raw`
          select to_char(day, 'YYYY-MM-DD') as day
          from diary_entries
          where user_id = ${userId}
            and day <= ${to}::date
            and day > ${to}::date - 400
          group by day
          order by day asc
        `),
      ])

    const totals = rowsOf<{
      kcal: number
      entries: number
      logged_days: number
    }>(totalRows)[0]
    const weekdays = rowsOf<{ dow: number; kcal: number; days: number }>(
      weekdayRows,
    )
    const loggedDays = rowsOf<{ day: string }>(loggedRows).map((r) => r.day)
    const totalKcal = totals?.kcal ?? 0
    const days = spanDays(from, to)

    return {
      from,
      to,
      days,
      loggedDays: totals?.logged_days ?? 0,
      entries: totals?.entries ?? 0,
      totalKcal: round(totalKcal),
      /** Percent of calendar days with at least one entry. */
      coverage: days === 0 ? 0 : round1(((totals?.logged_days ?? 0) / days) * 100),
      mealSplit: mealShares(
        rowsOf<MealSpanRow>(mealRows).map(
          (m): MealTotal => ({
            meal: m.meal,
            kcal: m.kcal,
            entries: m.entries,
            days: m.days,
          }),
        ),
      ),
      /** Sunday-first, the way `extract(dow)` and the app's weekday arrays index. */
      weekdayPattern: Array.from({ length: 7 }, (_, dow) => {
        const row = weekdays.find((w) => w.dow === dow)
        return {
          dow,
          avgKcal: row && row.days > 0 ? round(row.kcal / row.days) : 0,
          loggedDays: row?.days ?? 0,
        }
      }),
      topFoods: rowsOf<FoodRow>(foodRows).map((f) => ({
        name: f.name,
        brand: f.brand,
        kcal: round(f.kcal),
        quantityG: round(f.quantity_g),
        times: f.times,
        days: f.days,
        share: totalKcal > 0 ? round1((f.kcal / totalKcal) * 100) : 0,
      })),
      streak: computeStreaks(loggedDays, to),
    }
  })
}
