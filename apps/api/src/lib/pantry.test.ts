import { describe, expect, it } from 'vitest'
import {
  applyDelta,
  groceryRowGrams,
  isLow,
  packagesLeft,
  totalG,
  type Stock,
} from './pantry.js'

const jar = (sealedPackages: number, remainingG: number): Stock => ({
  sealedPackages,
  remainingG,
  packageSizeG: 400,
})

describe('totalG', () => {
  it('counts the sealed packages and the open one', () => {
    expect(totalG(jar(2, 150))).toBe(950)
  })

  it('is zero for an empty cupboard', () => {
    expect(totalG(jar(0, 0))).toBe(0)
  })
})

describe('applyDelta', () => {
  it('takes grams off the open package first', () => {
    expect(applyDelta(jar(1, 400), 30)).toMatchObject({
      sealedPackages: 1,
      remainingG: 370,
    })
  })

  it('opens the next package when the current one runs out', () => {
    expect(applyDelta(jar(1, 20), 50)).toMatchObject({
      sealedPackages: 0,
      remainingG: 370,
    })
  })

  it('keeps a full package open rather than sealed', () => {
    // 400 g of a 400 g jar is one jar being eaten, not one jar untouched — the
    // difference decides whether the next spoonful has anything to come out of.
    expect(applyDelta(jar(1, 0), 0.0001)).toMatchObject({ sealedPackages: 0 })
    expect(applyDelta(jar(0, 400), 0)).toMatchObject({
      sealedPackages: 0,
      remainingG: 400,
    })
  })

  it('never goes below empty', () => {
    expect(applyDelta(jar(0, 50), 500)).toMatchObject({
      sealedPackages: 0,
      remainingG: 0,
    })
  })

  it('hands grams back when the amount is negative', () => {
    // An edited or deleted diary entry. Without this, fixing a mistyped 300 g
    // would drain the cupboard for good.
    expect(applyDelta(jar(0, 100), -300)).toMatchObject({
      sealedPackages: 0,
      remainingG: 400,
    })
  })

  it('survives a float coming back from a real column', () => {
    const stock = { sealedPackages: 0, remainingG: 400.00000001, packageSizeG: 400 }
    expect(applyDelta(stock, 0)).toMatchObject({
      sealedPackages: 0,
      remainingG: 400,
    })
  })
})

describe('isLow', () => {
  it('is false while a sealed package is still behind the open one', () => {
    expect(isLow(jar(1, 0), 0.15)).toBe(false)
  })

  it('turns true on the last portion', () => {
    expect(isLow(jar(0, 61), 0.15)).toBe(false)
    expect(isLow(jar(0, 60), 0.15)).toBe(true)
  })

  it('treats an empty cupboard as low', () => {
    expect(isLow(jar(0, 0), 0.15)).toBe(true)
  })
})

describe('packagesLeft', () => {
  it('counts the open package as the fraction it is', () => {
    expect(packagesLeft(jar(2, 100))).toBe(2.25)
  })
})

describe('groceryRowGrams', () => {
  it('reads a weight off the row', () => {
    expect(groceryRowGrams({ quantity: 600, unit: 'g' })).toBe(600)
    expect(groceryRowGrams({ quantity: 1.5, unit: 'kg' })).toBe(1500)
    expect(groceryRowGrams({ quantity: 2, unit: 'l' })).toBe(2000)
  })

  it('has no weight for a count of pieces', () => {
    expect(groceryRowGrams({ quantity: 3, unit: 'pz' })).toBeNull()
  })
})
