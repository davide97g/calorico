import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  addDaysISO,
  dayOf,
  daysUntil,
  isFutureDay,
  labelForDay,
  lastNDays,
  toISODay,
  todayISO,
} from './date'

afterEach(() => {
  vi.useRealTimers()
})

describe('toISODay', () => {
  /**
   * The bug this exists for: toISOString() converts to UTC first, so at 00:30
   * in Rome it hands back yesterday and the entry lands on the wrong day.
   */
  it('uses local time, not UTC', () => {
    // 23:59 local. toISOString() would already be tomorrow anywhere west of
    // Greenwich, which is how an entry ends up on the wrong day.
    expect(toISODay(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
    expect(toISODay(new Date(2026, 0, 5, 0, 1))).toBe('2026-01-05')
  })

  it('pads month and day to two digits', () => {
    expect(toISODay(new Date(2026, 8, 9, 12))).toBe('2026-09-09')
  })
})

describe('addDaysISO', () => {
  it('moves forwards and backwards', () => {
    expect(addDaysISO('2026-08-06', 1)).toBe('2026-08-07')
    expect(addDaysISO('2026-08-06', -1)).toBe('2026-08-05')
  })

  it('crosses month and year boundaries', () => {
    expect(addDaysISO('2026-08-31', 1)).toBe('2026-09-01')
    expect(addDaysISO('2026-01-01', -1)).toBe('2025-12-31')
  })

  it('knows February in a leap year', () => {
    expect(addDaysISO('2028-02-28', 1)).toBe('2028-02-29')
    expect(addDaysISO('2026-02-28', 1)).toBe('2026-03-01')
  })
})

describe('daysUntil', () => {
  it('counts whole calendar days in both directions', () => {
    expect(daysUntil('2026-08-07', '2026-08-06')).toBe(1)
    expect(daysUntil('2026-08-06', '2026-08-06')).toBe(0)
    expect(daysUntil('2026-08-03', '2026-08-06')).toBe(-3)
    expect(daysUntil('2026-09-05', '2026-08-06')).toBe(30)
  })

  /**
   * The reason it goes through Date.UTC: the clocks move on 2026-03-29 in
   * Rome, so a local-time subtraction returns 23 hours and floors to 0.
   */
  it('survives a daylight-saving change inside the span', () => {
    expect(daysUntil('2026-03-29', '2026-03-28')).toBe(1)
    expect(daysUntil('2026-10-26', '2026-10-25')).toBe(1)
  })

  it('defaults to counting from today', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 7, 6, 10, 0))
    expect(daysUntil('2026-08-09')).toBe(3)
  })
})

describe('todayISO and isFutureDay', () => {
  it('reads the clock', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 7, 6, 10, 0))

    expect(todayISO()).toBe('2026-08-06')
    expect(isFutureDay('2026-08-07')).toBe(true)
    expect(isFutureDay('2026-08-06')).toBe(false)
    expect(isFutureDay('2026-08-05')).toBe(false)
  })
})

describe('labelForDay', () => {
  it('names today and yesterday, dates the rest', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 7, 6, 10, 0))

    expect(labelForDay('2026-08-06')).toBe('Oggi')
    expect(labelForDay('2026-08-07')).toBe('Domani')
    expect(labelForDay('2026-08-05')).toBe('Ieri')
    expect(labelForDay('2026-08-01')).toMatch(/ago/)
  })
})

describe('lastNDays', () => {
  it('includes the end day in the count', () => {
    expect(lastNDays(7, '2026-08-06')).toEqual({
      from: '2026-07-31',
      to: '2026-08-06',
    })
    expect(lastNDays(1, '2026-08-06')).toEqual({
      from: '2026-08-06',
      to: '2026-08-06',
    })
  })
})

describe('dayOf', () => {
  it('reduces a timestamp to its calendar day', () => {
    expect(dayOf('2026-08-06T14:32:00')).toBe('2026-08-06')
  })
})
