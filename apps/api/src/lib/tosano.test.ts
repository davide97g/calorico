import { describe, expect, it } from 'vitest'
import {
  mapTosanoProduct,
  parseNutritionTable,
  parsePackSize,
  titleCase,
  type TosanoProduct,
} from './tosano.js'

/**
 * The label table is typed by hand, per product, by whoever loaded it into the
 * supermarket's back office — so these are the shapes seen in the wild, not a
 * documented format.
 */
const nutellaBiscuits = `<table><tbody>
<tr><th></th><th>Per 100g</th><th>Per porzione***</th><th>%**</th></tr>
<tr><td>Energia</td><td>2158 kJ / 515 kcal</td><td>297 kJ / 71 kcal</td><td>4</td></tr>
<tr><td>Grassi</td><td>24,8 g</td><td>3,4 g</td><td>5</td></tr>
<tr><td>di cui acidi grassi saturi</td><td>11,5 g</td><td>1,6 g</td><td>8</td></tr>
<tr><td>Carboidrati</td><td>64,0 g</td><td>8,8 g</td><td>3</td></tr>
<tr><td>di cui zuccheri</td><td>35,8 g</td><td>4,9 g</td><td>5</td></tr>
<tr><td>Proteine</td><td>7,9 g</td><td>1,1 g</td><td>2</td></tr>
<tr><td>Sale</td><td>0,60 g</td><td>0,08 g</td><td>1</td></tr>
</tbody></table>`

describe('parseNutritionTable', () => {
  it('reads the per-100 column and ignores the portion next to it', () => {
    expect(parseNutritionTable(nutellaBiscuits)).toEqual({
      kcal: 515,
      protein: 7.9,
      carbs: 64,
      sugars: 35.8,
      fat: 24.8,
      satFat: 11.5,
      fiber: null,
      salt: 0.6,
    })
  })

  it('keeps saturated fat out of the fat row, and sugars out of the carbs', () => {
    const values = parseNutritionTable(nutellaBiscuits)
    expect(values?.fat).toBe(24.8)
    expect(values?.carbs).toBe(64)
  })

  it('takes the kcal figure whatever separator sits next to the kJ one', () => {
    const energy = (text: string) =>
      parseNutritionTable(
        `<table><tr><td>Energia</td><td>${text}</td></tr></table>`,
      )?.kcal
    expect(energy('261kJ/62kcal')).toBe(62)
    expect(energy('141 kJ - 33 kcal')).toBe(33)
    // kJ alone is still an answer, converted.
    expect(energy('1000 kJ')).toBeCloseTo(239, 0)
  })

  it('follows the header when the per-100 column is not the first one', () => {
    const perPortionFirst = `<table>
      <tr><th>Valori medi</th><th>Per porzione</th><th>Per 100 ml</th></tr>
      <tr><td>Energia</td><td>90 kcal</td><td>45 kcal</td></tr>
    </table>`
    expect(parseNutritionTable(perPortionFirst)?.kcal).toBe(45)
  })

  it('returns null rather than an empty shell', () => {
    expect(parseNutritionTable(undefined)).toBeNull()
    expect(parseNutritionTable('<p>Vedi confezione</p>')).toBeNull()
  })
})

describe('parsePackSize', () => {
  it('reads the unit-first format the site prints', () => {
    expect(parsePackSize('GR. 304')).toEqual({ sizeG: 304, liquid: false })
    expect(parsePackSize('KG. 1')).toEqual({ sizeG: 1000, liquid: false })
    expect(parsePackSize('ML. 330')).toEqual({ sizeG: 330, liquid: true })
    expect(parsePackSize('LT. 1,5')).toEqual({ sizeG: 1500, liquid: true })
  })

  it('gives the size of one piece of a multipack, not of the wrap', () => {
    expect(parsePackSize('ML. 330 X 6 PZ.')).toEqual({
      sizeG: 330,
      liquid: true,
    })
    expect(parsePackSize('GR. 125 X 2 PZ.')).toEqual({
      sizeG: 125,
      liquid: false,
    })
  })

  it('ignores what it cannot weigh', () => {
    expect(parsePackSize('PZ. 6')).toBeNull()
    expect(parsePackSize('CONF. FAMIGLIA')).toBeNull()
    expect(parsePackSize(undefined)).toBeNull()
  })
})

describe('titleCase', () => {
  it('stops the catalogue from shouting', () => {
    expect(titleCase('COCA COLA ZERO ZUCCHERI')).toBe('Coca Cola Zero Zuccheri')
    expect(titleCase('PASTA MISTA N.82')).toBe('Pasta Mista N.82')
  })

  it('leaves a name that was typed properly alone', () => {
    expect(titleCase('Yogurt greco 0%')).toBe('Yogurt greco 0%')
  })
})

const biscuits: TosanoProduct = {
  productId: 902108,
  name: 'NUTELLA BISCUITS',
  shortDescr: 'NUTELLA',
  description: 'GR. 304',
  slug: 'nutella-biscuits-gr304',
  barcode: '8000500310427',
  vendor: { name: 'NUTELLA' },
  mediaURLMedium: 'https://www.latuaspesa.com/photo/0228451.jpg',
  breadCrumbs: [
    { name: 'COLAZIONE E MERENDA' },
    { name: 'BISCOTTI FROLLINI' },
  ],
  unitMeasureBaseSelling: { um: 'KG' },
  metaData: { product_description: { nutritional_values: nutellaBiscuits } },
}

describe('mapTosanoProduct', () => {
  it('turns a product detail into a loggable row', () => {
    expect(mapTosanoProduct(biscuits)).toMatchObject({
      source: 'tosano',
      barcode: '8000500310427',
      name: 'Nutella Biscuits',
      brand: 'Nutella',
      category: 'Biscotti Frollini',
      kcal100: 515,
      protein100: 7.9,
      carbs100: 64,
      fat100: 24.8,
      packageSizeG: 304,
      packageSizeLabel: 'GR. 304',
      unit: 'g',
      isLiquid: false,
    })
  })

  it('reads drinkable off the printed pack, not off the selling unit', () => {
    const milk = {
      ...biscuits,
      description: 'LT. 1',
      // As Parmalat's UHT milk is really filed: a litre, sold by the kilo.
      unitMeasureBaseSelling: { um: 'KG' },
    }
    expect(mapTosanoProduct(milk)).toMatchObject({
      unit: 'ml',
      isLiquid: true,
      packageSizeG: 1000,
    })
  })

  it('falls back to the selling unit when the pack size is unparseable', () => {
    const looseFruit = {
      ...biscuits,
      description: 'AL PEZZO',
      unitMeasureBaseSelling: { um: 'L' },
    }
    expect(mapTosanoProduct(looseFruit)).toMatchObject({
      unit: 'ml',
      isLiquid: true,
      packageSizeG: null,
    })
  })

  it('drops the three products in four that carry no label table', () => {
    const { metaData: _metaData, ...bare } = biscuits
    expect(mapTosanoProduct(bare)).toBeNull()
  })

  it('drops a table whose energy is off by a decimal point', () => {
    const wrong = {
      ...biscuits,
      metaData: {
        product_description: {
          nutritional_values:
            '<table><tr><td>Energia</td><td>5150 kcal</td></tr></table>',
        },
      },
    }
    expect(mapTosanoProduct(wrong)).toBeNull()
  })
})
