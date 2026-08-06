import { describe, expect, it } from 'vitest'
import {
  isLiquidProduct,
  mapOffProduct,
  parsePackageSize,
  parseServingGrams,
} from './off.js'

describe('parseServingGrams', () => {
  it('trusts serving_quantity when it looks sane', () => {
    expect(parseServingGrams('30 g', 30)).toBe(30)
    expect(parseServingGrams(undefined, '12.5')).toBe(12.5)
  })

  it('reads grams out of free text, comma decimals included', () => {
    expect(parseServingGrams('1 biscotto (12,5 g)')).toBe(12.5)
    expect(parseServingGrams('200ml')).toBe(200)
  })

  it('ignores nonsense rather than storing it', () => {
    expect(parseServingGrams('1 bicchiere')).toBeNull()
    expect(parseServingGrams(undefined, 0)).toBeNull()
    // 5 kg written as grams is a data-entry mistake, not a serving.
    expect(parseServingGrams('5000 g')).toBeNull()
  })
})

describe('parsePackageSize', () => {
  it('normalises volume units to millilitres', () => {
    expect(parsePackageSize('1,5 l')).toBe(1500)
    expect(parsePackageSize('33 cl')).toBe(330)
    expect(parsePackageSize('5 dl')).toBe(500)
    expect(parsePackageSize('250 g')).toBe(250)
  })

  it('rejects a size no supermarket pack has', () => {
    expect(parsePackageSize('25 l')).toBeNull()
    expect(parsePackageSize('famiglia')).toBeNull()
    expect(parsePackageSize(undefined)).toBeNull()
  })
})

describe('isLiquidProduct', () => {
  it('recognises a drink from its category tag', () => {
    expect(isLiquidProduct({ categories_tags: ['en:sodas'] })).toBe(true)
  })

  /**
   * The bug this pins down: Open Food Facts files nearly every food under
   * `en:plant-based-foods-and-beverages`, which used to make sliced bread a
   * drink.
   */
  it('does not fall for the plant-based-foods-and-beverages tag', () => {
    expect(
      isLiquidProduct({
        categories_tags: ['en:plant-based-foods-and-beverages', 'en:breads'],
        quantity: '400 g',
      }),
    ).toBe(false)
  })

  it('lets a solid category win over a liquid one', () => {
    expect(
      isLiquidProduct({ categories_tags: ['en:milks', 'en:yogurts'] }),
    ).toBe(false)
  })

  it('falls back to a volume in the net quantity', () => {
    expect(isLiquidProduct({ quantity: '1,5 l' })).toBe(true)
    expect(isLiquidProduct({ quantity: '250 g' })).toBe(false)
  })
})

describe('mapOffProduct', () => {
  const product = {
    code: '  8001234567890 ',
    product_name: 'Biscotti integrali',
    brands: 'Coop, Fior Fiore',
    quantity: '400 g',
    serving_size: '2 biscotti (25 g)',
    nutriments: {
      'energy-kcal_100g': 450,
      proteins_100g: 7.5,
      carbohydrates_100g: 60,
      fat_100g: 18,
    },
  }

  it('maps a usable record to a foods row', () => {
    const row = mapOffProduct(product)
    expect(row).toMatchObject({
      source: 'off',
      barcode: '8001234567890',
      name: 'Biscotti integrali',
      brand: 'Coop',
      kcal100: 450,
      servingSizeG: 25,
      packageSizeG: 400,
      unit: 'g',
      isLiquid: false,
    })
  })

  it('prefers the Italian name and collapses whitespace', () => {
    const row = mapOffProduct({
      ...product,
      product_name_it: '  Biscotti   integrali  bio ',
    })
    expect(row?.name).toBe('Biscotti integrali bio')
  })

  it('drops a record with no name', () => {
    expect(mapOffProduct({ ...product, product_name: 'X' })).toBeNull()
    expect(mapOffProduct({ ...product, product_name: undefined })).toBeNull()
  })

  /** A 0 kcal or 3000 kcal per 100 g record would quietly wreck a day's total. */
  it('drops a record whose energy value cannot be true', () => {
    expect(
      mapOffProduct({ ...product, nutriments: { 'energy-kcal_100g': 0 } }),
    ).toBeNull()
    expect(
      mapOffProduct({ ...product, nutriments: { 'energy-kcal_100g': 3000 } }),
    ).toBeNull()
    expect(mapOffProduct({ ...product, nutriments: {} })).toBeNull()
  })

  it('derives calories from kJ when kcal is missing', () => {
    const row = mapOffProduct({
      ...product,
      nutriments: { 'energy-kj_100g': 1000 },
    })
    expect(row?.kcal100).toBeCloseTo(239.005, 2)
  })

  it('marks a drink as millilitres', () => {
    const row = mapOffProduct({
      ...product,
      product_name: 'Acqua frizzante',
      categories_tags: ['en:waters'],
      quantity: '1,5 l',
    })
    expect(row).toMatchObject({ unit: 'ml', isLiquid: true, packageSizeG: 1500 })
  })
})
