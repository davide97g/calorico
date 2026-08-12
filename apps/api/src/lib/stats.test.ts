import { describe, expect, it } from 'vitest'
import {
  bucketPeriods,
  computeStreaks,
  mealShares,
  shiftDay,
  type KcalBand,
  type PeriodBucket,
  type StatsDay,
  type WeighIn,
} from './stats.js'

/** Most cases assert on one bucket; this keeps every one of them off `[0]!`. */
function bucketPeriodsOrThrow(
  days: StatsDay[],
  weighIns: WeighIn[] = [],
  band: KcalBand | null = null,
): PeriodBucket {
  const [first] = bucketPeriods(days, weighIns, band)
  if (!first) throw new Error('expected at least one bucket')
  return first
}

const day = (
  date: string,
  bucket: string,
  kcal: number,
  entries = kcal > 0 ? 1 : 0,
): StatsDay => ({
  day: date,
  bucket,
  kcal,
  proteinG: kcal / 10,
  carbsG: kcal / 8,
  fatG: kcal / 20,
  fiberG: 2,
  entries,
})

describe('shiftDay', () => {
  it('crosses month and year ends', () => {
    expect(shiftDay('2026-01-31', 1)).toBe('2026-02-01')
    expect(shiftDay('2026-03-01', -1)).toBe('2026-02-28')
    expect(shiftDay('2026-01-01', -1)).toBe('2025-12-31')
  })

  it('survives a spring-forward DST boundary', () => {
    // Italy moves the clock on 29 March 2026; local-time arithmetic would land
    // this on the 28th at 23:00 and round the wrong way.
    expect(shiftDay('2026-03-28', 1)).toBe('2026-03-29')
    expect(shiftDay('2026-03-29', 1)).toBe('2026-03-30')
  })
})

describe('bucketPeriods', () => {
  const week = '2026-08-03'
  const days = [
    day('2026-08-03', week, 2100),
    day('2026-08-04', week, 0),
    day('2026-08-05', week, 1700),
  ]

  it('averages over logged days, not calendar days', () => {
    const bucket = bucketPeriodsOrThrow(days)
    expect(bucket.days).toBe(3)
    expect(bucket.loggedDays).toBe(2)
    expect(bucket.avgKcal).toBe(1900)
    expect(bucket.totalKcal).toBe(3800)
  })

  it('keeps the bucket key even when the range starts mid-bucket', () => {
    const bucket = bucketPeriodsOrThrow(days.slice(1))
    expect(bucket.key).toBe(week)
    expect(bucket.from).toBe('2026-08-04')
    expect(bucket.to).toBe('2026-08-05')
  })

  it('classifies logged days against the target band', () => {
    const bucket = bucketPeriodsOrThrow(days, [], { min: 1800, max: 2200 })
    expect(bucket.daysInRange).toBe(1)
    expect(bucket.daysUnder).toBe(1)
    expect(bucket.daysOver).toBe(0)
  })

  it('ignores empty days when picking the extremes', () => {
    const bucket = bucketPeriodsOrThrow(days)
    expect(bucket.lightestDay).toEqual({ day: '2026-08-05', kcal: 1700 })
    expect(bucket.heaviestDay).toEqual({ day: '2026-08-03', kcal: 2100 })
  })

  it('spans the weigh-ins that fall inside the bucket only', () => {
    const bucket = bucketPeriodsOrThrow(days, [
      { day: '2026-08-02', weightKg: 80 },
      { day: '2026-08-03', weightKg: 79.4 },
      { day: '2026-08-05', weightKg: 78.9 },
    ])
    expect(bucket.weight).toEqual({
      startKg: 79.4,
      endKg: 78.9,
      changeKg: -0.5,
      avgKg: 79.2,
      count: 2,
    })
  })

  it('splits consecutive buckets and preserves their order', () => {
    const buckets = bucketPeriods([
      day('2026-07-27', '2026-07-27', 1000),
      day('2026-08-03', week, 2000),
    ])
    expect(buckets.map((b) => b.key)).toEqual(['2026-07-27', week])
  })

  it('reports zeroes rather than NaN for a bucket with nothing in it', () => {
    const bucket = bucketPeriodsOrThrow([day('2026-08-04', week, 0)])
    expect(bucket.avgKcal).toBe(0)
    expect(bucket.weight).toBeNull()
    expect(bucket.lightestDay).toBeNull()
  })
})

describe('computeStreaks', () => {
  it('counts a run that ends today', () => {
    const streak = computeStreaks(
      ['2026-08-10', '2026-08-11', '2026-08-12'],
      '2026-08-12',
    )
    expect(streak.current).toBe(3)
    expect(streak.longest).toBe(3)
    expect(streak.lastLoggedDay).toBe('2026-08-12')
  })

  it('does not break the streak on a day still in progress', () => {
    const streak = computeStreaks(['2026-08-10', '2026-08-11'], '2026-08-12')
    expect(streak.current).toBe(2)
  })

  it('breaks once a whole day was missed', () => {
    const streak = computeStreaks(['2026-08-09', '2026-08-10'], '2026-08-12')
    expect(streak.current).toBe(0)
    expect(streak.longest).toBe(2)
  })

  it('keeps the longest past run when the current one is shorter', () => {
    const streak = computeStreaks(
      [
        '2026-07-01',
        '2026-07-02',
        '2026-07-03',
        '2026-07-04',
        '2026-08-11',
        '2026-08-12',
      ],
      '2026-08-12',
    )
    expect(streak.current).toBe(2)
    expect(streak.longest).toBe(4)
  })

  it('is empty for an account that never logged', () => {
    expect(computeStreaks([], '2026-08-12')).toEqual({
      current: 0,
      longest: 0,
      lastLoggedDay: null,
    })
  })
})

describe('mealShares', () => {
  it('shares out the calories and averages over the days a meal was eaten', () => {
    const shares = mealShares([
      { meal: 'lunch', kcal: 6000, entries: 12, days: 6 },
      { meal: 'dinner', kcal: 4000, entries: 8, days: 4 },
    ])
    const lunch = shares.find((s) => s.meal === 'lunch')!
    expect(lunch.share).toBe(60)
    expect(lunch.avgKcal).toBe(1000)
    expect(shares.find((s) => s.meal === 'dinner')!.avgKcal).toBe(1000)
  })

  it('lists every meal, including the ones never logged', () => {
    const shares = mealShares([{ meal: 'lunch', kcal: 500, entries: 1, days: 1 }])
    expect(shares.map((s) => s.meal)).toEqual([
      'breakfast',
      'lunch',
      'dinner',
      'snack',
    ])
    expect(shares.find((s) => s.meal === 'breakfast')).toMatchObject({
      kcal: 0,
      share: 0,
      avgKcal: 0,
    })
  })
})
