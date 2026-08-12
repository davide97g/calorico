/**
 * The arithmetic behind the stats screen, kept out of SQL so it can be tested
 * without a database — and so the calendar work stays where calendars are
 * cheap. Postgres decides which week or month a day belongs to (its `week`
 * starts on Monday, which is the week an Italian reads); this module only adds
 * up the days it is handed.
 *
 * Two rules run through everything here:
 *
 *   - Averages are per *logged* day, never per calendar day. A month with three
 *     untracked days is not a month of eating 200 kcal less.
 *   - An empty day is still a row. Coverage ("22 of 30 days") is a statistic in
 *     its own right, and a gap in the bars has to be visible as a gap.
 */

/** One calendar day, with the bucket Postgres assigned it. */
export interface StatsDay {
  day: string
  /** First day of the week or month this day falls in, `YYYY-MM-DD`. */
  bucket: string
  kcal: number
  proteinG: number
  carbsG: number
  fatG: number
  fiberG: number
  sugarsG: number
  satFatG: number
  saltG: number
  entries: number
}

export interface KcalBand {
  min: number
  max: number
}

export interface WeighIn {
  day: string
  weightKg: number
}

/** What the scale did across one bucket. Null when it was never stepped on. */
export interface WeightSpan {
  startKg: number
  endKg: number
  changeKg: number
  avgKg: number
  count: number
}

export interface DailyPoint {
  day: string
  kcal: number
  proteinG: number
  carbsG: number
  fatG: number
  entries: number
}

export interface PeriodBucket {
  /** The bucket's own start, even when the range asked for starts mid-bucket. */
  key: string
  /** First and last day actually covered — a running week stops at today. */
  from: string
  to: string
  days: number
  loggedDays: number
  entries: number
  totalKcal: number
  /** Per logged day. 0 when nothing was logged. */
  avgKcal: number
  avgProteinG: number
  avgCarbsG: number
  avgFatG: number
  avgFiberG: number
  avgSugarsG: number
  avgSatFatG: number
  avgSaltG: number
  /** Logged days inside / below / above the target band. */
  daysInRange: number
  daysUnder: number
  daysOver: number
  lightestDay: { day: string; kcal: number } | null
  heaviestDay: { day: string; kcal: number } | null
  weight: WeightSpan | null
  /** The bucket's days in order, for the mini bars under a week.  */
  dailyStats: DailyPoint[]
}

const r0 = (n: number) => Math.round(n)
const r1 = (n: number) => Math.round(n * 10) / 10

/** Calendar arithmetic on `YYYY-MM-DD`, via UTC so no DST can shift a day. */
function utcOf(day: string) {
  const [y = 1970, m = 1, d = 1] = day.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

export function shiftDay(day: string, delta: number): string {
  const at = new Date(utcOf(day) + delta * 86_400_000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${at.getUTCFullYear()}-${pad(at.getUTCMonth() + 1)}-${pad(at.getUTCDate())}`
}

/** Whole calendar days from `from` to `to`, both ends included. */
export function spanDays(from: string, to: string) {
  return Math.round((utcOf(to) - utcOf(from)) / 86_400_000) + 1
}

function weightSpan(weighIns: WeighIn[]): WeightSpan | null {
  if (weighIns.length === 0) return null
  const sorted = [...weighIns].sort((a, b) => a.day.localeCompare(b.day))
  const startKg = sorted[0]!.weightKg
  const endKg = sorted.at(-1)!.weightKg
  const sum = sorted.reduce((s, w) => s + w.weightKg, 0)
  return {
    startKg: r1(startKg),
    endKg: r1(endKg),
    changeKg: r1(endKg - startKg),
    avgKg: r1(sum / sorted.length),
    count: sorted.length,
  }
}

/**
 * Folds per-day rows into their weeks or months. `days` must be sorted; the SQL
 * that feeds this orders by day, and the bar charts read the buckets in the
 * same order.
 */
export function bucketPeriods(
  days: StatsDay[],
  weighIns: WeighIn[] = [],
  band: KcalBand | null = null,
): PeriodBucket[] {
  const order: string[] = []
  const groups = new Map<string, StatsDay[]>()

  for (const day of days) {
    const group = groups.get(day.bucket)
    if (group) group.push(day)
    else {
      groups.set(day.bucket, [day])
      order.push(day.bucket)
    }
  }

  return order.map((key) => {
    const rows = groups.get(key)!
    const logged = rows.filter((r) => r.entries > 0)
    const avg = (pick: (d: StatsDay) => number) =>
      logged.length === 0
        ? 0
        : logged.reduce((s, d) => s + pick(d), 0) / logged.length

    const byKcal = [...logged].sort((a, b) => a.kcal - b.kcal)
    const from = rows[0]!.day
    const to = rows.at(-1)!.day

    return {
      key,
      from,
      to,
      days: rows.length,
      loggedDays: logged.length,
      entries: rows.reduce((s, d) => s + d.entries, 0),
      totalKcal: r0(rows.reduce((s, d) => s + d.kcal, 0)),
      avgKcal: r0(avg((d) => d.kcal)),
      avgProteinG: r1(avg((d) => d.proteinG)),
      avgCarbsG: r1(avg((d) => d.carbsG)),
      avgFatG: r1(avg((d) => d.fatG)),
      avgFiberG: r1(avg((d) => d.fiberG)),
      avgSugarsG: r1(avg((d) => d.sugarsG)),
      avgSatFatG: r1(avg((d) => d.satFatG)),
      avgSaltG: r1(avg((d) => d.saltG)),
      daysInRange: band
        ? logged.filter((d) => d.kcal >= band.min && d.kcal <= band.max).length
        : 0,
      daysUnder: band ? logged.filter((d) => d.kcal < band.min).length : 0,
      daysOver: band ? logged.filter((d) => d.kcal > band.max).length : 0,
      lightestDay: byKcal[0]
        ? { day: byKcal[0].day, kcal: r0(byKcal[0].kcal) }
        : null,
      heaviestDay: byKcal.at(-1)
        ? { day: byKcal.at(-1)!.day, kcal: r0(byKcal.at(-1)!.kcal) }
        : null,
      weight: weightSpan(weighIns.filter((w) => w.day >= from && w.day <= to)),
      dailyStats: rows.map((d) => ({
        day: d.day,
        kcal: r0(d.kcal),
        proteinG: r1(d.proteinG),
        carbsG: r1(d.carbsG),
        fatG: r1(d.fatG),
        entries: d.entries,
      })),
    }
  })
}

export interface Streaks {
  /** Consecutive logged days up to today. */
  current: number
  longest: number
  lastLoggedDay: string | null
}

/**
 * Streaks over a list of days that have at least one entry, ascending.
 *
 * A day still in progress must not break the count: at 9am nothing is logged
 * yet, and a streak that resets every morning is a streak nobody keeps. So the
 * current run may end either on `endDay` or on the day before it.
 */
export function computeStreaks(loggedDays: string[], endDay: string): Streaks {
  if (loggedDays.length === 0) {
    return { current: 0, longest: 0, lastLoggedDay: null }
  }

  const set = new Set(loggedDays)
  const sorted = [...set].sort()

  let longest = 1
  let run = 1
  for (let i = 1; i < sorted.length; i += 1) {
    run = sorted[i] === shiftDay(sorted[i - 1]!, 1) ? run + 1 : 1
    if (run > longest) longest = run
  }

  let cursor = set.has(endDay) ? endDay : shiftDay(endDay, -1)
  let current = 0
  while (set.has(cursor)) {
    current += 1
    cursor = shiftDay(cursor, -1)
  }

  return { current, longest, lastLoggedDay: sorted.at(-1) ?? null }
}

export interface MealTotal {
  meal: string
  kcal: number
  entries: number
  days: number
}

export interface MealShare {
  meal: string
  kcal: number
  /** Percent of the period's calories, 0 when the period is empty. */
  share: number
  /** Per day this meal was actually eaten — skipping breakfast is not a diet. */
  avgKcal: number
  days: number
  entries: number
}

const MEALS = ['breakfast', 'lunch', 'dinner', 'snack'] as const

/** Every meal appears, including the ones never logged: absence is the finding. */
export function mealShares(totals: MealTotal[]): MealShare[] {
  const sum = totals.reduce((s, t) => s + t.kcal, 0)
  return MEALS.map((meal) => {
    const row = totals.find((t) => t.meal === meal)
    const kcal = row?.kcal ?? 0
    const days = row?.days ?? 0
    return {
      meal,
      kcal: r0(kcal),
      share: sum > 0 ? r1((kcal / sum) * 100) : 0,
      avgKcal: days > 0 ? r0(kcal / days) : 0,
      days,
      entries: row?.entries ?? 0,
    }
  })
}
