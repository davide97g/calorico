import { describe, expect, it } from 'vitest'
import { currentMeal, progress, signed, truncate } from './format'

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
