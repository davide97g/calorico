import { describe, expect, it } from 'vitest'
import { foodEmoji } from './food-emoji'

describe('foodEmoji', () => {
  it('matches on the food name', () => {
    expect(foodEmoji('Latte intero')).toBe('🥛')
    expect(foodEmoji('Banana')).toBe('🍌')
  })

  it('ignores case and accents', () => {
    expect(foodEmoji('CAFFÈ')).toBe(foodEmoji('caffe'))
  })

  it('falls back to the category when the name says nothing', () => {
    const byCategory = foodEmoji('Prodotto 4321', 'en:beverages')
    expect(byCategory).not.toBe('🍽️')
  })

  it('prefers the name over the category', () => {
    // A yogurt filed under beverages is still a yogurt.
    expect(foodEmoji('Yogurt greco', 'en:beverages')).toBe(
      foodEmoji('Yogurt greco'),
    )
  })

  it('returns the plate for something it cannot place', () => {
    expect(foodEmoji('Zqxwv 9981')).toBe('🍽️')
    expect(foodEmoji('')).toBe('🍽️')
  })

  it('always returns a single emoji', () => {
    for (const name of ['Pane', 'Mela', 'Qualunque cosa', '']) {
      expect(foodEmoji(name).length).toBeGreaterThan(0)
    }
  })
})
