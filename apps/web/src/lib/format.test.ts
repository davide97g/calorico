import { describe, expect, it } from 'vitest'
import {
  clockTime,
  currentMeal,
  parseClockTime,
  progress,
  signed,
  truncate,
  weekdaysLabel,
} from './format'

describe('currentMeal', () => {
  it('picks the meal from the hour', () => {
    const at = (hour: number) => currentMeal(new Date(2026, 7, 6, hour, 0))
    expect(at(8)).toBe('breakfast')
    expect(at(13)).toBe('lunch')
    expect(at(16)).toBe('snack')
    expect(at(20)).toBe('dinner')
    // Anything before 11 counts as breakfast, small hours included.
    expect(at(2)).toBe('breakfast')
  })
})

describe('progress', () => {
  it('is a percentage of the target', () => {
    expect(progress(500, 2000)).toBe(25)
    expect(progress(2000, 2000)).toBe(100)
  })

  it('does not divide by zero', () => {
    expect(Number.isFinite(progress(500, 0))).toBe(true)
  })
})

describe('signed', () => {
  /** Italian formatting: decimal comma, and a real minus sign, not a hyphen. */
  it('always shows the sign', () => {
    expect(signed(1.25)).toBe('+1,3')
    expect(signed(-1.25)).toBe('−1,3')
  })

  it('shows no sign at zero', () => {
    expect(signed(0)).toBe('0')
  })

  it('drops the decimals when asked', () => {
    expect(signed(1.6, 0)).toBe('+2')
  })
})

describe('truncate', () => {
  it('leaves a short string alone', () => {
    expect(truncate('Latte')).toBe('Latte')
  })

  it('shortens a long one and marks it', () => {
    const long = 'a'.repeat(80)
    const short = truncate(long, 10)
    expect(short.length).toBeLessThanOrEqual(11)
    expect(short).not.toBe(long)
  })
})

describe('clockTime', () => {
  it('renders minutes since midnight the way a time input wants', () => {
    expect(clockTime(0)).toBe('00:00')
    expect(clockTime(780)).toBe('13:00')
    expect(clockTime(1290)).toBe('21:30')
  })

  it('clamps instead of rolling over into the next day', () => {
    expect(clockTime(-5)).toBe('00:00')
    expect(clockTime(2000)).toBe('23:59')
  })
})

describe('parseClockTime', () => {
  it('reads a time field', () => {
    expect(parseClockTime('07:30')).toBe(450)
    expect(parseClockTime('23:59')).toBe(1439)
  })

  /** A half-typed or cleared field must not become minute zero. */
  it('rejects anything that is not a real time', () => {
    expect(parseClockTime('')).toBeNull()
    expect(parseClockTime('7')).toBeNull()
    expect(parseClockTime('24:00')).toBeNull()
    expect(parseClockTime('12:60')).toBeNull()
  })
})

describe('weekdaysLabel', () => {
  it('names the sets worth naming', () => {
    expect(weekdaysLabel([0, 1, 2, 3, 4, 5, 6])).toBe('Tutti i giorni')
    expect(weekdaysLabel([1, 2, 3, 4, 5])).toBe('Da lunedì a venerdì')
    expect(weekdaysLabel([0, 6])).toBe('Sabato e domenica')
  })

  /** Otherwise the list reads Monday first, not Sunday first like the numbers. */
  it('lists the rest starting from Monday', () => {
    expect(weekdaysLabel([0, 1, 3])).toBe('lun, mer, dom')
  })
})
